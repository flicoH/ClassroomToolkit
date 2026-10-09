import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { TeacherContext } from '../auth/teacher-context';
import { normalizeUploadedFileName } from './uploaded-file-name';
import {
  detectCourseUnits as detectUnits,
  selectCoursePages,
  extractLearningContents,
} from './course-scope';
import {
  resolveReportGenerationMode,
  learningContentsForReport,
  scoreDetailsForSnapshot,
  validateGeneratedReportContent,
} from './report-generation';
import { PetEvaluationRecordEntity } from '../pet-points/entities/pet-evaluation-record.entity';
import {
  parseReportDetails,
  parseStudentFeedback,
  type ReportDetails,
  type StudentFeedback,
} from './report-input';
import { PetStudentEntity } from '../pet-points/entities/pet-student.entity';
import {
  ReportDocumentEntity,
  ReportEventEntity,
  ReportShareEntity,
  ReportSubjectEntity,
  ReportTermEntity,
  SemesterReportEntity,
} from './semester-report.entity';

const periods = ['week', 'month', 'term'] as const;

@Injectable()
export class SemesterReportsService {
  constructor(
    @InjectRepository(ReportTermEntity)
    private readonly terms: Repository<ReportTermEntity>,
    @InjectRepository(ReportSubjectEntity)
    private readonly subjects: Repository<ReportSubjectEntity>,
    @InjectRepository(ReportDocumentEntity)
    private readonly documents: Repository<ReportDocumentEntity>,
    @InjectRepository(SemesterReportEntity)
    private readonly reports: Repository<SemesterReportEntity>,
    @InjectRepository(ReportShareEntity)
    private readonly shares: Repository<ReportShareEntity>,
    @InjectRepository(ReportEventEntity)
    private readonly events: Repository<ReportEventEntity>,
    @InjectRepository(PetStudentEntity)
    private readonly students: Repository<PetStudentEntity>,
    @InjectRepository(PetEvaluationRecordEntity)
    private readonly records: Repository<PetEvaluationRecordEntity>,
    private readonly teacher: TeacherContext,
  ) {}

  async listTerms() {
    return this.terms.find({
      where: { teacherId: this.teacher.teacherId },
      order: { startDate: 'DESC' },
    });
  }
  async listSubjects() {
    return this.subjects.find({
      where: { teacherId: this.teacher.teacherId, enabled: true },
      order: { name: 'ASC' },
    });
  }

  async createTerm(input: Record<string, string>) {
    if (
      !input.name?.trim() ||
      !this.validDate(input.startDate) ||
      !this.validDate(input.endDate) ||
      input.endDate <= input.startDate
    )
      throw new BadRequestException('请填写有效的学期名称和起止日期');
    return this.terms.save(
      this.terms.create({
        id: randomUUID(),
        teacherId: this.teacher.teacherId,
        name: input.name.trim().slice(0, 100),
        startDate: input.startDate,
        endDate: input.endDate,
      }),
    );
  }

  async createSubject(input: Record<string, string>) {
    if (!input.name?.trim()) throw new BadRequestException('请填写学科名称');
    return this.subjects.save(
      this.subjects.create({
        id: randomUUID(),
        teacherId: this.teacher.teacherId,
        name: input.name.trim().slice(0, 100),
        enabled: true,
      }),
    );
  }

  async listDocuments() {
    const docs = await this.documents.find({
      where: { teacherId: this.teacher.teacherId },
      order: { createdAt: 'DESC' },
    });
    return docs
      .filter((doc) => doc.status !== 'deleted')
      .map((doc) => this.publicDocument(doc));
  }

  async uploadDocument(
    file:
      | { originalname: string; mimetype: string; buffer: Buffer; size: number }
      | undefined,
    input: Record<string, string>,
  ) {
    if (
      !file ||
      file.size < 8 ||
      file.size > 30 * 1024 * 1024 ||
      file.buffer.subarray(0, 5).toString() !== '%PDF-'
    )
      throw new BadRequestException('请上传有效的 PDF 文件（最大 30MB）');
    if (!input.termId || !input.subjectId)
      throw new BadRequestException('请先选择学期和学科');
    await this.requireTerm(input.termId);
    await this.requireSubject(input.subjectId);
    const teacherId = this.teacher.teacherId;
    const hash = createHash('sha256').update(file.buffer).digest('hex');
    const existing = await this.documents.findOne({
      where: {
        teacherId,
        termId: input.termId,
        subjectId: input.subjectId,
        classId: input.classId || '*',
        fileHash: hash,
        status: 'ready',
      },
    });
    if (existing) return { ...this.publicDocument(existing), reused: true };
    const id = randomUUID();
    const directory =
      process.env.SEMESTER_REPORT_STORAGE_DIR ||
      join(process.cwd(), 'data', 'semester-reports');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const storagePath = join(directory, `${id}.pdf`);
    await writeFile(storagePath, file.buffer, { mode: 0o600, flag: 'wx' });
    const row = await this.documents.save(
      this.documents.create({
        id,
        teacherId,
        termId: input.termId,
        subjectId: input.subjectId,
        classId: input.classId || '*',
        fileName: normalizeUploadedFileName(file.originalname),
        fileHash: hash,
        storagePath,
        contentText: null,
        sourcePages: null,
        status: 'queued',
        errorMessage: null,
        confirmedUnits: null,
      }),
    );
    await this.log('document-uploaded', {
      documentId: id,
      details: { size: file.size },
    });
    return this.publicDocument(row);
  }

  async retryDocument(id: string) {
    const row = await this.findDocument(id);
    if (!row.storagePath) throw new BadRequestException('课程文件已不可用');
    row.status = 'queued';
    row.errorMessage = null;
    await this.documents.save(row);
    await this.log('document-retried', { documentId: id });
    return this.publicDocument(row);
  }

  async confirmDocument(id: string, units?: string[]) {
    const row = await this.findDocument(id);
    if (!row.contentText || !row.contentText.trim())
      throw new BadRequestException('解析文本为空，无法确认');
    if (units)
      row.confirmedUnits = units
        .map((x) => x.trim().slice(0, 160))
        .filter(Boolean)
        .slice(0, 100);
    else row.confirmedUnits ??= detectUnits(row.contentText);
    row.status = 'ready';
    row.errorMessage = null;
    await this.documents.save(row);
    await this.log('document-confirmed', {
      documentId: id,
      details: { units: row.confirmedUnits?.length ?? 0 },
    });
    return this.publicDocument(row);
  }

  async deleteDocument(id: string) {
    const row = await this.findDocument(id);
    const storagePath = row.storagePath;
    row.status = 'deleted';
    row.fileName = 'deleted.pdf';
    row.fileHash = '';
    row.contentText = null;
    row.sourcePages = null;
    await this.documents.save(row);
    if (storagePath) {
      try {
        await unlink(storagePath);
        row.storagePath = null;
        await this.documents.save(row);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          row.storagePath = null;
          await this.documents.save(row);
        }
      }
    }
    await this.log('document-deleted', { documentId: id });
    return { deleted: true };
  }

  async preview(input: Record<string, unknown>) {
    const { period, start, end, termId, subjectId, studentIds } =
      this.validateRequest(input);
    const term = await this.requireTerm(termId);
    await this.requireSubject(subjectId);
    if (
      start < shanghaiMidnight(term.startDate) ||
      end > new Date(shanghaiMidnight(term.endDate).getTime() + 86400000)
    )
      throw new BadRequestException('报告周期必须在学期日期范围内');
    const docs = await this.findUsableDocuments(
      termId,
      subjectId,
      String(input.classId ?? '*'),
    );
    const students = await this.findStudents(studentIds);
    const summaries = await Promise.all(
      students.map((student) => this.scoreSummary(student, start, end)),
    );
    return {
      period,
      start,
      end,
      scoreScope: 'overall',
      scoreSummaries: summaries.map((summary, index) => ({
        ...summary,
        // Return the submitted ID because pet student storage IDs may carry a teacher prefix.
        studentId: studentIds[index],
        studentName: students[index]!.name,
      })),
      documents: docs.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        units: d.confirmedUnits ?? [],
      })),
      warning: '积分为综合课堂表现记录，不能据此判断该学科知识掌握程度。',
    };
  }

  async previewCourseScope(input: Record<string, unknown>) {
    const period = input.period as (typeof periods)[number];
    if (!periods.includes(period))
      throw new BadRequestException('请选择报告周期');
    const termId = String(input.termId ?? '');
    const subjectId = String(input.subjectId ?? '');
    await this.requireTerm(termId);
    await this.requireSubject(subjectId);
    const documents = await this.findUsableDocuments(
      termId,
      subjectId,
      String(input.classId ?? '*'),
    );
    const scope = String(input.courseScope ?? '')
      .trim()
      .slice(0, 1000);
    const selected = selectCoursePages(documents, scope, period);
    const learningContents = extractLearningContents(documents, scope, period);
    return {
      courseScope: scope,
      learningContents: learningContents.slice(0, 500),
      totalLearningContents: learningContents.length,
      totalPages: selected.reduce(
        (sum, document) => sum + document.pages.length,
        0,
      ),
      documents: selected
        .filter((document) => document.pages.length)
        .map((document) => ({
          id: document.id,
          fileName: document.fileName,
          pages: document.pages.map((page) => page.page),
        })),
    };
  }

  async generate(input: Record<string, unknown>) {
    const { period, start, end, termId, subjectId, studentIds } =
      this.validateRequest(input);
    const teacherId = this.teacher.teacherId;
    const term = await this.requireTerm(termId);
    const subject = await this.requireSubject(subjectId);
    if (
      start < shanghaiMidnight(term.startDate) ||
      end > new Date(shanghaiMidnight(term.endDate).getTime() + 86400000)
    )
      throw new BadRequestException('报告周期必须在学期日期范围内');
    const documents = await this.findUsableDocuments(
      termId,
      subjectId,
      String(input.classId ?? '*'),
    );
    const courseScope = String(input.courseScope ?? '')
      .trim()
      .slice(0, 1000);
    if (!documents.length)
      throw new BadRequestException('请先上传并确认该学期该学科的课程 PDF');
    if (documents.length > 20)
      throw new BadRequestException('单次最多使用 20 份课程 PDF');
    if (period !== 'term' && courseScope.length < 2)
      throw new BadRequestException(
        '周报和月报请填写本周期已授课章节或教学范围',
      );
    const selectedCourseDocuments = selectCoursePages(
      documents,
      courseScope,
      period,
    );
    if (!selectedCourseDocuments.some((document) => document.pages.length)) {
      const suggestions = [
        ...new Set(
          documents.flatMap((document) =>
            document.confirmedUnits?.length
              ? document.confirmedUnits
              : detectUnits(document.contentText ?? ''),
          ),
        ),
      ].slice(0, 5);
      throw new BadRequestException(
        `所填授课范围未匹配到课程 PDF 页面，请检查章节名称${suggestions.length ? `。可填写：${suggestions.join('、')}` : ''}`,
      );
    }
    const totalCourseChars = selectedCourseDocuments.reduce(
      (sum, d) =>
        sum +
        d.pages.reduce((pageTotal, page) => pageTotal + page.text.length, 0),
      0,
    );
    const learningContents = extractLearningContents(
      documents,
      courseScope,
      period,
    );
    if (learningContents.length > 500)
      throw new BadRequestException(
        '学习内容超过 500 项，请缩小授课范围后生成',
      );
    if (totalCourseChars > 120000)
      throw new BadRequestException(
        '课程资料内容较多，请按章节拆分 PDF 后再生成，避免漏读课程内容',
      );
    let generationMode: 'template' | 'ai';
    try {
      generationMode = resolveReportGenerationMode(input.generationMode);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : '报告生成方式无效',
      );
    }
    const students = await this.findStudents(studentIds);
    let reportDetails: ReportDetails | undefined;
    let feedback: Map<string, StudentFeedback>;
    try {
      reportDetails = parseReportDetails(input.reportDetails, start, end);
      feedback = parseStudentFeedback(
        input.studentFeedback,
        studentIds,
        learningContents.map((item) => item.id),
      );
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : '报告输入无效',
      );
    }
    const keyword = String(input.keywords ?? '')
      .trim()
      .slice(0, 1000);
    const observation = String(input.teacherObservation ?? '')
      .trim()
      .slice(0, 3000);
    const created: SemesterReportEntity[] = [];
    for (const [index, student] of students.entries()) {
      // Feedback is keyed by the client ID; resolved students use stored IDs.
      const submittedFeedback = feedback.get(studentIds[index]!);
      const teacherInput = submittedFeedback
        ? { ...submittedFeedback, studentId: student.id }
        : undefined;
      const scores = await this.scoreSummary(student, start, end);
      const snapshot = {
        generationMode,
        learningContents,
        reportDetails,
        teacherInput,
        student: {
          id: student.id,
          name: student.name,
          className: student.className,
        },
        subjectName: subject.name,
        scoreScope: 'overall',
        scoreSummary: scores,
        courseDocuments: selectedCourseDocuments.map((d) => ({
          id: d.id,
          fileName: d.fileName,
          units: d.units,
          pages: d.pages.map((page) => ({
            page: page.page,
            text: page.text,
          })),
        })),
        allowedReferences: [
          ...selectedCourseDocuments.flatMap((d) =>
            d.pages.map((page) => `course:${d.id}:p${page.page}`),
          ),
          ...scores.records.map((record) => `score:${record.id}`),
          ...(observation ? ['teacher-observation'] : []),
          ...(teacherInput ? ['teacher-input'] : []),
        ],
        courseScope,
        scoreNotice: '综合课堂表现记录，不代表该学科知识掌握程度。',
        generatedAt: new Date().toISOString(),
      };
      const report = await this.reports.save(
        this.reports.create({
          id: randomUUID(),
          teacherId,
          termId,
          subjectId,
          studentId: student.id,
          studentName: student.name,
          className: student.className,
          periodType: period,
          periodStart: start,
          periodEnd: end,
          scoreScope: 'overall',
          snapshot,
          content: null,
          status: 'queued',
          keywords: keyword || null,
          teacherObservation: observation || null,
          courseScope: courseScope || null,
          errorMessage: null,
          publishedAt: null,
        }),
      );
      await this.log('report-queued', {
        reportId: report.id,
        details: {
          period,
          subject: subject.name,
          sourceCount: documents.length,
          generationMode,
          hasTeacherInput: Boolean(teacherInput),
        },
      });
      created.push(report);
    }
    return {
      reports: created.map((r) => this.reportDto(r)),
      scoreScope: 'overall',
    };
  }

  async listReports() {
    const rows = await this.reports.find({
      where: { teacherId: this.teacher.teacherId },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    return Promise.all(
      rows
        .filter((r) => r.status !== 'deleted')
        .map(async (r) => {
          const summary = this.reportDto({
            ...r,
            content: null,
          });
          return { ...summary, share: await this.activeShare(r.id) };
        }),
    );
  }

  async getReport(id: string) {
    return this.reportDto(await this.findReport(id));
  }

  async getEvents(id: string) {
    await this.findReport(id);
    return this.events.find({
      where: { teacherId: this.teacher.teacherId, reportId: id },
      order: { createdAt: 'ASC' },
    });
  }

  async editDraft(id: string, content: Record<string, unknown>) {
    return this.withReportLock(id, async (row, manager) => {
      if (row.status !== 'draft')
        throw new BadRequestException('只有草稿可以编辑');
      const reviewedSnapshot = {
        ...row.snapshot,
        allowedReferences: [
          ...new Set([
            ...((row.snapshot?.allowedReferences as string[]) ?? []),
            'teacher-review',
          ]),
        ],
        teacherReviewedAt: new Date().toISOString(),
      };
      this.validateContent(content, reviewedSnapshot);
      row.snapshot = reviewedSnapshot;
      row.content = content;
      await manager.getRepository(SemesterReportEntity).save(row);
      await this.log('draft-edited', { reportId: id }, manager);
      return this.reportDto(row);
    });
  }

  async publish(id: string) {
    return this.withReportLock(id, async (row, manager) => {
      if (row.status === 'published' && row.content) {
        return {
          report: this.reportDto(row),
          ...(await this.createShareForReport(row, manager)),
        };
      }
      if (row.status !== 'draft' || !row.content)
        throw new BadRequestException('仅可发布已生成并校验的草稿');
      this.key();
      this.validateContent(row.content, row.snapshot ?? {});
      row.status = 'published';
      row.publishedAt = new Date();
      await manager.getRepository(SemesterReportEntity).save(row);
      const share = await this.createShareForReport(row, manager);
      await this.log('report-published', { reportId: id }, manager);
      return { report: this.reportDto(row), ...share };
    });
  }

  async regenerate(id: string) {
    const old = await this.findReport(id);
    const input = {
      period: old.periodType,
      start: old.periodStart.toISOString(),
      end: old.periodEnd.toISOString(),
      termId: old.termId,
      subjectId: old.subjectId,
      studentIds: [old.studentId],
      reportDetails: old.snapshot?.reportDetails,
      studentFeedback: old.snapshot?.teacherInput
        ? [old.snapshot.teacherInput]
        : undefined,
      keywords: old.keywords,
      teacherObservation: old.teacherObservation,
      courseScope: old.courseScope,
    };
    return this.generate(input);
  }

  async createShare(id: string) {
    return this.withReportLock(id, (report, manager) =>
      this.createShareForReport(report, manager),
    );
  }

  private async createShareForReport(
    report: SemesterReportEntity,
    manager: EntityManager,
  ) {
    const id = report.id;
    const shares = manager.getRepository(ReportShareEntity);
    if (report.status !== 'published')
      throw new BadRequestException('请先发布报告');
    this.key();
    const existing = await shares.findOne({
      where: {
        teacherId: this.teacher.teacherId,
        reportId: id,
        revokedAt: IsNull(),
      },
    });
    if (existing && (!existing.expiresAt || existing.expiresAt > new Date())) {
      return {
        url: this.shareUrl(this.decrypt(existing.tokenCiphertext)),
        shareId: existing.id,
        expiresAt: existing.expiresAt,
      };
    }
    if (existing) {
      existing.revokedAt = new Date();
      await shares.save(existing);
    }
    const token = randomBytes(32).toString('base64url');
    const share = await shares.save(
      shares.create({
        id: randomUUID(),
        teacherId: this.teacher.teacherId,
        reportId: id,
        tokenHash: this.tokenHash(token),
        tokenCiphertext: this.encrypt(token),
        expiresAt: null,
        revokedAt: null,
      }),
    );
    await this.log('share-created', { reportId: id }, manager);
    return {
      url: this.shareUrl(token),
      shareId: share.id,
      expiresAt: share.expiresAt,
    };
  }

  async revokeShare(id: string, shareId: string) {
    return this.withReportLock(id, async (report, manager) => {
      const share = await manager.getRepository(ReportShareEntity).findOne({
        where: { id: shareId, reportId: id, teacherId: this.teacher.teacherId },
      });
      if (!share) throw new NotFoundException('分享链接不存在');
      // A delayed retry for an old link must not withdraw a newer publication.
      if (share.revokedAt) return { revoked: true, status: report.status };
      await this.reopenDraft(report, manager);
      return { revoked: true, status: report.status };
    });
  }

  /** Also handles historical published reports whose links were already revoked. */
  async unpublish(id: string) {
    return this.withReportLock(id, async (report, manager) => {
      if (report.status !== 'published' && report.status !== 'draft')
        throw new BadRequestException('仅可重新编辑已发布报告或草稿');
      if (report.status === 'published')
        await this.reopenDraft(report, manager);
      return { status: report.status };
    });
  }

  private async reopenDraft(
    report: SemesterReportEntity,
    manager: EntityManager,
  ) {
    // Revoke every link for this report so an older token cannot expose later edits.
    await manager.getRepository(ReportShareEntity).update(
      {
        reportId: report.id,
        teacherId: this.teacher.teacherId,
        revokedAt: IsNull(),
      },
      { revokedAt: new Date(), tokenCiphertext: '' },
    );
    await this.log('share-revoked', { reportId: report.id }, manager);
    if (report.status === 'published') {
      report.status = 'draft';
      report.publishedAt = null;
      await manager.getRepository(SemesterReportEntity).save(report);
      await this.log('report-unpublished', { reportId: report.id }, manager);
    }
  }

  async deleteReport(id: string) {
    const row = await this.findReport(id);
    row.status = 'deleted';
    row.content = null;
    row.snapshot = null;
    row.studentId = `deleted:${row.id}`;
    row.studentName = '已删除';
    row.className = '';
    row.keywords = null;
    row.teacherObservation = null;
    row.courseScope = null;
    await this.reports.save(row);
    await this.shares.update(
      { teacherId: this.teacher.teacherId, reportId: id },
      { revokedAt: new Date(), tokenCiphertext: '' },
    );
    await this.log('report-deleted', { reportId: id });
    return { deleted: true };
  }

  async publicReport(token: string) {
    if (!/^[A-Za-z0-9_-]{40,50}$/.test(token))
      throw new NotFoundException('报告链接无效或已失效');
    const share = await this.shares.findOne({
      where: { tokenHash: this.tokenHash(token), revokedAt: IsNull() },
    });
    if (!share || (share.expiresAt && share.expiresAt <= new Date()))
      throw new NotFoundException('报告链接无效或已失效');
    const report = await this.reports.findOne({
      where: {
        id: share.reportId,
        teacherId: share.teacherId,
        status: 'published',
      },
    });
    if (!report?.content) throw new NotFoundException('报告链接无效或已失效');
    const subject = await this.subjects.findOne({
      where: { id: report.subjectId, teacherId: report.teacherId },
    });
    const term = await this.terms.findOne({
      where: { id: report.termId, teacherId: report.teacherId },
    });
    const snapshot = (report.snapshot ?? {}) as {
      courseDocuments?: Array<{
        id: string;
        fileName: string;
        pages: Array<{ page: number }>;
      }>;
      scoreSummary?: {
        records?: Array<{ id: string; label: string; delta: number }>;
      };
    };
    const sourceLabels: Record<string, string> = {};
    for (const doc of snapshot.courseDocuments ?? [])
      for (const page of doc.pages ?? [])
        sourceLabels[`course:${doc.id}:p${page.page}`] =
          `${doc.fileName} 第 ${page.page} 页`;
    for (const record of snapshot.scoreSummary?.records ?? [])
      sourceLabels[`score:${record.id}`] =
        `课堂评价：${record.label}${record.delta > 0 ? ` +${record.delta}` : ` ${record.delta}`}`;
    if (report.teacherObservation)
      sourceLabels['teacher-observation'] = '教师观察';
    type ReferencedEntry = { sourceRefs: string[] };
    const content = structuredClone(report.content) as Record<
      string,
      unknown
    > & {
      strengths?: ReferencedEntry[];
      areasToImprove?: ReferencedEntry[];
      homeSuggestions?: ReferencedEntry[];
      learningContents?: ReferencedEntry[];
      classroomPerformance?: ReferencedEntry[];
    };
    content.learningContents ??= learningContentsForReport(report);
    content.scoreDetails = scoreDetailsForSnapshot(report.snapshot ?? {});
    sourceLabels['teacher-review'] = '教师核对与评价';
    sourceLabels['teacher-input'] = '教师填写的学习评价';
    for (const key of [
      'strengths',
      'areasToImprove',
      'homeSuggestions',
      'learningContents',
      'classroomPerformance',
    ] as const)
      for (const item of content[key] ?? [])
        item.sourceRefs = item.sourceRefs
          .map((ref: string) => sourceLabels[ref])
          .filter((label): label is string => label !== undefined);
    return {
      studentName: report.studentName,
      className: report.className,
      subject: subject?.name ?? '',
      term: term?.name ?? '',
      period: report.periodType,
      start: report.periodStart,
      end: report.periodEnd,
      content,
      publishedAt: report.publishedAt,
      generationMode: report.snapshot?.generationMode ?? null,
      courseScope: report.courseScope,
    };
  }

  async retryReport(id: string) {
    const row = await this.findReport(id);
    if (row.status !== 'failed')
      throw new BadRequestException('仅可重试失败任务');
    const snapshot = row.snapshot ?? {};
    const previousReferences = Array.isArray(snapshot.allowedReferences)
      ? (snapshot.allowedReferences as string[])
      : [];
    if (
      row.periodType !== 'term' &&
      row.courseScope &&
      Array.isArray(snapshot.courseDocuments)
    ) {
      const sources = snapshot.courseDocuments as Array<{
        id: string;
        fileName: string;
        units?: string[];
        pages: Array<{ page: number; text: string }>;
      }>;
      const selected = selectCoursePages(
        sources.map((source) => ({
          id: source.id,
          fileName: source.fileName,
          confirmedUnits: source.units ?? [],
          sourcePages: source.pages,
        })),
        row.courseScope,
        row.periodType,
      ).filter((document) => document.pages.length);
      if (!selected.length)
        throw new BadRequestException(
          '原任务的课程片段未匹配到授课范围，请核对范围后重新生成',
        );
      const allowed = new Set(previousReferences);
      row.snapshot = {
        ...snapshot,
        courseDocuments: selected,
        allowedReferences: [
          ...previousReferences.filter(
            (reference) => !reference.startsWith('course:'),
          ),
          ...selected
            .flatMap((document) =>
              document.pages.map(
                (page) => `course:${document.id}:p${page.page}`,
              ),
            )
            .filter((reference) => allowed.has(reference)),
        ],
      };
    }
    row.status = 'queued';
    row.errorMessage = null;
    await this.reports.save(row);
    await this.log('report-retried', {
      reportId: id,
      details: {
        previousCourseReferences: previousReferences.filter((reference) =>
          reference.startsWith('course:'),
        ),
        courseReferences: (
          (row.snapshot?.allowedReferences ?? []) as string[]
        ).filter((reference) => reference.startsWith('course:')),
      },
    });
    return this.reportDto(row);
  }

  private validateContent(
    content: Record<string, unknown>,
    snapshot: Record<string, unknown>,
  ) {
    try {
      validateGeneratedReportContent(content, snapshot);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : '报告格式无效',
      );
    }
  }

  private validateRequest(input: Record<string, unknown>) {
    const period = input.period as (typeof periods)[number];
    if (!periods.includes(period))
      throw new BadRequestException('周期必须是 week、month 或 term');
    const start = parsePeriodBound(input.start, false);
    const end = parsePeriodBound(input.end, true);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start ||
      end.getTime() - start.getTime() > 400 * 86400000
    )
      throw new BadRequestException('报告周期无效');
    const duration = end.getTime() - start.getTime();
    if (period === 'week' && duration > 7 * 86400000)
      throw new BadRequestException('周报周期不能超过 7 天');
    if (period === 'month' && duration > 31 * 86400000)
      throw new BadRequestException('月报周期不能超过 31 天');
    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Shanghai',
    });
    if (end > new Date(shanghaiMidnight(today).getTime() + 86400000))
      throw new BadRequestException('不能生成未来日期的报告');
    const termId = String(input.termId ?? '');
    const subjectId = String(input.subjectId ?? '');
    const studentIds = Array.isArray(input.studentIds)
      ? [...new Set(input.studentIds.map(String))]
      : [];
    if (
      !termId ||
      !subjectId ||
      studentIds.length < 1 ||
      studentIds.length > 30
    )
      throw new BadRequestException('请选择学期、学科及 1 至 30 名学生');
    return { period, start, end, termId, subjectId, studentIds };
  }

  private async scoreSummary(
    student: PetStudentEntity,
    start: Date,
    end: Date,
  ) {
    const included = await this.records
      .createQueryBuilder('record')
      .where('record.teacher_id = :teacherId', {
        teacherId: this.teacher.teacherId,
      })
      .andWhere('record.student_id = :studentId', { studentId: student.id })
      .andWhere('record.created_at >= :start AND record.created_at < :end', {
        start,
        end,
      })
      .orderBy('record.created_at', 'ASC')
      .getMany();
    return {
      scope: 'overall',
      positive: included
        .filter((r) => r.delta > 0)
        .reduce((n, r) => n + r.delta, 0),
      negative: included
        .filter((r) => r.delta < 0)
        .reduce((n, r) => n + r.delta, 0),
      net: included.reduce((n, r) => n + r.delta, 0),
      count: included.length,
      records: included.slice(0, 80).map((r) => ({
        id: r.id,
        category: r.category,
        label: r.label,
        delta: r.delta,
        note: r.note,
        createdAt: r.createdAt,
      })),
    };
  }

  private async findStudents(ids: string[]) {
    const teacherId = this.teacher.teacherId;
    const rows = await this.students.find({ where: { teacherId } });
    const byId = new Map<string, PetStudentEntity>();
    for (const row of rows) {
      byId.set(row.id, row);
      byId.set(
        row.id.startsWith(`${teacherId}:`)
          ? row.id.slice(teacherId.length + 1)
          : row.id,
        row,
      );
    }
    return ids.map((id) => {
      const student = byId.get(id);
      if (!student) throw new NotFoundException(`学生不存在：${id}`);
      return student;
    });
  }

  private async findUsableDocuments(
    termId: string,
    subjectId: string,
    classId: string,
  ) {
    return this.documents.find({
      where: [
        {
          teacherId: this.teacher.teacherId,
          termId,
          subjectId,
          classId,
          status: 'ready',
        },
        {
          teacherId: this.teacher.teacherId,
          termId,
          subjectId,
          classId: '*',
          status: 'ready',
        },
      ],
      order: { createdAt: 'ASC' },
    });
  }

  private async requireTerm(id: string) {
    const row = await this.terms.findOne({
      where: { id, teacherId: this.teacher.teacherId },
    });
    if (!row) throw new NotFoundException('学期不存在');
    return row;
  }
  private async requireSubject(id: string) {
    const row = await this.subjects.findOne({
      where: { id, teacherId: this.teacher.teacherId, enabled: true },
    });
    if (!row) throw new NotFoundException('学科不存在');
    return row;
  }
  private async findDocument(id: string) {
    const row = await this.documents.findOne({
      where: { id, teacherId: this.teacher.teacherId },
    });
    if (!row || row.status === 'deleted')
      throw new NotFoundException('课程 PDF 不存在');
    return row;
  }
  private async findReport(id: string) {
    const row = await this.reports.findOne({
      where: { id, teacherId: this.teacher.teacherId },
    });
    if (!row || row.status === 'deleted')
      throw new NotFoundException('报告不存在');
    return row;
  }
  /** Serialize publication, link creation, withdrawal and editing across tabs;
   * the report state, links and audit events commit or roll back together.
   */
  private async withReportLock<T>(
    id: string,
    action: (row: SemesterReportEntity, manager: EntityManager) => Promise<T>,
  ) {
    return this.reports.manager.transaction(async (manager) => {
      const row = await manager.getRepository(SemesterReportEntity).findOne({
        where: { id, teacherId: this.teacher.teacherId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row || row.status === 'deleted')
        throw new NotFoundException('报告不存在');
      return action(row, manager);
    });
  }
  private publicDocument(row: ReportDocumentEntity) {
    return {
      id: row.id,
      termId: row.termId,
      subjectId: row.subjectId,
      classId: row.classId,
      fileName: normalizeUploadedFileName(row.fileName),
      status: row.status,
      errorMessage: row.errorMessage,
      pageCount: row.sourcePages?.length ?? 0,
      detectedUnits: row.contentText ? detectUnits(row.contentText) : [],
      units: row.confirmedUnits?.length
        ? row.confirmedUnits
        : detectUnits(row.contentText ?? ''),
      createdAt: row.createdAt,
    };
  }
  private reportDto(row: SemesterReportEntity) {
    return {
      id: row.id,
      termId: row.termId,
      subjectId: row.subjectId,
      studentId: row.studentId,
      studentName: row.studentName,
      className: row.className,
      period: row.periodType,
      start: row.periodStart,
      end: row.periodEnd,
      scoreScope: row.scoreScope,
      status: row.status,
      content: row.content
        ? {
            ...row.content,
            learningContents:
              row.content.learningContents ?? learningContentsForReport(row),
            scoreDetails: scoreDetailsForSnapshot(row.snapshot ?? {}),
          }
        : null,
      keywords: row.keywords,
      teacherObservation: row.teacherObservation,
      courseScope: row.courseScope,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt,
      publishedAt: row.publishedAt,
      generationMode: row.snapshot?.generationMode ?? null,
    };
  }
  private async activeShare(reportId: string) {
    const row = await this.shares.findOne({
      where: {
        reportId,
        teacherId: this.teacher.teacherId,
        revokedAt: IsNull(),
      },
    });
    if (!row || (row.expiresAt && row.expiresAt < new Date())) return null;
    return {
      id: row.id,
      url: this.shareUrl(this.decrypt(row.tokenCiphertext)),
      expiresAt: row.expiresAt,
    };
  }
  private async log(
    action: string,
    input: {
      reportId?: string;
      documentId?: string;
      details?: Record<string, unknown>;
    } = {},
    manager?: EntityManager,
  ) {
    const events = manager
      ? manager.getRepository(ReportEventEntity)
      : this.events;
    await events.save(
      events.create({
        id: randomUUID(),
        teacherId: this.teacher.teacherId,
        reportId: input.reportId ?? null,
        documentId: input.documentId ?? null,
        action,
        details: input.details ?? null,
      }),
    );
  }
  private validDate(value: unknown): value is string {
    return (
      typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
      new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
    );
  }
  private errorText(error: unknown) {
    return (error instanceof Error ? error.message : '处理失败').slice(0, 500);
  }
  private tokenHash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
  private shareUrl(token: string) {
    const base = (
      process.env.REPORT_PUBLIC_BASE_URL || 'http://localhost:3001'
    ).replace(/\/$/, '');
    return `${base}/r/${token}`;
  }
  private key() {
    const configured = process.env.REPORT_SHARE_ENCRYPTION_KEY;
    if (!configured || Buffer.from(configured, 'base64').length !== 32)
      throw new ServiceUnavailableException(
        'REPORT_SHARE_ENCRYPTION_KEY 必须配置为 32 字节 base64 密钥',
      );
    return Buffer.from(configured, 'base64');
  }
  private encrypt(text: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
      'base64',
    );
  }
  private decrypt(value: string) {
    const packed = Buffer.from(value, 'base64');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key(),
      packed.subarray(0, 12),
    );
    decipher.setAuthTag(packed.subarray(12, 28));
    return Buffer.concat([
      decipher.update(packed.subarray(28)),
      decipher.final(),
    ]).toString('utf8');
  }
}

function shanghaiMidnight(value: string | Date) {
  const date =
    value instanceof Date
      ? value.toISOString().slice(0, 10)
      : value.slice(0, 10);
  return new Date(`${date}T00:00:00+08:00`);
}

function parsePeriodBound(value: unknown, exclusiveEnd: boolean) {
  if (typeof value !== 'string') return new Date(Number.NaN);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const start = shanghaiMidnight(value);
    return exclusiveEnd ? new Date(start.getTime() + 86400000) : start;
  }
  return new Date(value);
}
