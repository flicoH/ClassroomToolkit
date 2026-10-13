import {
  BadRequestException,
  ConflictException,
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
import { readReportPublicBaseUrl } from './report-public-url';
import {
  detectCourseUnits as detectUnits,
  selectCoursePages,
  extractLearningContents,
  type LearningContent,
} from './course-scope';
import {
  resolveReportGenerationMode,
  learningContentsForReport,
  scoreDetailsForSnapshot,
  positiveScoreItems,
  validateGeneratedReportContent,
  reportVisualsForSnapshot,
  classroomPhotosForSnapshot,
  classroomPhotoCaptionsForSnapshot,
} from './report-generation';
import { PetEvaluationRecordEntity } from '../pet-points/entities/pet-evaluation-record.entity';
import {
  parseCourseSelections,
  type CourseSelection,
  parseReportDetails,
  parseStudentFeedback,
  type ReportDetails,
  type StudentFeedback,
} from './report-input';
import { PetStudentEntity } from '../pet-points/entities/pet-student.entity';
import { PetStateHistoryEntity } from '../pet-points/entities/pet-state-history.entity';
import { petAppearanceAtReportEnd } from '../pet-points/pet-state-history';
import {
  ReportDocumentEntity,
  ReportEventEntity,
  ReportShareEntity,
  ReportSubjectEntity,
  ReportTermEntity,
  SemesterReportEntity,
} from './semester-report.entity';

import {
  captureReportVersion,
  historyEventDto,
  readReportRevision,
  reportVersionToken,
} from './report-history';

import {
  defaultPerformanceConfig,
  parsePerformanceConfig,
} from './performance-config';

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
    const subjects = await this.subjects.find({
      where: { teacherId: this.teacher.teacherId, enabled: true },
      order: { name: 'ASC' },
    });
    return subjects.map((subject) => ({
      ...subject,
      performanceConfig:
        subject.performanceConfig ?? defaultPerformanceConfig(),
    }));
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
        performanceConfig: defaultPerformanceConfig(),
      }),
    );
  }

  async updateSubjectPerformance(id: string, input: Record<string, unknown>) {
    const subject = await this.requireSubject(id);
    const performanceConfig = parsePerformanceConfig(input.performanceConfig);
    return this.subjects.save({ ...subject, performanceConfig });
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
    if (subjectId !== '*') await this.requireSubject(subjectId);
    if (
      start < shanghaiMidnight(term.startDate) ||
      end > new Date(shanghaiMidnight(term.endDate).getTime() + 86400000)
    )
      throw new BadRequestException('报告周期必须在学期日期范围内');
    const { documents: docs } = await this.selectedCourses(
      input,
      termId,
      subjectId,
      period,
    );
    const students = await this.findStudents(studentIds);
    const summaries = await Promise.all(
      students.map((student) => this.scoreSummary(student, start, end)),
    );
    const petPreviews = await Promise.all(
      students.map(async (student, index) => ({
        ...(await this.petForPeriod(student, end)),
        studentId: studentIds[index],
      })),
    );
    return {
      period,
      start,
      end,
      scoreScope: 'overall',
      petPreviews,
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
    const subjectId =
      input.reportVersion === 'v2' ? '*' : String(input.subjectId ?? '');
    await this.requireTerm(termId);
    if (input.reportVersion !== 'v2') await this.requireSubject(subjectId);
    const courses = await this.selectedCourses(
      input,
      termId,
      subjectId,
      period,
    );
    const { selected, learningContents, courseScope: scope } = courses;
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

  async generate(
    input: Record<string, unknown>,
    classroomPhoto?: string | null,
    classroomPhotos?: Array<string | null>,
    classroomPhotoCaptions?: string[],
  ) {
    const { period, start, end, termId, subjectId, studentIds } =
      this.validateRequest(input);
    const teacherId = this.teacher.teacherId;
    const term = await this.requireTerm(termId);
    const subject =
      subjectId === '*'
        ? { name: '全部课程' }
        : await this.requireSubject(subjectId);
    if (
      start < shanghaiMidnight(term.startDate) ||
      end > new Date(shanghaiMidnight(term.endDate).getTime() + 86400000)
    )
      throw new BadRequestException('报告周期必须在学期日期范围内');
    const {
      documents,
      selected: selectedCourseDocuments,
      learningContents,
      courseScope,
      selections,
      subjectName,
      reportSubjects: courseSubjects,
    } = await this.selectedCourses(input, termId, subjectId, period);
    subject.name = subjectName || subject.name;
    if (
      input.reportVersion !== 'v2' &&
      period !== 'term' &&
      courseScope.length < 2
    )
      throw new BadRequestException(
        '周报和月报请填写本周期已授课章节或教学范围',
      );
    if (input.reportVersion !== 'v2' && !documents.length)
      throw new BadRequestException('请先上传并确认所选学科的课程 PDF');
    if (documents.length > 20)
      throw new BadRequestException('单次最多使用 20 份课程 PDF');
    if (
      input.reportVersion !== 'v2' &&
      !selectedCourseDocuments.some((document) => document.pages.length)
    )
      throw new BadRequestException(
        '所填授课范围未匹配到课程 PDF 页面，请检查章节名称',
      );
    const totalCourseChars = selectedCourseDocuments.reduce(
      (sum, d) =>
        sum +
        d.pages.reduce((pageTotal, page) => pageTotal + page.text.length, 0),
      0,
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
        selections?.map((item) => item.subjectId) ?? [],
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
    const isV2 = input.reportVersion === 'v2';
    const studentCourses = students.map((student) =>
      selectedCourseDocuments.filter((selected) => {
        const original = documents.find(
          (document) => document.id === selected.id,
        )!;
        return (
          !isV2 ||
          original.classId === '*' ||
          original.classId === student.classId
        );
      }),
    );
    if (
      isV2 &&
      studentCourses.some((courses) =>
        selections!.some(
          (selection) =>
            selection.manualContent === undefined &&
            !courses.some(
              (course) =>
                course.pages.length &&
                documents.find((document) => document.id === course.id)
                  ?.subjectId === selection.subjectId,
            ),
        ),
      )
    )
      throw new BadRequestException('部分学生所在班级没有可用的已确认课程资料');
    const created: SemesterReportEntity[] = [];
    for (const [index, student] of students.entries()) {
      // Feedback is keyed by the client ID; resolved students use stored IDs.
      const submittedFeedback = feedback.get(studentIds[index]!);
      const teacherInput = submittedFeedback
        ? { ...submittedFeedback, studentId: student.id }
        : undefined;
      const scores = await this.scoreSummary(student, start, end);
      const snapshot = {
        reportVersion: isV2 ? 'v2' : 'v1',
        courseSelections: selections,
        reportSubjects: courseSubjects,
        classroomPhoto: classroomPhoto ?? null,
        ...(classroomPhotos ? { classroomPhotos } : {}),
        ...(classroomPhotoCaptions ? { classroomPhotoCaptions } : {}),
        ...(await this.petForPeriod(student, end)),
        generationMode,
        learningContents: isV2
          ? learningContents.filter((item) =>
              item.sourceRefs.every(
                (ref) =>
                  ref.startsWith('teacher-course:') ||
                  studentCourses[index]!.some((course) =>
                    ref.startsWith(`course:${course.id}:`),
                  ),
              ),
            )
          : learningContents,
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
        courseDocuments: studentCourses[index]!.map((d) => ({
          id: d.id,
          fileName: d.fileName,
          subjectId: documents.find((document) => document.id === d.id)
            ?.subjectId,
          units: d.units,
          pages: d.pages.map((page) => ({
            page: page.page,
            text: page.text,
          })),
        })),
        allowedReferences: [
          ...(selections ?? [])
            .filter((selection) => selection.manualContent)
            .map((selection) => `teacher-course:${selection.subjectId}`),
          ...studentCourses[index]!.flatMap((d) =>
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
    // Sort IDs separately: MySQL can defer JSON projections until after filesort,
    // carrying the original 5MB photo snapshot and exhausting sort_buffer_size.
    const ordered = await this.reports
      .createQueryBuilder('report')
      .select(['report.id'])
      .where('report.teacherId = :teacherId', {
        teacherId: this.teacher.teacherId,
      })
      .andWhere('report.status != :deleted', { deleted: 'deleted' })
      .orderBy('report.createdAt', 'DESC')
      .take(200)
      .getMany();
    if (!ordered.length) return [];
    const ids = ordered.map((row) => row.id);
    const { entities, raw } = await this.reports
      .createQueryBuilder('report')
      .select([
        'report.id',
        'report.termId',
        'report.subjectId',
        'report.studentId',
        'report.studentName',
        'report.className',
        'report.periodType',
        'report.periodStart',
        'report.periodEnd',
        'report.scoreScope',
        'report.status',
        'report.keywords',
        'report.teacherObservation',
        'report.courseScope',
        'report.errorMessage',
        'report.createdAt',
        'report.updatedAt',
        'report.publishedAt',
      ])
      .addSelect(
        `JSON_OBJECT(
          'reportVersion', JSON_EXTRACT(report.snapshot, '$.reportVersion'),
          'subjectName', JSON_EXTRACT(report.snapshot, '$.subjectName'),
          'courseSelections', JSON_EXTRACT(report.snapshot, '$.courseSelections'),
          'generationMode', JSON_EXTRACT(report.snapshot, '$.generationMode'),
          'courseSubjectIds', JSON_EXTRACT(report.snapshot, '$.courseDocuments[*].subjectId')
        )`,
        'summary_snapshot',
      )
      .where('report.teacherId = :teacherId', {
        teacherId: this.teacher.teacherId,
      })
      .andWhere('report.status != :deleted', { deleted: 'deleted' })
      .andWhere('report.id IN (:...ids)', { ids })
      .getRawAndEntities();
    const summaries = await Promise.all(
      entities.map(async (r, index) => {
        // MySQL driver versions return JSON projections as either text or objects.
        const value = raw[index].summary_snapshot;
        const metadata =
          (typeof value === 'string' ? JSON.parse(value) : value) ?? {};
        const summary = this.reportDto({
          ...r,
          snapshot: {
            ...metadata,
            courseDocuments: (metadata.courseSubjectIds ?? []).map(
              (subjectId: string) => ({ subjectId }),
            ),
          },
          content: null,
        });
        return { ...summary, share: await this.activeShare(r.id) };
      }),
    );
    const positions = new Map(ids.map((id, index) => [id, index]));
    return summaries.sort(
      (a, b) => positions.get(a.id)! - positions.get(b.id)!,
    );
  }

  async getReport(id: string) {
    return this.currentReportDto(await this.findReport(id));
  }

  async getEvents(id: string) {
    await this.findReport(id);
    // Listing must not load every version's PDFs and photo bytes into memory.
    const events = await this.events.find({
      select: ['id', 'action', 'createdAt'],
      where: { teacherId: this.teacher.teacherId, reportId: id },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return events.map((event) => {
      const { id, action, label, createdAt } = historyEventDto(event, false);
      return { id, action, label, createdAt };
    });
  }

  async getEvent(id: string, eventId: string) {
    const row = await this.findReport(id);
    const event = await this.events.findOne({
      where: { id: eventId, reportId: id, teacherId: this.teacher.teacherId },
    });
    if (!event) throw new NotFoundException('流程记录不存在');
    return {
      ...historyEventDto(event),
      currentVersion: reportVersionToken(row),
    };
  }

  /** Restore only saved report state under the same lock as publishing. Sharing
   * state is never replayed; the restore itself keeps a version for undo. */
  async restoreEvent(
    id: string,
    eventId: string,
    input: { side?: unknown; expectedVersion?: unknown },
  ) {
    return this.withReportLock(id, async (row, manager) => {
      if (row.status !== 'draft' && row.status !== 'published')
        throw new BadRequestException('只有草稿或已发布报告可以恢复为草稿');
      if (input?.side !== 'before' && input?.side !== 'after')
        throw new BadRequestException('恢复目标无效');
      const event = await manager.getRepository(ReportEventEntity).findOne({
        where: {
          id: eventId,
          reportId: id,
          teacherId: this.teacher.teacherId,
        },
      });
      if (!event) throw new NotFoundException('流程记录不存在');
      const revision = readReportRevision(event.details);
      const target = revision?.[input.side];
      if (!target?.content)
        throw new BadRequestException('该记录未保存可恢复的历史版本');
      if (input.expectedVersion !== reportVersionToken(row))
        throw new ConflictException('报告已发生变化，请重新查看记录后恢复');
      const before = captureReportVersion(row);
      const snapshot = structuredClone(target.snapshot);
      const content = {
        ...structuredClone(target.content),
        ...reportVisualsForSnapshot(snapshot),
      };
      this.validateContent(content, snapshot);
      // Withdraw links in the same transaction so no public token exposes the
      // historical draft; any restore/audit failure also rolls back withdrawal.
      await this.reopenDraft(row, manager);
      row.status = 'draft';
      row.publishedAt = null;
      row.snapshot = snapshot;
      row.content = content;
      row.courseScope = target.courseScope;
      await manager.getRepository(SemesterReportEntity).save(row);
      await this.log(
        'report-restored',
        {
          reportId: id,
          details: {
            restoredEventId: eventId,
            restoredSide: input.side,
            revision: { schema: 1, before, after: captureReportVersion(row) },
          },
        },
        manager,
      );
      return this.currentReportDto(row);
    });
  }

  async editDraft(id: string, content: Record<string, unknown>) {
    return this.withReportLock(id, async (row, manager) => {
      const before = captureReportVersion(row);
      if (row.status !== 'draft')
        throw new BadRequestException('只有草稿可以编辑');
      const captions = content.classroomPhotoCaptions;
      let classroomPhotoCaptions = classroomPhotoCaptionsForSnapshot(
        row.snapshot ?? {},
      );
      if (captions !== undefined) {
        if (
          !Array.isArray(captions) ||
          captions.length !== 2 ||
          captions.some((caption) => typeof caption !== 'string')
        )
          throw new BadRequestException('照片说明必须为两个位置的文字');
        classroomPhotoCaptions = captions.map((caption) =>
          (caption as string).trim(),
        );
        const photos = classroomPhotosForSnapshot(row.snapshot ?? {});
        for (const [index, caption] of classroomPhotoCaptions.entries()) {
          // Count Unicode code points so one emoji counts as one character, like a Chinese character.
          if (Array.from(caption).length > 10)
            throw new BadRequestException('每张照片说明最多 10 个字');
          if (caption && !photos[index])
            throw new BadRequestException('该位置没有照片，不能保存说明');
        }
      }
      const reviewedSnapshot = {
        ...row.snapshot,
        classroomPhotoCaptions,
        allowedReferences: [
          ...new Set([
            ...((row.snapshot?.allowedReferences as string[]) ?? []),
            'teacher-review',
          ]),
        ],
        teacherReviewedAt: new Date().toISOString(),
      };
      content = {
        ...content,
        ...reportVisualsForSnapshot(reviewedSnapshot),
        // v2 clients may submit live counts from a newer read; only server data is trusted.
        ...(row.snapshot?.reportVersion === 'v2'
          ? {
              scoreDetails: scoreDetailsForSnapshot(reviewedSnapshot),
              ...(Array.isArray(content.areasToImprove)
                ? {
                    areasToImprove: (
                      content.areasToImprove as Array<Record<string, unknown>>
                    ).filter(
                      (entry) =>
                        typeof entry?.text === 'string' && entry.text.trim(),
                    ),
                  }
                : {}),
            }
          : {}),
      };
      this.validateContent(content, reviewedSnapshot);
      row.snapshot = reviewedSnapshot;
      row.content = content;
      await manager.getRepository(SemesterReportEntity).save(row);
      await this.log(
        'draft-edited',
        {
          reportId: id,
          details: {
            revision: { schema: 1, before, after: captureReportVersion(row) },
          },
        },
        manager,
      );
      return this.currentReportDto(row);
    });
  }

  /** Append confirmed courses under the report lock without regenerating teacher edits. */
  async addDraftSubjects(id: string, input: unknown) {
    return this.withReportLock(id, async (row, manager) => {
      const before = captureReportVersion(row);
      if (
        row.status !== 'draft' ||
        row.snapshot?.reportVersion !== 'v2' ||
        !row.content
      )
        throw new BadRequestException('只有 v2 草稿可以添加学科');
      await this.requireTerm(row.termId);
      let additions: CourseSelection[];
      try {
        additions = parseCourseSelections(input, row.periodType);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : '课程选择无效',
        );
      }
      const existing = this.reportCourseSelections(row);
      if (
        additions.some((item) =>
          existing.some((old) => old.subjectId === item.subjectId),
        )
      )
        throw new BadRequestException('该学科已添加到报告');
      if (existing.length + additions.length > 20)
        throw new BadRequestException('最多选择 20 门学科');
      const [student] = await this.findStudents([row.studentId]);
      const courses = await this.selectedCourses(
        { reportVersion: 'v2', courseSelections: additions },
        row.termId,
        '*',
        row.periodType,
        student!.classId ?? '*',
      );
      const oldDocuments = (row.snapshot.courseDocuments ?? []) as Array<{
        id: string;
        fileName: string;
        subjectId?: string;
        pages: Array<{ page: number; text: string }>;
      }>;
      const documents = [
        ...oldDocuments,
        ...courses.selected.map((doc) => ({
          ...doc,
          subjectId: courses.documents.find((source) => source.id === doc.id)!
            .subjectId,
        })),
      ];
      if (documents.length > 20)
        throw new BadRequestException('单次最多使用 20 份课程 PDF');
      if (
        documents.reduce(
          (total, doc) =>
            total +
            doc.pages.reduce((chars, page) => chars + page.text.length, 0),
          0,
        ) > 120000
      )
        throw new BadRequestException('课程资料内容较多，请缩小授课范围');
      const learningContents = [
        ...((row.content.learningContents as ReturnType<
          typeof learningContentsForReport
        >) ?? learningContentsForReport(row)),
        ...courses.learningContents.map((item) => ({
          ...item,
          mastery: 'unassessed' as const,
        })),
      ];
      if (learningContents.length > 500)
        throw new BadRequestException('学习内容超过 500 项，请缩小授课范围');
      const snapshot = {
        ...row.snapshot,
        courseSelections: [...existing, ...additions],
        reportSubjects: [
          ...(reportVisualsForSnapshot(row.snapshot).reportSubjects ?? []),
          ...courses.reportSubjects,
        ],
        subjectName: [
          String(row.snapshot.subjectName ?? ''),
          courses.subjectName,
        ]
          .filter(Boolean)
          .join('、'),
        courseDocuments: documents,
        learningContents: learningContents.map((item) => {
          const snapshotItem: LearningContent & { mastery?: string } = {
            ...item,
          };
          delete snapshotItem.mastery;
          return snapshotItem;
        }),
        allowedReferences: [
          ...new Set([
            ...((row.snapshot.allowedReferences ?? []) as string[]),
            ...additions
              .filter((selection) => selection.manualContent)
              .map((selection) => `teacher-course:${selection.subjectId}`),
            ...courses.selected.flatMap((doc) =>
              doc.pages.map((page) => `course:${doc.id}:p${page.page}`),
            ),
            'teacher-review',
          ]),
        ],
      };
      const content = {
        ...row.content,
        learningContents,
        ...reportVisualsForSnapshot(snapshot),
      };
      this.validateContent(content, snapshot);
      row.snapshot = snapshot;
      row.content = content;
      row.courseScope = [row.courseScope, courses.courseScope]
        .filter(Boolean)
        .join('；');
      await manager.getRepository(SemesterReportEntity).save(row);
      await this.log(
        'draft-subjects-added',
        {
          reportId: id,
          details: {
            subjectIds: additions.map((item) => item.subjectId),
            revision: { schema: 1, before, after: captureReportVersion(row) },
          },
        },
        manager,
      );
      return this.currentReportDto(row);
    });
  }

  /** Remove sources by document identity, not display names, so similarly named
   * subjects cannot lose each other's evaluations. The report lock serializes publishing. */
  async removeDraftSubject(id: string, subjectId: string) {
    return this.withReportLock(id, async (row, manager) => {
      const before = captureReportVersion(row);
      if (
        row.status !== 'draft' ||
        row.snapshot?.reportVersion !== 'v2' ||
        !row.content
      )
        throw new BadRequestException('只有 v2 草稿可以删除学科');
      const existing = this.reportCourseSelections(row);
      if (!existing.some((item) => item.subjectId === subjectId))
        throw new BadRequestException('报告未包含该学科');
      const selections = existing.filter(
        (item) => item.subjectId !== subjectId,
      );
      if (!selections.length)
        throw new BadRequestException('报告至少保留一门学科');
      const documents = (row.snapshot.courseDocuments ?? []) as Array<{
        id: string;
        fileName: string;
        subjectId?: string;
        pages: Array<{ page: number; text: string }>;
      }>;
      const removedDocuments = new Set(
        documents
          .filter((doc) => doc.subjectId === subjectId)
          .map((doc) => doc.id),
      );
      const isRemovedReference = (ref: string) => {
        const match = /^course:(.+):p\d+$/.exec(ref);
        return (
          ref === `teacher-course:${subjectId}` ||
          Boolean(match && removedDocuments.has(match[1]!))
        );
      };
      const removedReferences = (
        (row.snapshot.allowedReferences ?? []) as string[]
      ).filter(isRemovedReference);
      // A mixed-source suggestion still refers to the removed course; discard the
      // whole entry instead of preserving a claim with incomplete evidence.
      const keepEntry = (entry: { sourceRefs: string[] }) =>
        !entry.sourceRefs.some(isRemovedReference);
      const learningContents = (
        (row.content.learningContents as ReturnType<
          typeof learningContentsForReport
        >) ?? learningContentsForReport(row)
      ).filter(keepEntry);
      const names = await Promise.all(
        selections.map(
          async (item) => (await this.requireSubject(item.subjectId)).name,
        ),
      );
      const courseScope = selections
        .map(
          (item, index) =>
            `${names[index]}：${item.manualContent !== undefined ? item.manualContent || '教学内容待补充' : item.courseScope || '本学期全部内容'}`,
        )
        .join('；');
      const originalGoals = (row.snapshot.learningContents ??
        row.content.learningContents ??
        learningContentsForReport(row)) as LearningContent[];
      const teacherInput = row.snapshot.teacherInput as
        | StudentFeedback
        | undefined;
      const removedGoalIds = new Set(
        originalGoals.filter((item) => !keepEntry(item)).map((item) => item.id),
      );
      const snapshot = {
        ...row.snapshot,
        courseSelections: selections,
        reportSubjects: selections.map((selection, index) => ({
          subjectId: selection.subjectId,
          name: names[index]!,
        })),
        subjectName: names.join('、'),
        courseScope,
        courseDocuments: documents.filter(
          (doc) => !removedDocuments.has(doc.id),
        ),
        learningContents: originalGoals.filter(keepEntry),
        allowedReferences: (
          (row.snapshot.allowedReferences ?? []) as string[]
        ).filter((ref) => !isRemovedReference(ref)),
        ...(teacherInput
          ? {
              teacherInput: {
                ...teacherInput,
                classroomPerformance: (
                  teacherInput.classroomPerformance ?? []
                ).filter((item) => item.subjectId !== subjectId),
                learningMastery: Object.fromEntries(
                  Object.entries(teacherInput.learningMastery ?? {}).filter(
                    ([goalId]) => !removedGoalIds.has(goalId),
                  ),
                ),
              },
            }
          : {}),
      };
      const content: Record<string, unknown> = {
        ...row.content,
        learningContents,
        ...reportVisualsForSnapshot(snapshot),
      };
      for (const key of [
        'strengths',
        'areasToImprove',
        'homeSuggestions',
        'classroomPerformance',
      ]) {
        if (Array.isArray(content[key]))
          content[key] = (
            content[key] as Array<{ sourceRefs: string[] }>
          ).filter(
            (item) =>
              keepEntry(item) &&
              (key !== 'classroomPerformance' ||
                (item as { subjectId?: string }).subjectId !== subjectId),
          );
      }
      this.validateContent(content, snapshot);
      row.snapshot = snapshot;
      row.content = content;
      row.courseScope = courseScope;
      await manager.getRepository(SemesterReportEntity).save(row);
      await this.log(
        'draft-subject-removed',
        {
          reportId: id,
          details: {
            subjectId,
            revision: { schema: 1, before, after: captureReportVersion(row) },
          },
        },
        manager,
      );
      // The browser uses these references to clean unsaved edits without replacing other prose.
      return { report: await this.currentReportDto(row), removedReferences };
    });
  }

  private reportCourseSelections(row: SemesterReportEntity): CourseSelection[] {
    return (
      (row.snapshot?.courseSelections as CourseSelection[] | undefined) ??
      [
        ...new Set(
          (
            (row.snapshot?.courseDocuments ?? []) as Array<{
              subjectId?: string;
            }>
          )
            .map((doc) => doc.subjectId)
            .filter((id): id is string => Boolean(id)),
        ),
      ].map((subjectId) => ({ subjectId, courseScope: '' }))
    );
  }

  async setClassroomPhoto(
    id: string,
    file?: { buffer: Buffer; size: number; mimetype: string },
    slot: unknown = 0,
  ) {
    return this.withReportLock(id, async (row, manager) => {
      const before = captureReportVersion(row);
      if (row.status !== 'draft')
        throw new BadRequestException('只有草稿可以修改课堂照片');
      if (![0, 1, '0', '1'].includes(slot as string | number))
        throw new BadRequestException('课堂照片位置必须为 0 或 1');
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
        )
          throw new BadRequestException(
            '请上传 JPG 或 PNG 课堂照片（每张最大 2MB）',
          );
        classroomPhoto = `data:${png ? 'image/png' : 'image/jpeg'};base64,${file.buffer.toString('base64')}`;
      }
      const classroomPhotos = classroomPhotosForSnapshot(row.snapshot ?? {});
      classroomPhotos[Number(slot)] = classroomPhoto;
      const classroomPhotoCaptions = classroomPhotoCaptionsForSnapshot(
        row.snapshot ?? {},
      );
      if (!file) classroomPhotoCaptions[Number(slot)] = '';
      row.snapshot = {
        ...row.snapshot,
        classroomPhotos,
        classroomPhotoCaptions,
        classroomPhoto: classroomPhotos[0] ?? null,
      };
      row.content = {
        ...row.content,
        classroomPhoto: classroomPhotos[0] ?? null,
        classroomPhotos,
        classroomPhotoCaptions,
      };
      await manager.getRepository(SemesterReportEntity).save(row);
      await this.log(
        file ? 'classroom-photo-uploaded' : 'classroom-photo-removed',
        {
          reportId: id,
          details: {
            revision: { schema: 1, before, after: captureReportVersion(row) },
          },
        },
        manager,
      );
      return this.currentReportDto(row);
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
      readReportPublicBaseUrl();
      if (row.snapshot?.reportVersion === 'v2') {
        row.snapshot = {
          ...row.snapshot,
          reportScoreSummary: await this.currentReportScoreSummary(
            row,
            manager,
          ),
        };
      }
      if (row.snapshot?.reportVersion === 'v2') {
        row.content = {
          ...row.content,
          scoreDetails: scoreDetailsForSnapshot(row.snapshot),
        };
      }
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
      reportVersion: old.snapshot?.reportVersion,
      courseSelections: old.snapshot?.courseSelections,
      studentIds: [old.studentId],
      reportDetails: old.snapshot?.reportDetails,
      studentFeedback: old.snapshot?.teacherInput
        ? [old.snapshot.teacherInput]
        : undefined,
      keywords: old.keywords,
      teacherObservation: old.teacherObservation,
      courseScope: old.courseScope,
    };
    if (old.snapshot?.reportVersion === 'v2' && !input.courseSelections) {
      const saved = old.snapshot.courseDocuments as
        | Array<{ id: string }>
        | undefined;
      const documents = await this.findUsableDocuments(old.termId, '*', '*');
      input.courseSelections = [
        ...new Set(
          documents
            .filter((document) =>
              saved?.some((source) => source.id === document.id),
            )
            .map((document) => document.subjectId),
        ),
      ].map((subjectId) => ({ subjectId, courseScope: old.courseScope ?? '' }));
    }
    const photos = classroomPhotosForSnapshot(old.snapshot ?? {});
    return photos.some(Boolean)
      ? this.generate(
          input,
          photos[0],
          photos,
          classroomPhotoCaptionsForSnapshot(old.snapshot ?? {}),
        )
      : this.generate(input);
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
    readReportPublicBaseUrl();
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
    for (const subject of reportVisualsForSnapshot(report.snapshot ?? {})
      .reportSubjects ?? [])
      sourceLabels[`teacher-course:${subject.subjectId}`] =
        `${subject.name}：教师填写的教学内容`;
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
    Object.assign(content, reportVisualsForSnapshot(report.snapshot ?? {}));
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
      subject:
        report.snapshot?.reportVersion === 'v2'
          ? String(report.snapshot.subjectName ?? '全部课程')
          : (subject?.name ?? ''),
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
      snapshot.reportVersion !== 'v2' &&
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
    return this.currentReportDto(row);
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
    const subjectId =
      input.reportVersion === 'v2' ? '*' : String(input.subjectId ?? '');
    const studentIds = Array.isArray(input.studentIds)
      ? [...new Set(input.studentIds.map(String))]
      : [];
    if (
      !termId ||
      !subjectId ||
      (subjectId === '*' && input.reportVersion !== 'v2') ||
      studentIds.length < 1 ||
      studentIds.length > 30
    )
      throw new BadRequestException('请选择学期、学科及 1 至 30 名学生');
    return { period, start, end, termId, subjectId, studentIds };
  }

  private petForPeriod(student: PetStudentEntity, end: Date) {
    return petAppearanceAtReportEnd(
      this.students.manager.getRepository(PetStateHistoryEntity),
      this.teacher.teacherId,
      student.id,
      end,
    );
  }

  /** Refresh only score presentation; original generation references and teacher prose
   * remain intact. Publication reads through its transaction before freezing the result. */
  private async currentReportScoreSummary(
    row: SemesterReportEntity,
    manager?: EntityManager,
  ) {
    const savedStudent = row.snapshot?.student as { id?: string } | undefined;
    const student = savedStudent?.id
      ? { id: savedStudent.id }
      : (await this.findStudents([row.studentId]))[0]!;
    return this.scoreSummary(
      student,
      row.periodStart,
      row.periodEnd,
      manager?.getRepository(PetEvaluationRecordEntity),
    );
  }

  /** Draft reads are current but never rewrite the saved report or its edit timestamp. */
  private async currentReportDto(row: SemesterReportEntity) {
    if (
      row.status !== 'draft' ||
      row.snapshot?.reportVersion !== 'v2' ||
      !row.content
    )
      return this.reportDto(row);
    return this.reportDto({
      ...row,
      snapshot: {
        ...row.snapshot,
        reportScoreSummary: await this.currentReportScoreSummary(row),
      },
    });
  }

  private async scoreSummary(
    student: Pick<PetStudentEntity, 'id'>,
    start: Date,
    end: Date,
    records = this.records,
  ) {
    const included = await records
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
      // Aggregate before capping saved details so every period event is counted.
      positiveItems: positiveScoreItems(included),
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

  private async selectedCourses(
    input: Record<string, unknown>,
    termId: string,
    subjectId: string,
    period: 'week' | 'month' | 'term',
    studentClassId?: string,
  ) {
    let selections: CourseSelection[] | undefined;
    if (input.reportVersion === 'v2') {
      try {
        selections = parseCourseSelections(input.courseSelections, period);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : '课程选择无效',
        );
      }
    }
    const subjects = selections
      ? await Promise.all(
          selections.map((selection) =>
            this.requireSubject(selection.subjectId),
          ),
        )
      : [];
    const found = await this.findUsableDocuments(
      termId,
      subjectId,
      String(input.classId ?? '*'),
    );
    const available =
      // Draft additions target one student; global previews may include all classes.
      studentClassId === undefined
        ? found
        : found.filter(
            (doc) => doc.classId === '*' || doc.classId === studentClassId,
          );
    const groups: CourseSelection[] = selections ?? [
      {
        subjectId,
        courseScope: String(input.courseScope ?? '')
          .trim()
          .slice(0, 1000),
      },
    ];
    const documents = selections
      ? available.filter((document) =>
          selections.some(
            (selection) =>
              selection.manualContent === undefined &&
              selection.subjectId === document.subjectId,
          ),
        )
      : available;
    const selected = groups.flatMap((selection, index) => {
      if (selection.manualContent !== undefined) return [];

      const sources = selections
        ? documents.filter(
            (document) => document.subjectId === selection.subjectId,
          )
        : documents;
      if (selections && !sources.length)
        throw new BadRequestException(
          `${subjects[index]?.name ?? '所选学科'}没有已确认课程 PDF，请填写教学内容`,
        );
      const pages = selectCoursePages(sources, selection.courseScope, period);
      if (selections && !pages.some((document) => document.pages.length))
        throw new BadRequestException(
          `${subjects[index]?.name ?? '所选学科'}没有匹配的已确认课程页面，请核对授课范围或上传课程 PDF`,
        );
      return selections
        ? pages.filter((document) => document.pages.length)
        : pages;
    });
    const learningContents = groups.flatMap((selection, index) => {
      // Teacher-authored goals have stable IDs and subject-specific provenance;
      // they are teaching content, never evidence of the student's mastery.
      if (selection.manualContent !== undefined)
        return selection.manualContent
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((text, line) => ({
            id: `manual-${createHash('sha256')
              .update(JSON.stringify([selection.subjectId, text, line]))
              .digest('hex')
              .slice(0, 24)}`,
            section: `${subjects[index]!.name.slice(0, 60)} · 教师填写`,
            text,
            sourceRefs: [`teacher-course:${selection.subjectId}`],
          }));

      const sources = selections
        ? documents.filter(
            (document) => document.subjectId === selection.subjectId,
          )
        : documents;
      return this.learningContents(
        sources,
        selection.courseScope,
        period,
        Boolean(selections),
      ).map((item) =>
        selections
          ? {
              ...item,
              section: `${subjects[index]!.name.slice(0, 30)} · ${item.section.slice(0, 67)}`,
            }
          : item,
      );
    });
    return {
      documents,
      selected,
      learningContents,
      selections,
      subjectName: subjects.map((subject) => subject.name).join('、'),
      reportSubjects: (selections ?? []).map((selection, index) => ({
        subjectId: selection.subjectId,
        name: subjects[index]!.name,
      })),
      courseScope: selections
        ? selections
            .map(
              (selection, index) =>
                `${subjects[index]!.name}：${selection.manualContent !== undefined ? selection.manualContent || '教学内容待补充' : selection.courseScope || '本学期全部内容'}`,
            )
            .join('；')
        : groups[0]!.courseScope,
    };
  }

  private learningContents(
    documents: ReportDocumentEntity[],
    scope: string,
    period: 'week' | 'month' | 'term',
    allCourses: boolean,
  ) {
    const items = extractLearningContents(documents, scope, period);
    if (!allCourses) return items;
    // Course headings can repeat across subjects; retain the source document in the visible group.
    return items.map((item) => {
      const document = documents.find((doc) =>
        item.sourceRefs.some((ref) => ref.startsWith(`course:${doc.id}:`)),
      );
      return {
        ...item,
        section: `${document?.fileName.slice(0, 40) ?? '课程'} · ${item.section.slice(0, 57)}`,
      };
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
          ...(subjectId === '*' ? {} : { subjectId, classId }),
          status: 'ready',
        },
        {
          teacherId: this.teacher.teacherId,
          termId,
          ...(subjectId === '*' ? {} : { subjectId }),
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
      reportVersion: row.snapshot?.reportVersion ?? 'v1',
      courseSelections: this.reportCourseSelections(row),
      subjectName: row.snapshot?.subjectName,
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
            ...reportVisualsForSnapshot(row.snapshot ?? {}),
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
      updatedAt: row.updatedAt ?? null,
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
    let details = input.details ?? null;
    // Publication/link events also need the contemporaneous report body, not
    // just status metadata. Read under the caller's report lock/transaction.
    if (
      manager &&
      input.reportId &&
      !details?.revision &&
      [
        'report-published',
        'report-unpublished',
        'share-created',
        'share-revoked',
      ].includes(action)
    ) {
      const report = await manager.getRepository(SemesterReportEntity).findOne({
        where: { id: input.reportId, teacherId: this.teacher.teacherId },
      });
      if (report?.content)
        details = {
          ...details,
          revision: { schema: 1, after: captureReportVersion(report) },
        };
    }
    await events.save(
      events.create({
        id: randomUUID(),
        teacherId: this.teacher.teacherId,
        reportId: input.reportId ?? null,
        documentId: input.documentId ?? null,
        action,
        details,
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
    return `${readReportPublicBaseUrl()}/r/${token}`;
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
