import type { DataSource } from 'typeorm';
import {
  parseCourseSelections,
  parseReportDetails,
  parseStudentFeedback,
} from './report-input';
import type { SemesterReportEntity } from './semester-report.entity';
import { SemesterReportsService } from './semester-reports.service';
import { SemesterReportWorker } from './semester-report.worker';
import { extractLearningContents } from './course-scope';
import {
  generateTemplateReport,
  addLearningReportSections,
  validateGeneratedReportContent,
} from './report-generation';

const details = {
  institutionName: 'WK课堂成长记录',
  lessonNumber: 1,
  lessonDate: '2026-09-26',
  courseTheme: 'Animals',
};
const course = {
  id: 'course',
  fileName: 'Health.pdf',
  confirmedUnits: [],
  sourcePages: [
    {
      page: 4,
      text: '| Unit1 | 1 | 听懂词汇 hand / foot | 教学策略 | 家庭活动 |',
    },
  ],
};
const goalId = extractLearningContents([course], 'Unit1 1', 'week')[0]!.id;
const feedback = {
  studentId: 'one',
  learningMastery: { [goalId]: 'needs_support' },
  classroomPerformance: [
    { label: '课堂任务', value: '基本完成' },
    { label: '课堂参与', value: '引导参与' },
  ],
  teacherMessage: '能按提示参与课堂活动，继续加油！',
  highlight: '提醒后主动参与',
  nextFocus: '练习听说词汇',
  homePractice: '每天跟读 5—10 分钟。',
};

// Test-only access to the service seams lets the fixtures stay typed without changing production visibility.
type ServiceInternals = {
  requireTerm: jest.Mock;
  requireSubject: jest.Mock;
  findUsableDocuments: jest.Mock;
  findStudents: jest.Mock;
  findReport: jest.Mock;
  scoreSummary: jest.Mock;
  petForPeriod: jest.Mock;
  students: { find: jest.Mock };
  records: { createQueryBuilder: jest.Mock };
};

describe('report generation input', () => {
  it('accepts picture-template metadata and only dates within the selected period', () => {
    const start = new Date('2026-09-21T00:00:00+08:00');
    const end = new Date('2026-09-28T00:00:00+08:00');
    expect(parseReportDetails(details, start, end)).toEqual(details);
    expect(() =>
      parseReportDetails({ ...details, lessonDate: '2026-09-28' }, start, end),
    ).toThrow('周期内');
    expect(() =>
      parseReportDetails({ ...details, lessonDate: '2026-02-30' }),
    ).toThrow('日期无效');
    expect(() => parseReportDetails({ ...details, lessonNumber: 1.5 })).toThrow(
      '整数',
    );
  });
  it('rejects feedback for unselected students, duplicate students, and stale lesson IDs', () => {
    expect(() => parseStudentFeedback([feedback], ['two'], [goalId])).toThrow(
      '已选学生',
    );
    expect(() =>
      parseStudentFeedback([feedback, feedback], ['one'], [goalId]),
    ).toThrow('不能重复');
    expect(() =>
      parseStudentFeedback([feedback], ['one'], ['other-goal']),
    ).toThrow('当前所选学习内容');
    expect(() =>
      parseStudentFeedback(
        [{ ...feedback, learningMastery: { [goalId]: 'perfect' } }],
        ['one'],
        [goalId],
      ),
    ).toThrow('掌握评价');
  });
  it('bounds teacher statements and prevents repeated classroom categories', () => {
    expect(() =>
      parseStudentFeedback(
        [{ ...feedback, teacherMessage: '字'.repeat(2501) }],
        ['one'],
        [goalId],
      ),
    ).toThrow('2500');
    expect(() =>
      parseStudentFeedback(
        [
          {
            ...feedback,
            classroomPerformance: [
              { label: '课堂任务', value: '基本完成' },
              { label: '课堂任务', value: '独立完成' },
            ],
          },
        ],
        ['one'],
        [goalId],
      ),
    ).toThrow('重复');
  });

  function setup() {
    const reports = {
      create: jest.fn((row) => row),
      save: jest.fn(async (row) => row),
    };
    const events = { create: jest.fn((row) => row), save: jest.fn() };
    const dependencies = [
      {},
      {},
      {},
      reports,
      {},
      events,
      {},
      {},
      { teacherId: 'teacher' },
    ] as unknown as ConstructorParameters<typeof SemesterReportsService>;
    const service = new SemesterReportsService(...dependencies);
    const internals = service as unknown as ServiceInternals;
    jest
      .spyOn(internals, 'requireTerm')
      .mockResolvedValue({ startDate: '2026-09-01', endDate: '2026-12-31' });
    jest.spyOn(internals, 'requireSubject').mockResolvedValue({ name: '英语' });
    jest.spyOn(internals, 'findUsableDocuments').mockResolvedValue([course]);
    jest.spyOn(internals, 'findStudents').mockResolvedValue([
      { id: 'one', name: '学生一', className: '一班' },
      { id: 'two', name: '学生二', className: '一班' },
    ]);
    jest.spyOn(internals, 'petForPeriod').mockResolvedValue({
      pet: null,
      petAsOf: '2026-09-27T04:00:00.000Z',
      petHistoryStatus: 'unavailable',
    });
    jest.spyOn(internals, 'scoreSummary').mockResolvedValue({
      count: 1,
      positive: 5,
      negative: 0,
      net: 5,
      records: [{ id: 'record', label: '课堂参与', delta: 5 }],
    });
    return { service, internals, reports };
  }
  const request = {
    period: 'week',
    generationMode: 'template',
    start: '2026-09-21',
    end: '2026-09-27',
    termId: 'term',
    subjectId: 'subject',
    studentIds: ['one', 'two'],
    courseScope: 'Unit1 1',
    reportDetails: details,
    studentFeedback: [
      feedback,
      { studentId: 'two', teacherMessage: '第二位学生的寄语' },
    ],
  };
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-27T12:00:00+08:00'));
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  it('previews each selected student’s pet point changes using an exclusive bound after the chosen end date', async () => {
    const { service, internals } = setup();
    const preview = await service.preview(request);
    expect(preview.petPreviews).toEqual([
      expect.objectContaining({
        studentId: 'one',
        pet: null,
        petHistoryStatus: 'unavailable',
      }),
      expect.objectContaining({
        studentId: 'two',
        pet: null,
        petHistoryStatus: 'unavailable',
      }),
    ]);
    expect(preview.start.toISOString()).toBe('2026-09-20T16:00:00.000Z');
    expect(preview.end.toISOString()).toBe('2026-09-27T16:00:00.000Z');
    expect(internals.scoreSummary).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'one' }),
      preview.start,
      preview.end,
    );
    expect(preview.scoreSummaries).toEqual([
      expect.objectContaining({ studentId: 'one', positive: 5, negative: 0 }),
      expect.objectContaining({ studentId: 'two', positive: 5, negative: 0 }),
    ]);
  });
  it('queries only the current teacher and selected student within the half-open report period', async () => {
    const { internals } = setup();
    internals.scoreSummary.mockRestore();
    const query = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 'plus',
          category: '课堂',
          label: '参与',
          delta: 5,
          createdAt: new Date('2026-09-21T01:00:00Z'),
        },
        {
          id: 'minus',
          category: '课堂',
          label: '提醒',
          delta: -2,
          createdAt: new Date('2026-09-22T01:00:00Z'),
        },
      ]),
    };
    internals.records.createQueryBuilder = jest.fn().mockReturnValue(query);
    const start = new Date('2026-09-20T16:00:00Z');
    const end = new Date('2026-09-27T16:00:00Z');
    const result = await internals.scoreSummary(
      { id: 'teacher:one' },
      start,
      end,
    );
    expect(query.where).toHaveBeenCalledWith('record.teacher_id = :teacherId', {
      teacherId: 'teacher',
    });
    expect(query.andWhere).toHaveBeenCalledWith(
      'record.student_id = :studentId',
      { studentId: 'teacher:one' },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'record.created_at >= :start AND record.created_at < :end',
      { start, end },
    );
    expect(result).toMatchObject({
      positive: 5,
      negative: -2,
      net: 3,
      count: 2,
    });
  });
  it('requires explicit course choices and bounds per-subject scopes', () => {
    for (const value of [
      undefined,
      [],
      [{ subjectId: '*', courseScope: '' }],
      [{ subjectId: 'english' }, { subjectId: 'english' }],
      [{ subjectId: 'english', courseScope: 'x'.repeat(1001) }],
    ]) {
      expect(() => parseCourseSelections(value, 'term')).toThrow();
    }
    expect(() =>
      parseCourseSelections(
        [{ subjectId: 'english', courseScope: '' }],
        'week',
      ),
    ).toThrow('分别填写');
    expect(
      parseCourseSelections(
        [{ subjectId: 'english', courseScope: '' }],
        'term',
      ),
    ).toEqual([{ subjectId: 'english', courseScope: '' }]);
  });
  it.each(['week', 'term'] as const)(
    "v2 %s scopes show only each subject's selected lessons in preview and snapshots",
    async (period) => {
      const { service, internals, reports } = setup();
      const sources = ['english', 'math', 'unselected'].map((subjectId) => ({
        ...course,
        id: subjectId,
        subjectId,
        classId: '*',
        fileName: `${subjectId}.pdf`,
        sourcePages: [
          {
            page: 1,
            text: `| Unit1 | 1 | ${subjectId} 第一课内容 | 教学策略 | 家庭活动 |`,
          },
          {
            page: 2,
            text: `| Unit2 | 1 | ${subjectId} 第二课内容 | 教学策略 | 家庭活动 |`,
          },
        ],
      }));
      internals.findUsableDocuments.mockResolvedValue(sources);
      internals.findStudents.mockResolvedValue([
        { id: 'one', name: '学生一', classId: 'class', className: '一班' },
      ]);
      internals.requireSubject.mockImplementation(async (id: string) => ({
        name: id === 'english' ? '英语' : '数学',
      }));
      const input = {
        ...request,
        period,
        reportVersion: 'v2',
        courseSelections: [
          { subjectId: 'english', courseScope: 'Unit1 1' },
          { subjectId: 'math', courseScope: 'Unit2 1' },
        ],
        studentIds: ['one'],
        studentFeedback: [],
      };
      const preview = await service.previewCourseScope(input);
      expect(preview.learningContents.map((item) => item.text)).toEqual([
        'english 第一课内容',
        'math 第二课内容',
      ]);
      expect(preview.documents).toEqual([
        { id: 'english', fileName: 'english.pdf', pages: [1] },
        { id: 'math', fileName: 'math.pdf', pages: [2] },
      ]);
      expect(
        preview.learningContents.map((item) => item.section).join(' '),
      ).toContain('数学');
      await service.generate(input);
      const snapshot = reports.save.mock.calls[0]![0].snapshot;
      expect(snapshot.courseSelections).toEqual(input.courseSelections);
      expect(
        snapshot.learningContents.map((item: { text: string }) => item.text),
      ).toEqual(preview.learningContents.map((item) => item.text));
      expect(snapshot.subjectName).toBe('英语、数学');
      expect(snapshot.allowedReferences).not.toContain('course:unselected:p1');
      expect(snapshot.allowedReferences).not.toContain('course:english:p2');
      expect(
        generateTemplateReport(reports.save.mock.calls[0]![0])
          .learningContents.map((item) => item.text)
          .join(' '),
      ).not.toContain('unselected');
      jest
        .spyOn(internals, 'findReport')
        .mockResolvedValue(reports.save.mock.calls[0]![0]);
      const regenerate = jest.spyOn(service, 'generate');
      await service.regenerate(reports.save.mock.calls[0]![0].id);
      expect(regenerate).toHaveBeenLastCalledWith(
        expect.objectContaining({ courseSelections: input.courseSelections }),
      );
      await expect(
        service.generate({ ...input, courseSelections: [] }),
      ).rejects.toThrow('至少一门');
      await expect(
        service.previewCourseScope({
          ...input,
          courseSelections: [{ subjectId: 'english', courseScope: '第99页' }],
        }),
      ).rejects.toThrow('没有匹配');
      internals.requireSubject.mockRejectedValueOnce(new Error('学科不存在'));
      await expect(service.generate(input)).rejects.toThrow('学科不存在');
    },
  );
  it.each(['v1', 'v2'])(
    'uses the period-end history instead of the live pet for %s reports and regeneration',
    async (reportVersion) => {
      const { service, internals, reports } = setup();
      const pet = {
        petId: 'sprout-puff',
        petName: '团团',
        stage: '第4形态',
        level: 4,
        petHatched: true,
      };
      const student = {
        id: 'one',
        name: '学生一',
        classId: 'class',
        className: '一班',
        ...pet,
        level: 10,
        stage: '终极形态',
      };
      internals.findStudents.mockResolvedValue([student]);
      internals.findUsableDocuments.mockResolvedValue([
        { ...course, subjectId: 'subject', classId: '*' },
      ]);
      internals.petForPeriod.mockResolvedValue({
        pet,
        petAsOf: '2026-09-26T15:59:59.999Z',
        petHistoryStatus: 'recorded',
      });
      const input = {
        ...request,
        end: '2026-09-26',
        reportVersion,
        studentIds: ['one'],
        studentFeedback: [],
        ...(reportVersion === 'v2'
          ? {
              courseSelections: [
                { subjectId: 'subject', courseScope: 'Unit1 1' },
              ],
            }
          : {}),
      };
      await service.generate(input, 'saved-photo');
      const original = reports.save.mock.calls[0]![0];
      expect(original.snapshot).toMatchObject({
        pet,
        petHistoryStatus: 'recorded',
        classroomPhoto: 'saved-photo',
        petAsOf: '2026-09-26T15:59:59.999Z',
      });
      expect(internals.petForPeriod).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'one' }),
        new Date('2026-09-26T16:00:00Z'),
      );
      expect(generateTemplateReport(original).pet).toEqual(pet);
      jest.spyOn(internals, 'findReport').mockResolvedValue(original);
      await service.regenerate(original.id);
      expect(reports.save.mock.calls.at(-1)![0].snapshot.pet).toEqual(pet);
      expect(reports.save.mock.calls.at(-1)![0].snapshot.classroomPhoto).toBe(
        'saved-photo',
      );
      internals.petForPeriod.mockResolvedValue({
        pet: null,
        petAsOf: '2026-09-26T15:59:59.999Z',
        petHistoryStatus: 'unavailable',
      });
      await service.generate(input);
      expect(reports.save.mock.calls.at(-1)![0].snapshot).toMatchObject({
        pet: null,
        petHistoryStatus: 'unavailable',
      });
    },
  );
  it('v2 selects explicitly chosen subjects and snapshots each student pet with both courses', async () => {
    const { service, internals, reports } = setup();
    internals.findUsableDocuments.mockResolvedValue([
      { ...course, subjectId: 'english', classId: '*' },
      {
        ...course,
        id: 'math',
        subjectId: 'math',
        fileName: 'Math.pdf',
        classId: '*',
        sourcePages: [
          {
            page: 1,
            text: '| Unit1 | 1 | 认识数字一二三 | 教学策略 | 家庭活动 |',
          },
        ],
      },
    ]);
    internals.findStudents.mockResolvedValue([
      {
        id: 'one',
        name: '学生一',
        classId: 'class',
        className: '一班',
        petId: 'sprout-puff',
        petName: '团团',
        stage: '成长形态',
        level: 4,
        petHatched: true,
      },
    ]);
    internals.petForPeriod.mockResolvedValue({
      pet: {
        petId: 'sprout-puff',
        petName: '团团',
        stage: '成长形态',
        level: 4,
        petHatched: true,
      },
      petAsOf: '2026-09-27T04:00:00.000Z',
      petHistoryStatus: 'recorded',
    });
    await service.generate({
      ...request,
      reportVersion: 'v2',
      courseSelections: [
        { subjectId: 'english', courseScope: '' },
        { subjectId: 'math', courseScope: '' },
      ],
      period: 'term',
      studentIds: ['one'],
      studentFeedback: [],
      courseScope: '',
    });
    expect(internals.requireSubject).toHaveBeenCalledWith('english');
    expect(internals.requireSubject).toHaveBeenCalledWith('math');
    expect(internals.findUsableDocuments).toHaveBeenCalledWith(
      'term',
      '*',
      '*',
    );
    const row = reports.save.mock.calls[0]![0];
    expect(
      row.snapshot.courseDocuments.map((doc: { id: string }) => doc.id),
    ).toEqual(['course', 'math']);
    const content = generateTemplateReport(row);
    expect(content).toMatchObject({
      reportVersion: 'v2',
      pet: { petName: '团团', stage: '成长形态' },
      areasToImprove: [],
    });
    expect(
      content.learningContents.map((item) => item.text).join(' '),
    ).toContain('认识数字');
    expect(() =>
      validateGeneratedReportContent(content, row.snapshot),
    ).not.toThrow();
  });
  it('v2 excludes other-class courses and rejects an empty class before queueing', async () => {
    const { service, internals, reports } = setup();
    internals.findUsableDocuments.mockResolvedValue([
      { ...course, subjectId: 'english', classId: 'other-class' },
    ]);
    internals.findStudents.mockResolvedValue([
      { id: 'one', name: '学生一', classId: 'class', className: '一班' },
    ]);
    await expect(
      service.generate({
        ...request,
        reportVersion: 'v2',
        courseSelections: [{ subjectId: 'english', courseScope: 'Unit1 1' }],
        studentIds: ['one'],
        studentFeedback: [],
      }),
    ).rejects.toThrow('所在班级');
    expect(reports.save).not.toHaveBeenCalled();
    await expect(
      service.generate({ ...request, subjectId: '*' }),
    ).rejects.toThrow('请选择');
  });
  it('all-subject document query remains restricted to the teacher, term and confirmed state', async () => {
    const { service } = setup();
    const find = jest.fn().mockResolvedValue([]);
    const raw = service as unknown as {
      documents: { find: typeof find };
      findUsableDocuments: (
        term: string,
        subject: string,
        classId: string,
      ) => Promise<unknown>;
    };
    raw.documents = { find };
    // Restore the production query rather than asserting a mocked source selector.
    await (
      SemesterReportsService.prototype as unknown as typeof raw
    ).findUsableDocuments.call(service, 'term', '*', '*');
    expect(find.mock.calls[0]![0].where[0]).toEqual({
      teacherId: 'teacher',
      termId: 'term',
      status: 'ready',
    });
  });
  it('queues separate student snapshots and carries every filled field into each generated report', async () => {
    const { service, reports } = setup();
    await service.generate(request);
    const rows = reports.save.mock.calls.map(([row]) => row);
    expect(rows).toHaveLength(2);
    const first = generateTemplateReport(rows[0]);
    expect(first.reportDetails).toEqual(details);
    expect(first.learningContents[0]?.mastery).toBe('needs_support');
    expect(first.classroomPerformance[0]?.text).toBe('课堂任务 · 基本完成');
    expect(first.summary).toBe(feedback.teacherMessage);
    expect(first.strengths[0]?.text).toBe(feedback.highlight);
    expect(first.areasToImprove[0]?.text).toBe(feedback.nextFocus);
    expect(first.homeSuggestions[0]?.text).toBe(feedback.homePractice);
    expect(() =>
      validateGeneratedReportContent(first, rows[0].snapshot),
    ).not.toThrow();
    const second = generateTemplateReport(rows[1]);
    expect(second.summary).toBe('第二位学生的寄语');
    expect(second.learningContents[0]?.mastery).toBe('unassessed');
    expect(second.classroomPerformance).toEqual([]);
  });
  it('preserves teacher-entered facts and ratings when AI prose contains different claims', async () => {
    const { service, reports } = setup();
    await service.generate(request);
    const report = reports.save.mock.calls[0]![0];
    const content = addLearningReportSections(
      {
        ...generateTemplateReport(report),
        summary: 'AI changed message',
        learningContents: [],
      },
      report,
    );
    expect(content.summary).toBe(feedback.teacherMessage);
    expect(content.learningContents[0]?.mastery).toBe('needs_support');
    expect(() =>
      validateGeneratedReportContent(content, report.snapshot),
    ).not.toThrow();
  });
  it('matches client student IDs to stored IDs without dropping or mixing classroom feedback', async () => {
    const { service, internals, reports } = setup();
    internals.findStudents.mockRestore();
    internals.students.find = jest.fn().mockResolvedValue([
      {
        id: 'teacher:one',
        teacherId: 'teacher',
        name: '学生一',
        className: '一班',
      },
      {
        id: 'teacher:two',
        teacherId: 'teacher',
        name: '学生二',
        className: '二班',
      },
    ]);
    await service.generate({
      ...request,
      studentIds: ['two', 'teacher:one'],
      studentFeedback: [
        { ...feedback, studentId: 'teacher:one' },
        {
          studentId: 'two',
          classroomPerformance: [{ label: '课堂参与', value: '主动参与' }],
          teacherMessage: '第二位学生的寄语',
        },
      ],
    });
    const rows = reports.save.mock.calls.map(([row]) => row);
    expect(rows.map((row) => row.studentId)).toEqual([
      'teacher:two',
      'teacher:one',
    ]);
    expect(rows[0].snapshot.teacherInput.studentId).toBe('teacher:two');
    expect(rows[1].snapshot.teacherInput.studentId).toBe('teacher:one');
    const first = generateTemplateReport(rows[0]);
    const second = generateTemplateReport(rows[1]);
    expect(first.classroomPerformance).toEqual([
      { text: '课堂参与 · 主动参与', sourceRefs: ['teacher-input'] },
    ]);
    expect(first.summary).toBe('第二位学生的寄语');
    expect(second.classroomPerformance).toHaveLength(2);
    expect(second.summary).toBe(feedback.teacherMessage);
    expect(second.learningContents[0].mastery).toBe('needs_support');
    expect(() =>
      validateGeneratedReportContent(first, rows[0].snapshot),
    ).not.toThrow();
    expect(() =>
      validateGeneratedReportContent(second, rows[1].snapshot),
    ).not.toThrow();
    jest.spyOn(internals, 'findReport').mockResolvedValue(rows[1]);
    const regenerate = jest
      .spyOn(service, 'generate')
      .mockResolvedValue({ reports: [] });
    await service.regenerate(rows[1].id);
    expect(regenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        studentIds: ['teacher:one'],
        studentFeedback: [rows[1].snapshot.teacherInput],
      }),
    );
  });
  it('validates the whole batch before queuing any report', async () => {
    const { service, reports } = setup();
    await expect(
      service.generate({
        ...request,
        studentFeedback: [feedback, { studentId: 'other' }],
      }),
    ).rejects.toThrow('已选学生');
    expect(reports.save).not.toHaveBeenCalled();
  });
  it('passes individual teacher feedback to AI and preserves it in the report', async () => {
    const previous = { ...process.env };
    try {
      process.env.REPORT_AI_BASE_URL = 'https://example.invalid/v1';
      process.env.REPORT_AI_API_KEY = 'test';
      process.env.REPORT_AI_MODEL = 'test';
      const { service, reports } = setup();
      await service.generate(request);
      const report = reports.save.mock.calls[0]![0];
      const fetch = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify(generateTemplateReport(report)),
              },
            },
          ],
        }),
      } as Response);
      const worker = new SemesterReportWorker(
        {} as unknown as DataSource,
      ) as unknown as {
        generate: (
          report: SemesterReportEntity,
          mode: 'ai',
        ) => Promise<{ summary: string }>;
      };
      const result = await worker.generate(report, 'ai');
      const body = JSON.parse(fetch.mock.calls[0]![1]!.body as string);
      const aiInput = JSON.parse(body.messages[1].content);
      expect(aiInput.teacherInput.classroomPerformance[0].value).toBe(
        '基本完成',
      );
      expect(result.summary).toBe(feedback.teacherMessage);
    } finally {
      process.env = previous;
    }
  });
});
