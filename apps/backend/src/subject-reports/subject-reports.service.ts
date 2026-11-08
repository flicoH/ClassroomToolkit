import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { TeacherContext } from '../auth/teacher-context';
import { SemesterReportsService } from '../semester-reports/semester-reports.service';
import {
  SubjectReportEntity,
  SubjectReportShareEntity,
  SubjectReportEventEntity,
  SubjectReportTokenCallEntity,
  SubjectReportSubjectEntity,
} from './subject-report.entity';
import { PetStudentEntity } from '../pet-points/entities/pet-student.entity';
import { PetEvaluationRecordEntity } from '../pet-points/entities/pet-evaluation-record.entity';
import {
  ReportTermEntity,
  ReportSubjectEntity,
  ReportDocumentEntity,
  SemesterReportEntity,
} from '../semester-reports/semester-report.entity';
import {
  defaultPerformanceConfig,
  parsePerformanceConfig,
  type PerformanceField,
} from '../semester-reports/performance-config';
import { StudentEntity } from '../students/entities/student.entity';
import { readReportShareKey } from '../semester-reports/report-share-key';
import { readReportPublicBaseUrl } from '../semester-reports/report-public-url';
import {
  generateTemplateReport,
  positiveScoreItems,
  formatShanghaiDate,
  classroomPhotosForSnapshot,
  classroomPhotoCaptionsForSnapshot,
} from '../semester-reports/report-generation';
import {
  parseCourseSelections,
  parseReportDetails,
  parseStudentFeedback,
  type StudentFeedback,
} from '../semester-reports/report-input';

/** 出勤仅接受约定枚举，避免无效值进入报告快照。 */
type Attendance = 'present' | 'excused' | 'late';

/** 在请求边界拒绝未知出勤状态，不能静默归类为正常出勤。 */
function parseAttendance(value: unknown): Attendance {
  if (value === 'present' || value === 'excused' || value === 'late')
    return value;
  throw new BadRequestException('课程出勤状态无效');
}

/** 将教师填写的日期转换为上海时区的统计边界。 */
function parsePeriodBound(date: string, exclusiveEnd: boolean): Date {
  const midnight = new Date(`${date}T00:00:00+08:00`);
  if (formatShanghaiDate(midnight) !== date || !date) {
    throw new BadRequestException('报告日期无效');
  }
  // 查询使用上海时间的左闭右开区间，包含结束日全天。
  return exclusiveEnd ? new Date(midnight.getTime() + 86_400_000) : midnight;
}

@Injectable()
export class SubjectReportsService implements OnModuleInit {
  private ensureTablesPromise: Promise<void> | null = null;

  constructor(
    @InjectRepository(SubjectReportEntity)
    private readonly reports: Repository<SubjectReportEntity>,
    @InjectRepository(SubjectReportShareEntity)
    private readonly shares: Repository<SubjectReportShareEntity>,
    @InjectRepository(SubjectReportEventEntity)
    private readonly events: Repository<SubjectReportEventEntity>,
    @InjectRepository(SubjectReportTokenCallEntity)
    private readonly tokenCalls: Repository<SubjectReportTokenCallEntity>,
    @InjectRepository(ReportTermEntity)
    private readonly terms: Repository<ReportTermEntity>,
    @InjectRepository(SubjectReportSubjectEntity)
    private readonly subjects: Repository<SubjectReportSubjectEntity>,
    @InjectRepository(ReportDocumentEntity)
    private readonly documents: Repository<ReportDocumentEntity>,
    @InjectRepository(PetStudentEntity)
    private readonly students: Repository<PetStudentEntity>,
    @InjectRepository(PetEvaluationRecordEntity)
    private readonly records: Repository<PetEvaluationRecordEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentProfiles: Repository<StudentEntity>,
    private readonly teacher: TeacherContext,
    private readonly semesterReportsService: SemesterReportsService,
    @Optional()
    @InjectRepository(ReportSubjectEntity)
    private readonly semesterSubjects?: Repository<ReportSubjectEntity>,
  ) {}

  async onModuleInit() {
    await this.ensureTables().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[SubjectReportsService] 自动初始化数据表提示:', message);
    });
  }

  async ensureTables(): Promise<void> {
    if (this.ensureTablesPromise) return this.ensureTablesPromise;
    this.ensureTablesPromise = (async () => {
      const runner = this.reports?.manager;
      if (!runner || typeof runner.query !== 'function') return;
      const statements = [
        `CREATE TABLE IF NOT EXISTS subject_reports (
          id VARCHAR(64) NOT NULL PRIMARY KEY,
          teacher_id VARCHAR(64) NOT NULL,
          term_id VARCHAR(64) NOT NULL,
          subject_id VARCHAR(64) NOT NULL,
          student_id VARCHAR(64) NOT NULL,
          student_name VARCHAR(100) NOT NULL,
          class_name VARCHAR(100) NOT NULL,
          period_type VARCHAR(16) NOT NULL,
          period_start DATETIME NOT NULL,
          period_end DATETIME NOT NULL,
          score_scope VARCHAR(16) NOT NULL DEFAULT 'overall',
          snapshot JSON NULL,
          content JSON NULL,
          ai_response JSON NULL,
          status VARCHAR(24) NOT NULL DEFAULT 'queued',
          keywords TEXT NULL,
          teacher_observation TEXT NULL,
          course_scope TEXT NULL,
          error_message VARCHAR(500) NULL,
          published_at DATETIME NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          INDEX idx_sub_reports_teacher_period (teacher_id, period_start, period_type),
          INDEX idx_sub_reports_student (teacher_id, student_id, subject_id, period_start),
          INDEX idx_sub_reports_status (status, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        `CREATE TABLE IF NOT EXISTS subject_report_shares (
          id VARCHAR(64) NOT NULL PRIMARY KEY,
          teacher_id VARCHAR(64) NOT NULL,
          report_id VARCHAR(64) NOT NULL,
          token_hash CHAR(64) NOT NULL UNIQUE,
          token_ciphertext TEXT NOT NULL,
          expires_at DATETIME NULL,
          revoked_at DATETIME NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          INDEX idx_sub_share_report (teacher_id, report_id, revoked_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        `CREATE TABLE IF NOT EXISTS subject_report_events (
          id VARCHAR(64) NOT NULL PRIMARY KEY,
          teacher_id VARCHAR(64) NOT NULL,
          report_id VARCHAR(64) NULL,
          document_id VARCHAR(64) NULL,
          action VARCHAR(40) NOT NULL,
          details JSON NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          INDEX idx_sub_events_report (teacher_id, report_id, created_at),
          INDEX idx_sub_events_doc (teacher_id, document_id, created_at),
          INDEX idx_sub_events_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        `CREATE TABLE IF NOT EXISTS subject_report_token_calls (
          id VARCHAR(64) NOT NULL PRIMARY KEY,
          report_id VARCHAR(64) NOT NULL,
          teacher_id VARCHAR(64) NOT NULL,
          student_id VARCHAR(64) NOT NULL,
          provider VARCHAR(32) NOT NULL DEFAULT 'kimi',
          model VARCHAR(64) NOT NULL,
          called_at DATETIME(6) NOT NULL,
          responded_at DATETIME(6) NULL,
          prompt_tokens INT NULL,
          completion_tokens INT NULL,
          total_tokens INT NULL,
          status VARCHAR(24) NOT NULL DEFAULT 'in_progress',
          response_id VARCHAR(128) NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          INDEX idx_srtc_sub_called_at (called_at),
          INDEX idx_srtc_sub_report_called (report_id, called_at),
          INDEX idx_srtc_sub_student_called (student_id, called_at),
          INDEX idx_srtc_sub_teacher (teacher_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        `CREATE TABLE IF NOT EXISTS subject_report_subjects (
          id VARCHAR(64) NOT NULL PRIMARY KEY,
          teacher_id VARCHAR(64) NOT NULL,
          term_id VARCHAR(64) NULL,
          name VARCHAR(100) NOT NULL,
          enabled TINYINT(1) NOT NULL DEFAULT 1,
          performance_config JSON NULL,
          course_content_titles JSON NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          INDEX idx_srs_teacher (teacher_id, enabled, name),
          INDEX idx_srs_term (teacher_id, term_id, enabled)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      ];
      for (const statement of statements) {
        await runner.query(statement);
      }
    })();
    return this.ensureTablesPromise;
  }

  private isMissingTableError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const e = err as {
      code?: string;
      message?: string;
      driverError?: { code?: string; message?: string };
    };
    return (
      e.code === 'ER_NO_SUCH_TABLE' ||
      e.driverError?.code === 'ER_NO_SUCH_TABLE' ||
      (typeof e.message === 'string' && e.message.includes("doesn't exist"))
    );
  }

  private async requireTerm(id: string) {
    const term = await this.terms.findOne({
      where: { id, teacherId: this.teacher.teacherId, enabled: true },
    });
    if (!term) throw new NotFoundException('学期不存在');
    return term;
  }

  private async requireSubject(id: string, allowDisabled = false) {
    let subject:
      | {
          id: string;
          name: string;
          enabled: boolean;
          performanceConfig: PerformanceField[] | null;
        }
      | null
      | undefined = null;
    try {
      subject = await this.subjects.findOne({
        where: {
          id,
          teacherId: this.teacher.teacherId,
          ...(allowDisabled ? {} : { enabled: true }),
        },
      });
    } catch (err) {
      if (this.isMissingTableError(err)) {
        this.ensureTablesPromise = null;
        await this.ensureTables().catch(() => {});
        try {
          subject = await this.subjects.findOne({
            where: {
              id,
              teacherId: this.teacher.teacherId,
              ...(allowDisabled ? {} : { enabled: true }),
            },
          });
        } catch {
          // ignore to allow semesterSubjects fallback
        }
      } else {
        throw err;
      }
    }
    if (!subject && this.semesterSubjects) {
      subject = await this.semesterSubjects.findOne({
        where: {
          id,
          teacherId: this.teacher.teacherId,
          ...(allowDisabled ? {} : { enabled: true }),
        },
      });
    }
    if (!subject) throw new NotFoundException('学科不存在');
    return subject;
  }

  // 基础学期与课程资料复用，学科设置与学期报告工作台独立
  listTerms() {
    return this.semesterReportsService.listTerms();
  }
  /** 学期跨工作台共用，复用同一停用及教师隔离逻辑。 */
  deleteTerm(id: string) {
    return this.semesterReportsService.deleteTerm(id);
  }
  createTerm(body: Record<string, string>) {
    return this.semesterReportsService.createTerm(body);
  }
  async listSubjects(filters?: { termId?: string }) {
    const termId =
      typeof filters?.termId === 'string' ? filters.termId.trim() : '';
    const where = termId
      ? [
          { teacherId: this.teacher.teacherId, enabled: true, termId },
          {
            teacherId: this.teacher.teacherId,
            enabled: true,
            termId: IsNull(),
          },
        ]
      : { teacherId: this.teacher.teacherId, enabled: true };
    try {
      const subjects = await this.subjects.find({
        where,
        order: { name: 'ASC' },
      });
      return subjects.map((subject) => ({
        ...subject,
        performanceConfig:
          subject.performanceConfig ?? defaultPerformanceConfig(),
      }));
    } catch (err) {
      if (this.isMissingTableError(err)) {
        try {
          this.ensureTablesPromise = null;
          await this.ensureTables();
          const subjects = await this.subjects.find({
            where,
            order: { name: 'ASC' },
          });
          return subjects.map((subject) => ({
            ...subject,
            performanceConfig:
              subject.performanceConfig ?? defaultPerformanceConfig(),
          }));
        } catch (retryErr) {
          if (this.semesterSubjects) {
            const fallbackSubjects = await this.semesterSubjects.find({
              where,
              order: { name: 'ASC' },
            });
            return fallbackSubjects.map((subject) => ({
              ...subject,
              performanceConfig:
                subject.performanceConfig ?? defaultPerformanceConfig(),
            }));
          }
          throw retryErr;
        }
      }
      throw err;
    }
  }
  async createSubject(body: Record<string, string>) {
    if (!body.name?.trim()) throw new BadRequestException('请填写学科名称');
    const termId = typeof body.termId === 'string' ? body.termId.trim() : '';
    if (!termId && this.terms && typeof this.terms.count === 'function') {
      const hasTerms = await this.terms.count({
        where: { teacherId: this.teacher.teacherId, enabled: true },
      });
      if (hasTerms > 0) {
        throw new BadRequestException('请选择所属学期');
      }
    } else if (termId) {
      await this.requireTerm(termId);
    }
    const createPayload = {
      id: randomUUID(),
      teacherId: this.teacher.teacherId,
      termId: termId || null,
      name: body.name.trim().slice(0, 100),
      enabled: true,
      performanceConfig: defaultPerformanceConfig(),
    };
    try {
      return await this.subjects.save(this.subjects.create(createPayload));
    } catch (err) {
      if (this.isMissingTableError(err)) {
        this.ensureTablesPromise = null;
        await this.ensureTables();
        return await this.subjects.save(this.subjects.create(createPayload));
      }
      throw err;
    }
  }
  async deleteSubject(id: string) {
    // 停用独立学科，保留已有报告和课程资料的关联。
    try {
      const result = await this.subjects.update(
        { id, teacherId: this.teacher.teacherId },
        { enabled: false },
      );
      if (!result.affected) throw new NotFoundException('学科不存在');
      return { deleted: true };
    } catch (err) {
      if (this.isMissingTableError(err)) {
        this.ensureTablesPromise = null;
        await this.ensureTables();
        const result = await this.subjects.update(
          { id, teacherId: this.teacher.teacherId },
          { enabled: false },
        );
        if (!result.affected) throw new NotFoundException('学科不存在');
        return { deleted: true };
      }
      throw err;
    }
  }

  /** 标题用冒号序列化到正文，因此禁止冒号和换行以保持字段边界。 */
  async updateCourseContentTitles(id: string, body: Record<string, unknown>) {
    await this.requireSubject(id);
    const titles = body.courseContentTitles;
    if (
      !Array.isArray(titles) ||
      titles.length > 12 ||
      titles.some(
        (title: unknown) =>
          typeof title !== 'string' ||
          !title.trim() ||
          title.trim().length > 40 ||
          /[\r\n：:]/.test(title),
      )
    )
      throw new BadRequestException(
        '课程内容标题最多 12 项，每项 1–40 字，不能包含换行或冒号',
      );
    const courseContentTitles = (titles as string[]).map((title) =>
      title.trim(),
    );
    if (new Set(courseContentTitles).size !== courseContentTitles.length)
      throw new BadRequestException('课程内容标题不能重复');
    const result = await this.subjects.update(
      { id, teacherId: this.teacher.teacherId, enabled: true },
      { courseContentTitles },
    );
    if (!result.affected) throw new NotFoundException('学科不存在');
    return this.subjects.findOne({
      where: { id, teacherId: this.teacher.teacherId },
    });
  }

  async updateSubjectPerformance(id: string, body: Record<string, unknown>) {
    const subject = await this.requireSubject(id);
    const performanceConfig = parsePerformanceConfig(body.performanceConfig);
    try {
      const result = await this.subjects.update(
        { id, teacherId: this.teacher.teacherId, enabled: true },
        { performanceConfig },
      );
      if (!result.affected) throw new NotFoundException('学科不存在');
      return { ...subject, performanceConfig };
    } catch (err) {
      if (this.isMissingTableError(err)) {
        this.ensureTablesPromise = null;
        await this.ensureTables();
        const result = await this.subjects.update(
          { id, teacherId: this.teacher.teacherId, enabled: true },
          { performanceConfig },
        );
        if (!result.affected) throw new NotFoundException('学科不存在');
        return { ...subject, performanceConfig };
      }
      throw err;
    }
  }
  listDocuments() {
    return this.semesterReportsService.listDocuments();
  }
  async previewCourseScope(body: Record<string, unknown>) {
    const subjectId = typeof body.subjectId === 'string' ? body.subjectId : '';
    if (subjectId) {
      await this.requireSubject(subjectId);
    }
    return this.semesterReportsService.previewCourseScope(body, {
      skipSubjectValidation: true,
    });
  }
  async previewDraftCourseScope(id: string, body: Record<string, unknown>) {
    const report = await this.findReport(id);
    if (report.status !== 'draft') {
      throw new BadRequestException('只有草稿状态的报告可以编辑');
    }
    // 以已鉴权草稿的归属读取资料，停用学科也不会切断已有草稿的 PDF 来源。
    await this.requireSubject(report.subjectId, true);
    return this.semesterReportsService.previewCourseScope(
      {
        termId: report.termId,
        subjectId: report.subjectId,
        period: report.periodType,
        reportVersion: 'v1',
        courseScope: body.courseScope,
      },
      {
        allowDisabledSubject: true,
        allowDisabledTerm: true,
        skipSubjectValidation: true,
      },
    );
  }

  async uploadDocument(
    file:
      | { originalname: string; mimetype: string; buffer: Buffer; size: number }
      | undefined,
    body: Record<string, string>,
  ) {
    if (!body.termId || !body.subjectId) {
      throw new BadRequestException('请先选择学期和学科');
    }
    await this.requireTerm(body.termId);
    await this.requireSubject(body.subjectId);
    return this.semesterReportsService.uploadDocument(file, body, {
      skipSubjectValidation: true,
    });
  }
  retryDocument(id: string) {
    return this.semesterReportsService.retryDocument(id);
  }
  confirmDocument(id: string, units?: string[]) {
    return this.semesterReportsService.confirmDocument(id, units);
  }
  deleteDocument(id: string) {
    return this.semesterReportsService.deleteDocument(id);
  }
  async preview(body: Record<string, unknown>) {
    const subjectId =
      typeof body.subjectId === 'string' ? body.subjectId.trim() : '';
    if (subjectId && subjectId !== '*') {
      await this.requireSubject(subjectId);
    }
    if (Array.isArray(body.courseSelections)) {
      for (const sel of body.courseSelections as Array<{
        subjectId?: unknown;
      }>) {
        if (
          typeof sel?.subjectId === 'string' &&
          sel.subjectId &&
          sel.subjectId !== '*'
        ) {
          await this.requireSubject(sel.subjectId);
        }
      }
    }
    const termId = typeof body.termId === 'string' ? body.termId.trim() : '';
    if (termId) {
      await this.requireTerm(termId);
    }
    return this.semesterReportsService.preview(body, {
      skipSubjectValidation: true,
    });
  }

  private key() {
    const raw = process.env.SEMESTER_REPORT_SHARE_SECRET;
    // 保留已配置的旧学科密钥，既有分享仍可解密；默认复用学期报告密钥。
    return raw
      ? createHash('sha256').update(raw).digest()
      : readReportShareKey();
  }

  private encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
  }

  private decrypt(ciphertext: string) {
    if (!ciphertext) return null;
    try {
      const [ivB64, tagB64, dataB64] = ciphertext.split('.');
      if (!ivB64 || !tagB64 || !dataB64) return null;
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key(),
        Buffer.from(ivB64, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
      return (
        decipher.update(Buffer.from(dataB64, 'base64'), undefined, 'utf8') +
        decipher.final('utf8')
      );
    } catch {
      return null;
    }
  }

  private tokenHash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private shareUrl(token: string) {
    const base = readReportPublicBaseUrl();
    return `${base}/r/subject/${token}`;
  }

  private async log(
    action: string,
    input: { reportId?: string; details?: Record<string, unknown> },
    manager?: EntityManager,
  ) {
    const repo = manager
      ? manager.getRepository(SubjectReportEventEntity)
      : this.events;
    await repo.save(
      repo.create({
        id: randomUUID(),
        teacherId: this.teacher.teacherId,
        reportId: input.reportId,
        action,
        details: input.details ?? null,
      }),
    );
  }

  private async findReport(id: string) {
    const report = await this.reports.findOne({
      where: { id, teacherId: this.teacher.teacherId },
    });
    if (!report || report.status === 'deleted') {
      throw new NotFoundException('学科报告不存在');
    }
    return report;
  }

  private async activeShare(reportId: string) {
    try {
      const row = await this.shares.findOne({
        where: {
          reportId,
          teacherId: this.teacher.teacherId,
          revokedAt: IsNull(),
        },
      });
      if (!row || (row.expiresAt && row.expiresAt < new Date())) return null;
      const token = this.decrypt(row.tokenCiphertext);
      if (!token) return null;
      return {
        id: row.id,
        url: this.shareUrl(token),
        expiresAt: row.expiresAt,
      };
    } catch {
      return null;
    }
  }

  private reportContent(row: SubjectReportEntity) {
    if (!row.content) return null;
    const selections: unknown = row.snapshot?.courseSelections;
    // 兼容读取：历史报告课程内容直接存留在快照的教学选择中
    const courseContent =
      typeof row.content.courseContent === 'string'
        ? row.content.courseContent
        : (Array.isArray(selections) ? selections : [])
            .flatMap((item: { manualContent?: unknown } | null) =>
              typeof item?.manualContent === 'string'
                ? [item.manualContent]
                : [],
            )
            .join('\n');
    // 正文优先，缺失的课次读取生成快照；仅在旧报告确实缺项时补齐。
    const content = row.content;
    const rawAttendances = content.attendances;
    const saved: unknown[] = Array.isArray(rawAttendances)
      ? rawAttendances
      : [];
    const snapshotRaw = row.snapshot?.attendances;
    const snapshot: unknown[] = Array.isArray(snapshotRaw) ? snapshotRaw : [];
    const lessonNumbers = [...courseContent.matchAll(/^第\s*(\d+)\s*节课/gm)]
      .map((match) => Number(match[1]))
      .filter((number) => number >= 1 && number <= 30);
    const count = Math.max(
      saved.length,
      ...lessonNumbers,
      content.attendance ? 1 : 0,
    );
    const attendances: Attendance[] | undefined = count
      ? Array.from({ length: count }, (_, index) => {
          const status =
            saved[index] ??
            snapshot[index] ??
            content.attendance ??
            saved[0] ??
            'present';
          return status === 'excused' || status === 'late' ? status : 'present';
        })
      : undefined;
    const singleAttendance: Attendance =
      content.attendance === 'present' ||
      content.attendance === 'excused' ||
      content.attendance === 'late'
        ? content.attendance
        : (attendances?.[0] ?? 'present');
    const courseScope =
      typeof content.courseScope === 'string' && content.courseScope.trim()
        ? content.courseScope.trim()
        : content.courseScope === undefined &&
            typeof row.courseScope === 'string' &&
            row.courseScope.trim()
          ? row.courseScope.trim()
          : undefined;
    const nextWeekContent =
      typeof content.nextWeekContent === 'string' &&
      content.nextWeekContent.trim()
        ? content.nextWeekContent.trim()
        : content.nextWeekContent === undefined &&
            typeof (row.snapshot as Record<string, unknown> | null)
              ?.nextWeekContent === 'string' &&
            (
              (row.snapshot as Record<string, unknown>)
                .nextWeekContent as string
            ).trim()
          ? (
              (row.snapshot as Record<string, unknown>)
                .nextWeekContent as string
            ).trim()
          : undefined;
    const restContent = { ...content };
    delete restContent.courseScope;
    delete restContent.nextWeekContent;
    return {
      ...restContent,
      courseContent,
      ...(attendances ? { attendances } : {}),
      attendance: singleAttendance,
      ...(courseScope ? { courseScope } : {}),
      ...(nextWeekContent ? { nextWeekContent } : {}),
    };
  }

  private async withStudentPresentation(row: SubjectReportEntity) {
    const missingName = !row.studentName || row.studentName === '学生';
    const missingClass = !row.className || row.className === '默认班级';
    if (
      !row.content ||
      (!missingName && !missingClass && row.content.studentPhoto)
    )
      return row;
    // 公开分享没有教师会话，按分享记录校验后的教师归属读取学生资料。
    const student = await this.semesterReportsService.subjectReportStudent(
      row.studentId,
      row.teacherId,
    );
    if (!student) return row;
    return {
      ...row,
      studentName: missingName ? student.name : row.studentName,
      className: missingClass ? student.className : row.className,
      content: {
        ...row.content,
        studentPhoto: row.content.studentPhoto || student.studentPhoto,
      },
    } as SubjectReportEntity;
  }

  private reportDto(row: SubjectReportEntity) {
    return {
      id: row.id,
      reportVersion: row.snapshot?.reportVersion ?? 'v2',
      isStageReport: false,
      isSubjectReport: true,
      termId: row.termId,
      termName: row.snapshot?.termName ?? '',
      subjectId: row.subjectId,
      subjectName: row.snapshot?.subjectName ?? '',
      studentId: row.studentId,
      studentName: row.studentName,
      className: row.className,
      period: row.periodType,
      start: row.periodStart,
      end: row.periodEnd,
      startDate: row.periodStart
        ? formatShanghaiDate(row.periodStart)
        : undefined,
      endDate: row.periodEnd
        ? formatShanghaiDate(new Date(row.periodEnd.getTime() - 1))
        : undefined,
      scoreScope: row.scoreScope,
      status: row.status,
      content: this.reportContent(row),
      snapshot: row.snapshot,
      keywords: row.keywords,
      teacherObservation: row.teacherObservation,
      courseScope: row.courseScope,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt ?? null,
      publishedAt: row.publishedAt,
    };
  }

  async listReports(filters: Record<string, unknown> = {}) {
    try {
      return await this.queryReports(filters);
    } catch (err) {
      if (this.isMissingTableError(err)) {
        this.ensureTablesPromise = null;
        await this.ensureTables().catch(() => {});
        return await this.queryReports(filters).catch(() => []);
      }
      throw err;
    }
  }

  private async queryReports(filters: Record<string, unknown> = {}) {
    const q = typeof filters.q === 'string' ? filters.q.trim() : '';
    const status =
      typeof filters.status === 'string' ? filters.status.trim() : '';
    const period =
      typeof filters.period === 'string' ? filters.period.trim() : '';
    const subjectId =
      typeof filters.subjectId === 'string' ? filters.subjectId.trim() : '';
    const page = Math.max(1, Number(filters.page) || 1);

    const query = this.reports
      .createQueryBuilder('report')
      .where('report.teacherId = :teacherId', {
        teacherId: this.teacher.teacherId,
      })
      .andWhere('report.status != :deleted', { deleted: 'deleted' });

    if (q) {
      query.andWhere(
        `(report.studentName LIKE :search ESCAPE '!' OR report.className LIKE :search ESCAPE '!' OR JSON_UNQUOTE(JSON_EXTRACT(report.snapshot, '$.subjectName')) LIKE :search ESCAPE '!')`,
        { search: `%${q.replace(/[!_%]/g, '!$&')}%` },
      );
    }
    if (status) query.andWhere('report.status = :status', { status });
    if (period) query.andWhere('report.periodType = :period', { period });
    if (subjectId)
      query.andWhere('report.subjectId = :subjectId', { subjectId });

    // 先单独物化轻量 ID 与创建时间在外层排序分页，避免整份含大照片的 JSON 正文快照被带入 filesort 导致 sort_buffer_size 溢出 (ER_OUT_OF_SORTMEMORY)
    const manager = this.reports.manager;
    let ordered: Array<{ id: string }>;
    if (manager && typeof manager.createQueryBuilder === 'function') {
      const matching = query
        .select('report.id', 'id')
        .addSelect('report.createdAt', 'created_at')
        .limit(Number.MAX_SAFE_INTEGER);

      ordered = await manager
        .createQueryBuilder()
        .select('matched_reports.id', 'id')
        .from(`(${matching.getQuery()})`, 'matched_reports')
        .setParameters(matching.getParameters())
        .orderBy('matched_reports.created_at', 'DESC')
        .addOrderBy('matched_reports.id', 'DESC')
        .offset((page - 1) * 200)
        .limit(200)
        .getRawMany<{ id: string }>();
    } else {
      ordered = await query
        .select(['report.id', 'report.createdAt'])
        .orderBy('report.createdAt', 'DESC')
        .addOrderBy('report.id', 'DESC')
        .skip((page - 1) * 200)
        .take(200)
        .getMany();
    }

    if (!ordered.length) return [];
    const ids = ordered.map((row) => row.id);

    const rows = await this.reports
      .createQueryBuilder('report')
      .where('report.teacherId = :teacherId', {
        teacherId: this.teacher.teacherId,
      })
      .andWhere('report.id IN (:...ids)', { ids })
      .getMany();

    const rowMap = new Map(rows.map((r) => [r.id, r]));
    const sortedRows = ids
      .map((id) => rowMap.get(id))
      .filter((r): r is SubjectReportEntity => Boolean(r));

    return Promise.all(
      sortedRows.map(async (row) => ({
        ...this.reportDto(await this.withStudentPresentation(row)),
        share: await this.activeShare(row.id),
      })),
    );
  }

  async getReport(id: string) {
    const row = await this.withStudentPresentation(await this.findReport(id));
    return {
      ...this.reportDto(row),
      share: await this.activeShare(row.id),
    };
  }

  async getEvents(id: string) {
    await this.findReport(id);
    const events = await this.events.find({
      where: { teacherId: this.teacher.teacherId, reportId: id },
      order: { createdAt: 'ASC' },
    });
    return events.map((e) => ({
      id: e.id,
      action: e.action,
      label:
        (
          {
            'report-created': '生成报告草稿',
            'draft-edited': '编辑草稿',
            'report-published': '发布报告',
            'report-unpublished': '撤销发布',
            'share-created': '生成分享',
            'share-revoked': '撤销分享',
            'classroom-photo-uploaded': '上传课堂照片',
            'classroom-photo-removed': '移除课堂照片',
            'report-deleted': '删除报告',
          } as Record<string, string>
        )[e.action] ?? e.action,
      createdAt: e.createdAt,
    }));
  }

  async generate(input: Record<string, unknown>) {
    const studentIds = Array.isArray(input.studentIds)
      ? (input.studentIds as string[])
      : [];
    if (!studentIds.length || studentIds.length > 30) {
      throw new BadRequestException('单次生成支持 1 至 30 名学生');
    }
    const period = input.period as 'week' | 'month' | 'term';
    if (!['week', 'month', 'term'].includes(period)) {
      throw new BadRequestException('周期类型无效');
    }
    const termId = typeof input.termId === 'string' ? input.termId.trim() : '';
    const subjectId =
      typeof input.subjectId === 'string' ? input.subjectId.trim() : '';
    if (!termId || !subjectId) {
      throw new BadRequestException('请选择学期与任教学科');
    }

    const term = await this.terms.findOne({
      where: { id: termId, teacherId: this.teacher.teacherId, enabled: true },
    });
    if (!term) throw new NotFoundException('所选学期不存在');

    const subject = await this.subjects.findOne({
      where: {
        id: subjectId,
        teacherId: this.teacher.teacherId,
        enabled: true,
      },
    });
    if (!subject) throw new NotFoundException('所选学科不存在');

    const startDateStr = (
      typeof input.start === 'string' ? input.start : term.startDate
    ).slice(0, 10);
    const endDateStr = (
      typeof input.end === 'string' ? input.end : term.endDate
    ).slice(0, 10);
    const periodStart = parsePeriodBound(startDateStr, false);
    const periodEnd = parsePeriodBound(endDateStr, true);
    if (periodStart >= periodEnd) {
      throw new BadRequestException('报告日期无效');
    }

    const rawCourseScope =
      typeof input.courseScope === 'string' ? input.courseScope.trim() : '';
    const rawNextWeekContent =
      typeof input.nextWeekContent === 'string'
        ? input.nextWeekContent.trim()
        : '';
    const selections = parseCourseSelections(
      input.courseSelections ?? [
        {
          subjectId,
          courseScope: rawCourseScope || '课程内容',
          manualContent:
            typeof input.courseContent === 'string'
              ? input.courseContent
              : rawCourseScope || '课程内容',
        },
      ],
      period,
    );

    // 周期课次数由前端传入（1~30 次），用于补齐未显式勾选课次出勤的学生默认值
    const lessonCount = Math.max(
      1,
      Math.min(30, Number(input.lessonCount) || 1),
    );
    const attendanceByStudent = new Map<string, Attendance>();
    const attendancesByStudent = new Map<string, Attendance[]>();
    // 支持按学生接收逐课次出勤 attendances 与单课次 attendance，校验其合法性
    if (Array.isArray(input.studentFeedback)) {
      for (const feedback of input.studentFeedback as Array<{
        studentId?: string;
        attendance?: unknown;
        attendances?: unknown;
      } | null>) {
        if (feedback?.studentId) {
          if (Array.isArray(feedback.attendances)) {
            const parsed = feedback.attendances.map((a) => parseAttendance(a));
            attendancesByStudent.set(feedback.studentId, parsed);
            if (parsed.length > 0) {
              attendanceByStudent.set(feedback.studentId, parsed[0]!);
            }
          }
          if (feedback.attendance !== undefined) {
            const single = parseAttendance(feedback.attendance);
            attendanceByStudent.set(feedback.studentId, single);
            if (!attendancesByStudent.has(feedback.studentId)) {
              attendancesByStudent.set(feedback.studentId, [single]);
            }
          }
        }
      }
    }

    let feedbackMap = new Map<
      string,
      StudentFeedback | Record<string, unknown>
    >();
    if (input.studentFeedback) {
      try {
        feedbackMap = parseStudentFeedback(
          input.studentFeedback,
          studentIds,
          [],
          [subjectId],
        );
      } catch {
        // 允许自由反馈格式，容错提取
        if (Array.isArray(input.studentFeedback)) {
          for (const item of input.studentFeedback as Array<
            Record<string, unknown>
          >) {
            if (item?.studentId)
              feedbackMap.set(
                typeof item.studentId === 'string'
                  ? item.studentId
                  : typeof item.studentId === 'number'
                    ? String(item.studentId)
                    : '',
                item,
              );
          }
        }
      }
    }
    const reportDetails = parseReportDetails(input.reportDetails);

    const createdReports: SubjectReportEntity[] = [];

    for (const sid of studentIds) {
      const { student, ...visuals } =
        await this.semesterReportsService.subjectReportPresentation(
          sid,
          periodEnd,
        );
      const fb = feedbackMap.get(sid);

      // 提取周期内积分流水
      const records = await this.records.find({
        where: { teacherId: this.teacher.teacherId, studentId: student.id },
        order: { createdAt: 'ASC' },
      });
      const periodRecords = records.filter(
        (r) => r.createdAt >= periodStart && r.createdAt < periodEnd,
      );
      const scoreSummary = {
        scope: 'overall',
        positiveItems: positiveScoreItems(periodRecords),
        positive: periodRecords
          .filter((r) => r.delta > 0)
          .reduce((sum, r) => sum + r.delta, 0),
        negative: periodRecords
          .filter((r) => r.delta < 0)
          .reduce((sum, r) => sum + r.delta, 0),
        net: periodRecords.reduce((sum, r) => sum + r.delta, 0),
        count: periodRecords.length,
        records: periodRecords.slice(0, 50).map((r) => ({
          id: r.id,
          category: r.category,
          label: r.label,
          delta: r.delta,
          note: r.note,
          createdAt: r.createdAt,
        })),
      };

      const normalizedSelections = selections.map((s) => ({
        ...s,
        manualContent:
          s.manualContent !== undefined
            ? s.manualContent
            : typeof input.courseScope === 'string'
              ? input.courseScope
              : s.courseScope || '教学内容',
      }));

      const allowedReferences: string[] = [
        ...normalizedSelections
          .filter((s) => s.manualContent)
          .map((s) => `teacher-course:${s.subjectId}`),
        ...periodRecords.map((r) => `score:${r.id}`),
      ];
      if (input.teacherObservation) {
        allowedReferences.push('teacher-observation');
      }
      if (!allowedReferences.some((ref) => ref.startsWith('teacher-course:'))) {
        allowedReferences.push(`teacher-course:${subjectId}`);
      }

      const studentAttendances =
        attendancesByStudent.get(sid) &&
        attendancesByStudent.get(sid)!.length > 0
          ? attendancesByStudent.get(sid)!
          : Array.from(
              { length: lessonCount },
              () => attendanceByStudent.get(sid) ?? 'present',
            );
      const studentAttendance =
        attendanceByStudent.get(sid) ?? studentAttendances[0] ?? 'present';

      // 固化生成时的课程和积分依据，避免后续资料变动影响已有报告。
      const snapshot: Record<string, unknown> = {
        reportVersion: 'v2',
        ...visuals,
        termId,
        termName: term.name,
        subjectId,
        subjectName: subject.name,
        studentId: student.id,
        studentName: student.name,
        className: student.className,
        period,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        lessonCount: studentAttendances.length,
        attendances: studentAttendances,
        courseSelections: normalizedSelections,
        allowedReferences,
        scoreSummary,
        reportScoreSummary: scoreSummary,
        reportDetails,
        teacherInput: fb ?? null,
        keywords:
          typeof input.keywords === 'string' ? input.keywords.trim() : null,
        teacherObservation:
          typeof input.teacherObservation === 'string'
            ? input.teacherObservation.trim()
            : null,
        courseScope: rawCourseScope || null,
        nextWeekContent: rawNextWeekContent || null,
      };

      const templateContent = generateTemplateReport({
        snapshot,
        studentName: student.name,
        periodType: period,
      } as unknown as SemesterReportEntity);

      const report = this.reports.create({
        id: randomUUID(),
        teacherId: this.teacher.teacherId,
        termId,
        subjectId,
        studentId: student.id,
        studentName: student.name,
        className: student.className,
        periodType: period,
        periodStart,
        periodEnd,
        scoreScope: 'overall',
        snapshot,
        content: {
          ...templateContent,
          attendance: studentAttendance,
          attendances: studentAttendances,
          courseContent: normalizedSelections
            .map((selection) => selection.manualContent)
            .filter(Boolean)
            .join('\n'),
          ...(rawCourseScope ? { courseScope: rawCourseScope } : {}),
          ...(rawNextWeekContent
            ? { nextWeekContent: rawNextWeekContent }
            : {}),
        },
        status: 'draft',
        keywords: snapshot.keywords as string | null,
        teacherObservation: snapshot.teacherObservation as string | null,
        courseScope: rawCourseScope || null,
      });

      const saved = await this.reports.save(report);
      await this.log('report-created', {
        reportId: saved.id,
        details: { studentName: student.name },
      });
      createdReports.push(saved);
    }

    return createdReports.map((r) => this.reportDto(r));
  }

  async editDraft(id: string, content: Record<string, unknown>) {
    const report = await this.findReport(id);
    if (report.status !== 'draft') {
      throw new BadRequestException('只有草稿状态的报告可以编辑');
    }
    const { courseContent } = content;
    if (courseContent !== undefined && typeof courseContent !== 'string') {
      throw new BadRequestException('课程内容必须为文本');
    }
    if (
      content.courseScope !== undefined &&
      content.courseScope !== null &&
      typeof content.courseScope !== 'string'
    ) {
      throw new BadRequestException('授课范围备注必须为文本');
    }
    if (
      content.nextWeekContent !== undefined &&
      content.nextWeekContent !== null &&
      typeof content.nextWeekContent !== 'string'
    ) {
      throw new BadRequestException('下周教学内容重点必须为文本');
    }
    const previous = this.reportContent(report);
    // 草稿修改支持更新多课次出勤列表，同时双向同步单标量字段以兼容外部调用
    let attendances: Attendance[] | undefined;
    if (Array.isArray(content.attendances)) {
      attendances = content.attendances.map((a) => parseAttendance(a));
    }
    let attendance: Attendance;
    if (content.attendance !== undefined) {
      attendance = parseAttendance(content.attendance);
    } else if (attendances && attendances.length > 0) {
      attendance = attendances[0]!;
    } else {
      attendance = parseAttendance(report.content?.attendance ?? 'present');
    }
    if (!attendances && Array.isArray(report.content?.attendances)) {
      attendances = (report.content.attendances as unknown[]).map((a) =>
        parseAttendance(a),
      );
    }
    if (!attendances) {
      attendances = [attendance];
    }

    const previousSnapshot = report.snapshot;
    const previousContent = previous as Record<string, unknown> | null;
    const mergedContent: Record<string, unknown> = {
      ...content,
      attendance,
      attendances,
      // 省略字段时保留旧正文或历史快照，空字符串表示主动清空。
      courseContent: courseContent ?? previous?.courseContent ?? '',
    };
    for (const key of [
      'studentPhoto',
      'pet',
      'petAsOf',
      'petHistoryStatus',
      'scoreDetails',
    ]) {
      const val = previousSnapshot?.[key] ?? previousContent?.[key];
      if (val !== undefined) {
        mergedContent[key] = val;
      }
    }
    for (const key of [
      'classroomPhoto',
      'classroomPhotos',
      'classroomPhotoCaptions',
    ]) {
      const val = previousSnapshot?.[key] ?? previousContent?.[key];
      if (val !== undefined && mergedContent[key] === undefined) {
        mergedContent[key] = val;
      }
    }
    if (
      mergedContent.classroomPhotos !== undefined ||
      mergedContent.classroomPhotoCaptions !== undefined
    ) {
      report.snapshot = {
        ...(report.snapshot ?? {}),
        ...(mergedContent.classroomPhoto !== undefined
          ? { classroomPhoto: mergedContent.classroomPhoto }
          : {}),
        ...(mergedContent.classroomPhotos !== undefined
          ? { classroomPhotos: mergedContent.classroomPhotos }
          : {}),
        ...(mergedContent.classroomPhotoCaptions !== undefined
          ? { classroomPhotoCaptions: mergedContent.classroomPhotoCaptions }
          : {}),
      };
    }

    if (content.courseScope !== undefined) {
      const scopeVal =
        typeof content.courseScope === 'string'
          ? content.courseScope.trim()
          : '';
      mergedContent.courseScope = scopeVal || null;
      report.courseScope = scopeVal || null;
    } else if (previous?.courseScope) {
      mergedContent.courseScope = previous.courseScope;
    }

    if (content.nextWeekContent !== undefined) {
      const nextVal =
        typeof content.nextWeekContent === 'string'
          ? content.nextWeekContent.trim()
          : '';
      mergedContent.nextWeekContent = nextVal || null;
    } else if (previous?.nextWeekContent) {
      mergedContent.nextWeekContent = previous.nextWeekContent;
    }

    report.content = mergedContent;
    const saved = await this.reports.save(report);
    await this.log('draft-edited', { reportId: id });
    return this.reportDto(saved);
  }

  async setClassroomPhoto(
    id: string,
    file?: { buffer: Buffer; size: number; mimetype: string },
    slot: unknown = 0,
  ) {
    const report = await this.findReport(id);
    if (report.status !== 'draft') {
      throw new BadRequestException('只有草稿状态的报告可以修改课堂照片');
    }
    if (![0, 1, '0', '1'].includes(slot as string | number)) {
      throw new BadRequestException('课堂照片位置必须为 0 或 1');
    }
    let classroomPhoto: string | null = null;
    if (file) {
      const png = file.buffer
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const jpeg =
        file.buffer[0] === 255 &&
        file.buffer[1] === 216 &&
        file.buffer[2] === 255;
      if (
        file.size < 12 ||
        file.size > 2 * 1024 * 1024 ||
        file.size !== file.buffer.length ||
        !(
          (png && file.mimetype === 'image/png') ||
          (jpeg && file.mimetype === 'image/jpeg')
        )
      ) {
        throw new BadRequestException(
          '请上传 JPG 或 PNG 课堂照片（每张最大 2MB）',
        );
      }
      classroomPhoto = `data:${png ? 'image/png' : 'image/jpeg'};base64,${file.buffer.toString('base64')}`;
    }

    const currentSnapshot = report.snapshot ?? {};
    const currentContent = (report.content ?? {}) as Record<string, unknown>;

    const classroomPhotos = classroomPhotosForSnapshot({
      classroomPhoto:
        currentContent.classroomPhoto ?? currentSnapshot.classroomPhoto,
      classroomPhotos:
        currentContent.classroomPhotos ?? currentSnapshot.classroomPhotos,
    });
    classroomPhotos[Number(slot)] = classroomPhoto;

    const classroomPhotoCaptions = classroomPhotoCaptionsForSnapshot({
      classroomPhotoCaptions:
        currentContent.classroomPhotoCaptions ??
        currentSnapshot.classroomPhotoCaptions,
    });
    if (!file) {
      classroomPhotoCaptions[Number(slot)] = '';
    }

    report.snapshot = {
      ...currentSnapshot,
      classroomPhoto: classroomPhotos[0] ?? null,
      classroomPhotos,
      classroomPhotoCaptions,
    };
    report.content = {
      ...currentContent,
      classroomPhoto: classroomPhotos[0] ?? null,
      classroomPhotos,
      classroomPhotoCaptions,
    };

    const saved = await this.reports.save(report);
    await this.log(
      file ? 'classroom-photo-uploaded' : 'classroom-photo-removed',
      { reportId: id, details: { slot: Number(slot) } },
    );
    return this.reportDto(saved);
  }

  async publish(id: string) {
    const report = await this.findReport(id);
    this.key();
    report.status = 'published';
    report.publishedAt = new Date();
    await this.reports.save(report);

    const share = await this.createShare(id);
    await this.log('report-published', { reportId: id });
    return { report: this.reportDto(report), ...share };
  }

  async unpublish(id: string) {
    const report = await this.findReport(id);
    await this.shares.update(
      { reportId: id, teacherId: this.teacher.teacherId, revokedAt: IsNull() },
      { revokedAt: new Date(), tokenCiphertext: '' },
    );
    report.status = 'draft';
    report.publishedAt = null;
    await this.reports.save(report);
    await this.log('report-unpublished', { reportId: id });
    return { status: report.status };
  }

  async createShare(id: string) {
    const report = await this.findReport(id);
    if (report.status !== 'published') {
      throw new BadRequestException('请先发布报告');
    }
    // 公开查询用哈希匹配，教师端恢复分享地址时才解密令牌。
    const token = randomBytes(32).toString('base64url');
    const share = await this.shares.save(
      this.shares.create({
        id: randomUUID(),
        teacherId: this.teacher.teacherId,
        reportId: id,
        tokenHash: this.tokenHash(token),
        tokenCiphertext: this.encrypt(token),
        expiresAt: null,
        revokedAt: null,
      }),
    );
    await this.log('share-created', { reportId: id });
    return {
      url: this.shareUrl(token),
      shareId: share.id,
      expiresAt: share.expiresAt,
    };
  }

  async revokeShare(id: string, shareId: string) {
    const report = await this.findReport(id);
    const share = await this.shares.findOne({
      where: { id: shareId, reportId: id, teacherId: this.teacher.teacherId },
    });
    if (!share) throw new NotFoundException('分享链接不存在');
    share.revokedAt = new Date();
    share.tokenCiphertext = '';
    await this.shares.save(share);
    await this.log('share-revoked', { reportId: id });
    return { revoked: true, status: report.status };
  }

  async retryReport(id: string) {
    const report = await this.findReport(id);
    report.status = 'queued';
    report.errorMessage = null;
    const saved = await this.reports.save(report);
    return this.reportDto(saved);
  }

  async deleteReport(id: string) {
    const report = await this.findReport(id);
    report.status = 'deleted';
    report.content = null;
    report.snapshot = null;
    await this.reports.save(report);
    await this.shares.update(
      { teacherId: this.teacher.teacherId, reportId: id },
      { revokedAt: new Date(), tokenCiphertext: '' },
    );
    await this.log('report-deleted', { reportId: id });
    return { deleted: true };
  }

  async publicReport(token: string) {
    if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) {
      throw new NotFoundException('报告链接无效或已失效');
    }
    const share = await this.shares.findOne({
      where: { tokenHash: this.tokenHash(token), revokedAt: IsNull() },
    });
    if (!share || (share.expiresAt && share.expiresAt <= new Date())) {
      throw new NotFoundException('报告链接无效或已失效');
    }
    // 公开请求没有教师会话，按分享记录的教师归属和报告发布状态限制访问。
    const report = await this.reports.findOne({
      where: {
        id: share.reportId,
        teacherId: share.teacherId,
        status: 'published',
      },
    });
    if (!report || !report.content) {
      throw new NotFoundException('报告未发布或已被撤回');
    }

    const displayed = await this.withStudentPresentation(report);
    return {
      studentName: displayed.studentName,
      className: displayed.className,
      period: report.periodType,
      subject: report.snapshot?.subjectName ?? '',
      term: report.snapshot?.termName ?? '',
      start: report.periodStart,
      end: report.periodEnd,
      courseScope: report.courseScope || undefined,
      content: this.reportContent(displayed),
      isSubjectReport: true,
    };
  }
}
