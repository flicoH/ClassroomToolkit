/// <reference types="jest" />
// 独立学科报告服务回归：校验教师边界、正文保存、分享和历史兼容。
import { SubjectReportsService } from './subject-reports.service';

describe('SubjectReportsService', () => {
  let service: SubjectReportsService;
  let mockReportsRepo: Record<string, jest.Mock>;
  let mockSharesRepo: Record<string, jest.Mock>;
  let mockEventsRepo: Record<string, jest.Mock>;
  let mockTokenCallsRepo: Record<string, jest.Mock>;
  let mockTermsRepo: Record<string, jest.Mock>;
  let mockSubjectsRepo: Record<string, jest.Mock>;
  let mockDocumentsRepo: Record<string, jest.Mock>;
  let mockStudentsRepo: Record<string, jest.Mock>;
  let mockRecordsRepo: Record<string, jest.Mock>;
  let mockStudentProfilesRepo: Record<string, jest.Mock>;
  let mockTeacher: { teacherId: string };
  let mockSemesterReportsService: Record<string, jest.Mock>;

  it('saves normalized titles within the current teacher and allows removing all titles', async () => {
    mockSubjectsRepo.update.mockResolvedValue({ affected: 1 });
    await service.updateCourseContentTitles('sub-eng', {
      courseContentTitles: [' 阅读 '],
    });
    expect(mockSubjectsRepo.update).toHaveBeenCalledWith(
      { id: 'sub-eng', teacherId: 'test-teacher', enabled: true },
      { courseContentTitles: ['阅读'] },
    );
    await service.updateCourseContentTitles('sub-eng', {
      courseContentTitles: [],
    });
    expect(mockSubjectsRepo.update).toHaveBeenLastCalledWith(
      expect.anything(),
      { courseContentTitles: [] },
    );
  });

  it.each([
    null,
    [''],
    ['a', ' a '],
    ['a：b'],
    ['a\n b'],
    [2],
    Array(13).fill('a'),
    ['a'.repeat(41)],
  ])('rejects invalid titles %j', async (courseContentTitles) => {
    await expect(
      service.updateCourseContentTitles('sub-eng', { courseContentTitles }),
    ).rejects.toThrow();
    expect(mockSubjectsRepo.update).not.toHaveBeenCalled();
  });

  it('cannot configure another teacher or disabled subject', async () => {
    mockSubjectsRepo.findOne.mockResolvedValue(null);
    await expect(
      service.updateCourseContentTitles('other', {
        courseContentTitles: ['阅读'],
      }),
    ).rejects.toThrow();
    expect(mockSubjectsRepo.update).not.toHaveBeenCalled();
  });

  it.each(['draft', 'published'])(
    'preserves %s report editing, publishing or existing sharing after term deletion',
    async (status) => {
      const previousKey = process.env.SEMESTER_REPORT_SHARE_SECRET;
      process.env.SEMESTER_REPORT_SHARE_SECRET =
        'test-secret-at-least-32-chars-long-123456';
      try {
        const row = {
          id: 'r1',
          teacherId: 'test-teacher',
          termId: 'term-1',
          status,
          studentName: '小宇',
          className: '启航班',
          periodType: 'week',
          snapshot: { termName: '秋季学期', subjectName: '英语' },
          content: { summary: '原有报告', courseContent: '颜色词汇' },
        };
        mockReportsRepo.findOne.mockResolvedValue(row);
        mockSharesRepo.findOne.mockResolvedValue({
          reportId: 'r1',
          teacherId: 'test-teacher',
        });
        const original =
          status === 'published' ? await service.createShare('r1') : undefined;
        await service.deleteTerm('term-1');
        mockTermsRepo.findOne.mockResolvedValue(null);
        if (status === 'draft') {
          await service.editDraft('r1', { summary: '编辑后的报告' });
        }
        const shared = original ?? (await service.publish('r1'));
        const parent = await service.publicReport(
          new URL(shared.url, 'https://school.test').pathname.split('/').pop()!,
        );
        expect(parent).toMatchObject({
          term: '秋季学期',
          content: {
            courseContent: '颜色词汇',
            summary: status === 'draft' ? '编辑后的报告' : '原有报告',
          },
        });
        expect(mockSharesRepo.update).not.toHaveBeenCalled();
        expect(mockTermsRepo.findOne).not.toHaveBeenCalled();
      } finally {
        if (previousKey === undefined)
          delete process.env.SEMESTER_REPORT_SHARE_SECRET;
        else process.env.SEMESTER_REPORT_SHARE_SECRET = previousKey;
      }
    },
  );

  it('delegates term deletion without changing subject reports', async () => {
    await expect(service.deleteTerm('term-1')).resolves.toEqual({
      deleted: true,
    });
    expect(mockSemesterReportsService.deleteTerm).toHaveBeenCalledWith(
      'term-1',
    );
    expect(mockReportsRepo.save).not.toHaveBeenCalled();
    expect(mockSharesRepo.update).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    mockTeacher = { teacherId: 'test-teacher' };
    mockReportsRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn((r: { id?: string }) =>
        Promise.resolve({ ...r, id: r.id || 'saved-id' }),
      ),
      create: jest.fn((r: Record<string, unknown>) => ({ ...r })),
      createQueryBuilder: jest.fn(),
    };
    mockSharesRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn((s: { id?: string }) =>
        Promise.resolve({ ...s, id: s.id || 'share-id' }),
      ),
      create: jest.fn((s: Record<string, unknown>) => ({ ...s })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    mockEventsRepo = {
      find: jest.fn(),
      save: jest.fn(),
      create: jest.fn((e: Record<string, unknown>) => ({ ...e })),
    };
    mockTokenCallsRepo = {};
    mockTermsRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'term-1',
        name: '秋季学期',
        startDate: '2026-09-01',
        endDate: '2027-01-20',
      }),
    };
    mockSubjectsRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'sub-eng',
          name: '英语',
          enabled: true,
          performanceConfig: null,
        },
      ]),
      create: jest.fn((s: Record<string, unknown>) => ({ ...s })),
      save: jest.fn((s: { id?: string }) =>
        Promise.resolve({ ...s, id: s.id || 'saved-subject-id' }),
      ),
      update: jest.fn(),
      findOne: jest.fn().mockResolvedValue({
        id: 'sub-eng',
        name: '英语',
        enabled: true,
      }),
    };
    mockDocumentsRepo = {};
    mockStudentsRepo = {
      find: jest.fn().mockResolvedValue([
        { id: 's1', name: '小宇', className: '启航班' },
        { id: 's2', name: '乐乐', className: '启航班' },
      ]),
    };
    mockRecordsRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    mockStudentProfilesRepo = {};
    mockSemesterReportsService = {
      subjectReportStudent: jest.fn().mockResolvedValue(null),
      subjectReportPresentation: jest.fn().mockResolvedValue({
        student: { id: 's1', name: '小宇', className: '启航班' },
        studentPhoto: 'data:image/png;base64,avatar',
        pet: {
          petId: 'cat',
          petName: '小猫',
          level: 2,
          stage: '成长',
          petHatched: true,
        },
        petHistoryStatus: 'recorded',
        petAsOf: '2026-10-07T15:59:59.999Z',
      }),
      listTerms: jest.fn().mockResolvedValue([]),
      deleteTerm: jest.fn().mockResolvedValue({ deleted: true }),
      listSubjects: jest.fn().mockResolvedValue([]),
      createSubject: jest
        .fn()
        .mockResolvedValue({ id: 'sem-sub', name: '学期学科' }),
      listDocuments: jest.fn().mockResolvedValue([]),
      previewCourseScope: jest.fn().mockResolvedValue({ learningContents: [] }),
      preview: jest.fn().mockResolvedValue({ scoreSummaries: [] }),
    };

    service = new SubjectReportsService(
      mockReportsRepo as unknown as never,
      mockSharesRepo as unknown as never,
      mockEventsRepo as unknown as never,
      mockTokenCallsRepo as unknown as never,
      mockTermsRepo as unknown as never,
      mockSubjectsRepo as unknown as never,
      mockDocumentsRepo as unknown as never,
      mockStudentsRepo as unknown as never,
      mockRecordsRepo as unknown as never,
      mockStudentProfilesRepo as unknown as never,
      mockTeacher as unknown as never,
      mockSemesterReportsService as unknown as never,
    );
  });

  it('previews PDFs using the owned draft scope even after its subject was disabled', async () => {
    mockReportsRepo.findOne.mockResolvedValueOnce({
      id: 'r1',
      status: 'draft',
      termId: 'term-1',
      subjectId: 'sub-eng',
      periodType: 'week',
    });
    await service.previewDraftCourseScope('r1', { courseScope: '第3页' });
    expect(mockReportsRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'r1', teacherId: 'test-teacher' },
    });
    expect(mockSemesterReportsService.previewCourseScope).toHaveBeenCalledWith(
      {
        termId: 'term-1',
        subjectId: 'sub-eng',
        period: 'week',
        reportVersion: 'v1',
        courseScope: '第3页',
      },
      {
        allowDisabledSubject: true,
        allowDisabledTerm: true,
        skipSubjectValidation: true,
      },
    );
    mockReportsRepo.findOne.mockResolvedValueOnce(null);
    await expect(
      service.previewDraftCourseScope('foreign', { courseScope: '第3页' }),
    ).rejects.toThrow();
    expect(mockSemesterReportsService.previewCourseScope).toHaveBeenCalledTimes(
      1,
    );
  });

  it('validates subject and term ownership within subject reports and delegates preview with skipSubjectValidation', async () => {
    mockTermsRepo.findOne.mockResolvedValue({
      id: 'term-1',
      teacherId: 'test-teacher',
      enabled: true,
    });
    mockSubjectsRepo.findOne.mockResolvedValue({
      id: 'sub-1',
      teacherId: 'test-teacher',
      enabled: true,
      name: '英语',
    });

    const body = {
      termId: 'term-1',
      subjectId: 'sub-1',
      period: 'week',
      courseSelections: [{ subjectId: 'sub-1', manualContent: '内容' }],
    };
    await service.preview(body);
    expect(mockTermsRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'term-1', teacherId: 'test-teacher', enabled: true },
    });
    expect(mockSubjectsRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'sub-1', teacherId: 'test-teacher', enabled: true },
    });
    expect(mockSemesterReportsService.preview).toHaveBeenCalledWith(body, {
      skipSubjectValidation: true,
    });

    mockSubjectsRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.preview(body)).rejects.toThrow('学科不存在');
  });

  it('reads missing lesson attendance from the original snapshot', async () => {
    mockReportsRepo.findOne.mockResolvedValue({
      id: 'r1',
      teacherId: 'test-teacher',
      studentId: 's1',
      status: 'draft',
      content: {
        attendance: 'present',
        attendances: ['present'],
        courseContent: '第 1 节课 · red\n第 2 节课 · cat',
      },
      snapshot: { attendances: ['present', 'excused'] },
    });
    const result = await service.getReport('r1');
    expect(result.content?.attendances).toEqual(['present', 'excused']);
    expect(mockReportsRepo.save).not.toHaveBeenCalled();
  });

  it('resolves placeholder student identity on public reports even when a portrait is already saved', async () => {
    mockSharesRepo.findOne.mockResolvedValue({
      reportId: 'r1',
      teacherId: 'test-teacher',
    });
    const row = {
      id: 'r1',
      teacherId: 'test-teacher',
      studentId: 's1',
      studentName: '学生',
      className: '默认班级',
      status: 'published',
      content: { studentPhoto: 'original-photo' },
      snapshot: {},
    };
    mockReportsRepo.findOne.mockResolvedValue(row);
    mockSemesterReportsService.subjectReportStudent.mockResolvedValue({
      name: '方雅盈',
      className: '黄龙班',
      studentPhoto: 'current-photo',
    });
    await expect(service.publicReport('a'.repeat(43))).resolves.toMatchObject({
      studentName: '方雅盈',
      className: '黄龙班',
      content: { studentPhoto: 'original-photo' },
    });
    expect(row.studentName).toBe('学生');
    expect(mockReportsRepo.save).not.toHaveBeenCalled();
  });

  it('shows an existing report portrait without rewriting its saved content', async () => {
    const row = {
      id: 'r1',
      studentId: 's1',
      status: 'draft',
      content: { summary: '原报告' },
      snapshot: {},
    };
    mockReportsRepo.findOne.mockResolvedValue(row);
    mockSemesterReportsService.subjectReportStudent.mockResolvedValue({
      studentPhoto: 'saved-portrait',
    });
    const result = await service.getReport('r1');
    expect(result.content?.studentPhoto).toBe('saved-portrait');
    expect(row.content).toEqual({ summary: '原报告' });
    expect(mockReportsRepo.save).not.toHaveBeenCalled();
  });

  it('disables only subjects owned by the current teacher', async () => {
    mockSubjectsRepo.update
      .mockResolvedValueOnce({ affected: 1 })
      .mockResolvedValueOnce({ affected: 0 });
    await expect(service.deleteSubject('sub-eng')).resolves.toEqual({
      deleted: true,
    });
    expect(mockSubjectsRepo.update).toHaveBeenCalledWith(
      { id: 'sub-eng', teacherId: 'test-teacher' },
      { enabled: false },
    );
    await expect(service.deleteSubject('other-teacher')).rejects.toThrow(
      '学科不存在',
    );
  });

  it('delegates term queries to shared curriculum data while isolating subject queries and management', async () => {
    await service.listTerms();
    expect(mockSemesterReportsService.listTerms).toHaveBeenCalledTimes(1);

    const subjects = await service.listSubjects();
    expect(mockSemesterReportsService.listSubjects).not.toHaveBeenCalled();
    expect(mockSubjectsRepo.find).toHaveBeenCalledWith({
      where: { teacherId: 'test-teacher', enabled: true },
      order: { name: 'ASC' },
    });
    expect(subjects[0]?.name).toBe('英语');
    expect(subjects[0]?.performanceConfig).toBeDefined();

    const created = await service.createSubject({ name: '戏剧' });
    expect(mockSubjectsRepo.save).toHaveBeenCalled();
    expect(created.name).toBe('戏剧');
    expect(mockSemesterReportsService.createSubject).not.toHaveBeenCalled();
  });

  it('binds subject to a term on creation and filters by termId with legacy fallback', async () => {
    mockTermsRepo.count = jest.fn().mockResolvedValue(1);
    await expect(service.createSubject({ name: '数学' })).rejects.toThrow(
      '请选择所属学期',
    );

    const created = await service.createSubject({
      name: '数学',
      termId: 'term-1',
    });
    expect(mockSubjectsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '数学',
        termId: 'term-1',
      }),
    );
    expect(created.termId).toBe('term-1');

    await service.listSubjects({ termId: 'term-1' });
    expect(mockSubjectsRepo.find).toHaveBeenCalledWith({
      where: [
        { teacherId: 'test-teacher', enabled: true, termId: 'term-1' },
        {
          teacherId: 'test-teacher',
          enabled: true,
          termId: expect.anything() as unknown as string,
        },
      ],
      order: { name: 'ASC' },
    });
  });

  it('generates subject reports into subject_reports table and isolates data', async () => {
    const input = {
      termId: 'term-1',
      subjectId: 'sub-eng',
      period: 'week',
      start: '2026-10-01',
      end: '2026-10-07',
      studentIds: ['s1'],
      courseScope: 'Unit 1 Colours',
      studentFeedback: [
        {
          studentId: 's1',
          teacherMessage: '积极发言',
          attendance: 'late',
          nextFocus: '每天朗读五分钟',
          growthAssessment: { learningReadiness: '能独立准备学习用品' },
          classroomPerformance: [
            { subjectId: 'sub-eng', label: '课堂参与', value: '主动参与' },
          ],
        },
      ],
    };

    mockRecordsRepo.find.mockResolvedValue([
      {
        id: 'score-1',
        createdAt: new Date('2026-10-03T03:00:00Z'),
        delta: 2,
        label: '主动参与',
      },
    ]);
    const results = await service.generate(input);
    expect(results).toHaveLength(1);
    expect(results[0]?.content).toMatchObject({
      attendance: 'late',
      courseContent: 'Unit 1 Colours',
      studentPhoto: 'data:image/png;base64,avatar',
      pet: { petId: 'cat' },
      petHistoryStatus: 'recorded',
      scoreDetails: { positiveItems: [{ label: '主动参与', count: 1 }] },
      growthAssessment: { learningReadiness: '能独立准备学习用品' },
      areasToImprove: [{ text: '每天朗读五分钟' }],
      classroomPerformance: [
        { subjectId: 'sub-eng', text: '课堂参与 · 主动参与' },
      ],
    });
    expect(mockReportsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        teacherId: 'test-teacher',
        studentId: 's1',
        studentName: '小宇',
        status: 'draft',
      }),
    );
    expect(mockReportsRepo.save).toHaveBeenCalled();
  });

  it.each([
    ['2026-02-30', '2026-03-07'],
    ['2026-10-08', '2026-10-07'],
  ])(
    'rejects invalid or reversed dates (%s to %s) before writing',
    async (start, end) => {
      await expect(
        service.generate({
          termId: 'term-1',
          subjectId: 'sub-eng',
          period: 'week',
          start,
          end,
          studentIds: ['s1'],
          courseScope: 'Unit 1',
        }),
      ).rejects.toThrow('报告日期无效');
      expect(mockReportsRepo.save).not.toHaveBeenCalled();
    },
  );

  it('defaults new reports to present and rejects invalid attendance before writing', async () => {
    const input = {
      termId: 'term-1',
      subjectId: 'sub-eng',
      period: 'week',
      studentIds: ['s1'],
      courseScope: 'Unit 1',
    };
    await expect(
      service.generate({
        ...input,
        studentFeedback: [{ studentId: 's1', attendance: 'invalid' }],
      }),
    ).rejects.toThrow('课程出勤状态无效');
    expect(mockReportsRepo.save).not.toHaveBeenCalled();
    const [report] = await service.generate(input);
    expect(report?.content).toMatchObject({ attendance: 'present' });
  });

  it('records attendance for each course session on creation and rejects invalid session status', async () => {
    const input = {
      termId: 'term-1',
      subjectId: 'sub-eng',
      period: 'week',
      lessonCount: 2,
      studentIds: ['s1'],
      courseScope: 'Unit 1 & 2',
    };
    await expect(
      service.generate({
        ...input,
        studentFeedback: [
          { studentId: 's1', attendances: ['present', 'wrong-status'] },
        ],
      }),
    ).rejects.toThrow('课程出勤状态无效');
    expect(mockReportsRepo.save).not.toHaveBeenCalled();

    const [report] = await service.generate({
      ...input,
      studentFeedback: [{ studentId: 's1', attendances: ['present', 'late'] }],
    });
    expect(report?.content).toMatchObject({
      attendance: 'present',
      attendances: ['present', 'late'],
    });
  });

  it('edits multiple lesson attendances in draft and rejects invalid session status', async () => {
    mockReportsRepo.findOne.mockResolvedValue({
      id: 'r1',
      teacherId: 'test-teacher',
      status: 'draft',
      content: { summary: '旧摘要', attendances: ['present', 'present'] },
      snapshot: {
        reportVersion: 'v2',
        courseSelections: [{ manualContent: '颜色词汇' }],
      },
    });

    await expect(
      service.editDraft('r1', { attendances: ['present', 'bad'] }),
    ).rejects.toThrow('课程出勤状态无效');
    expect(mockReportsRepo.save).not.toHaveBeenCalled();

    const updated = await service.editDraft('r1', {
      summary: '多课次修改',
      attendances: ['excused', 'late'],
    });
    expect(updated.content).toMatchObject({
      summary: '多课次修改',
      attendance: 'excused',
      attendances: ['excused', 'late'],
      courseContent: '颜色词汇',
    });
    expect(mockReportsRepo.save).toHaveBeenCalled();
  });

  it('edits draft report in subject_reports', async () => {
    mockReportsRepo.findOne.mockResolvedValue({
      id: 'r1',
      teacherId: 'test-teacher',
      status: 'draft',
      content: { summary: '旧摘要' },
      snapshot: {
        reportVersion: 'v2',
        courseSelections: [{ manualContent: '颜色词汇' }],
      },
    });

    await expect(service.editDraft('r1', { attendance: null })).rejects.toThrow(
      '课程出勤状态无效',
    );
    expect(mockReportsRepo.save).not.toHaveBeenCalled();
    const updated = await service.editDraft('r1', {
      summary: '新摘要',
      attendance: 'excused',
    });
    expect(updated.content).toEqual({
      summary: '新摘要',
      attendance: 'excused',
      attendances: ['excused'],
      courseContent: '颜色词汇',
    });
    const editedAgain = await service.editDraft('r1', { summary: '再次编辑' });
    expect(editedAgain.content).toMatchObject({
      attendance: 'excused',
      attendances: ['excused'],
      courseContent: '颜色词汇',
    });
    const editedCourse = await service.editDraft('r1', {
      courseContent: '颜色词汇\n复习颜色句型',
    });
    expect(editedCourse.content?.courseContent).toBe('颜色词汇\n复习颜色句型');
    const clearedCourse = await service.editDraft('r1', { courseContent: '' });
    expect(clearedCourse.content?.courseContent).toBe('');
    mockReportsRepo.save.mockClear();
    await expect(
      service.editDraft('r1', { courseContent: null }),
    ).rejects.toThrow('课程内容必须为文本');
    expect(mockReportsRepo.save).not.toHaveBeenCalled();
  });

  it('saves courseScope and nextWeekContent on generate and draft edit, omitting them when blank', async () => {
    const inputWithBoth = {
      termId: 'term-1',
      subjectId: 'sub-eng',
      period: 'week',
      start: '2026-10-01',
      end: '2026-10-07',
      studentIds: ['s1'],
      courseScope: 'Unit 1 Colours',
      nextWeekContent: 'Unit 2 Numbers',
    };
    mockRecordsRepo.find.mockResolvedValue([]);
    const [report] = await service.generate(inputWithBoth);
    expect(report?.content).toMatchObject({
      courseScope: 'Unit 1 Colours',
      nextWeekContent: 'Unit 2 Numbers',
    });
    expect(report?.courseScope).toBe('Unit 1 Colours');
    expect(mockReportsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        courseScope: 'Unit 1 Colours',
        snapshot: expect.objectContaining({
          courseScope: 'Unit 1 Colours',
          nextWeekContent: 'Unit 2 Numbers',
        }) as unknown as Record<string, unknown>,
      }),
    );

    // When generating without them (or empty/whitespace)
    const [emptyReport] = await service.generate({
      termId: 'term-1',
      subjectId: 'sub-eng',
      period: 'week',
      studentIds: ['s1'],
      courseScope: '',
      nextWeekContent: '   ',
    });
    expect(emptyReport?.content?.courseScope).toBeUndefined();
    expect(emptyReport?.content?.nextWeekContent).toBeUndefined();
    expect(emptyReport?.courseScope).toBeNull();

    // Draft edit validations
    mockReportsRepo.findOne.mockResolvedValue({
      id: 'r1',
      teacherId: 'test-teacher',
      status: 'draft',
      courseScope: 'Unit 1 Colours',
      content: {
        summary: '旧摘要',
        courseScope: 'Unit 1 Colours',
        nextWeekContent: 'Unit 2 Numbers',
      },
      snapshot: {
        reportVersion: 'v2',
        courseScope: 'Unit 1 Colours',
        nextWeekContent: 'Unit 2 Numbers',
      },
    });

    await expect(
      service.editDraft('r1', { courseScope: 123 as unknown as string }),
    ).rejects.toThrow('授课范围备注必须为文本');
    await expect(
      service.editDraft('r1', {
        nextWeekContent: ['invalid'] as unknown as string,
      }),
    ).rejects.toThrow('下周课堂预习内容必须为文本');

    // Updating them in draft
    const updated = await service.editDraft('r1', {
      courseScope: 'Unit 1-3 复习',
      nextWeekContent: 'Unit 4 新授',
    });
    expect(updated.content).toMatchObject({
      courseScope: 'Unit 1-3 复习',
      nextWeekContent: 'Unit 4 新授',
    });
    expect(updated.courseScope).toBe('Unit 1-3 复习');

    // Clearing them in draft
    const cleared = await service.editDraft('r1', {
      courseScope: '',
      nextWeekContent: '   ',
    });
    expect(cleared.content?.courseScope).toBeUndefined();
    expect(cleared.content?.nextWeekContent).toBeUndefined();
    expect(cleared.courseScope).toBeNull();
  });

  it('keeps generated visuals and positive statistics when editing a draft', async () => {
    const visuals = {
      studentPhoto: 'saved-avatar',
      pet: { petId: 'cat' },
      petHistoryStatus: 'recorded',
      scoreDetails: { positiveItems: [{ label: '主动参与', count: 2 }] },
    };
    mockReportsRepo.findOne.mockResolvedValue({
      id: 'r1',
      status: 'draft',
      content: { ...visuals, courseContent: '颜色词汇' },
      snapshot: visuals,
    });
    const updated = await service.editDraft('r1', {
      studentPhoto: 'forged-avatar',
      pet: null,
      summary: '老师寄语',
    });
    expect(updated.content).toMatchObject(visuals);
  });

  it('rejects editing published reports directly without unpublishing', async () => {
    mockReportsRepo.findOne.mockResolvedValue({
      id: 'r1',
      teacherId: 'test-teacher',
      status: 'published',
      content: { summary: '已发布' },
    });

    await expect(
      service.editDraft('r1', { courseContent: '试图直接改' }),
    ).rejects.toThrow('只有草稿状态的报告可以编辑');
  });

  it('updates and removes classroom photos by slot in subject report drafts', async () => {
    const report = {
      id: 'r1',
      teacherId: 'test-teacher',
      status: 'draft',
      content: { summary: '草稿' },
      snapshot: { reportVersion: 'v2' },
    };
    mockReportsRepo.findOne.mockResolvedValue(report);

    // Rejects invalid slot
    await expect(service.setClassroomPhoto('r1', undefined, 2)).rejects.toThrow(
      '课堂照片位置必须为 0 或 1',
    );

    // Valid PNG file upload for slot 0
    const pngBuffer = Buffer.from([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 0, 0,
    ]);
    const updatedSlot0 = await service.setClassroomPhoto(
      'r1',
      { buffer: pngBuffer, size: pngBuffer.length, mimetype: 'image/png' },
      0,
    );
    expect(updatedSlot0.content).toMatchObject({
      classroomPhoto: expect.stringContaining(
        'data:image/png;base64,',
      ) as unknown as string,
      classroomPhotos: [
        expect.stringContaining('data:image/png;base64,'),
        null,
      ],
    });

    // Valid JPEG file upload for slot 1
    const jpegBuffer = Buffer.from([
      255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0,
    ]);
    const updatedSlot1 = await service.setClassroomPhoto(
      'r1',
      { buffer: jpegBuffer, size: jpegBuffer.length, mimetype: 'image/jpeg' },
      '1',
    );
    expect(updatedSlot1.content).toMatchObject({
      classroomPhoto: expect.stringContaining(
        'data:image/png;base64,',
      ) as unknown as string,
      classroomPhotos: [
        expect.stringContaining('data:image/png;base64,'),
        expect.stringContaining('data:image/jpeg;base64,'),
      ],
    });

    // Remove photo from slot 0
    const removedSlot0 = await service.setClassroomPhoto('r1', undefined, 0);
    expect(removedSlot0.content).toMatchObject({
      classroomPhoto: null,
      classroomPhotos: [
        null,
        expect.stringContaining('data:image/jpeg;base64,'),
      ],
    });

    // Rejects non-draft
    report.status = 'published';
    await expect(service.setClassroomPhoto('r1', undefined, 0)).rejects.toThrow(
      '只有草稿状态的报告可以修改课堂照片',
    );
  });

  it('defaults subject report shares to the semester report encryption key', async () => {
    const previousSecret = process.env.SEMESTER_REPORT_SHARE_SECRET;
    const previousKey = process.env.REPORT_SHARE_ENCRYPTION_KEY;
    try {
      delete process.env.SEMESTER_REPORT_SHARE_SECRET;
      process.env.REPORT_SHARE_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
        'base64',
      );
      mockReportsRepo.findOne.mockResolvedValue({
        id: 'r1',
        status: 'published',
        content: {},
      });
      await expect(service.createShare('r1')).resolves.toMatchObject({
        url: expect.stringContaining('/r/subject/') as string,
      });
      process.env.REPORT_SHARE_ENCRYPTION_KEY = 'invalid';
      mockSharesRepo.save.mockClear();
      await expect(service.createShare('r1')).rejects.toThrow(
        'REPORT_SHARE_ENCRYPTION_KEY',
      );
      expect(mockSharesRepo.save).not.toHaveBeenCalled();
    } finally {
      if (previousSecret === undefined)
        delete process.env.SEMESTER_REPORT_SHARE_SECRET;
      else process.env.SEMESTER_REPORT_SHARE_SECRET = previousSecret;
      if (previousKey === undefined)
        delete process.env.REPORT_SHARE_ENCRYPTION_KEY;
      else process.env.REPORT_SHARE_ENCRYPTION_KEY = previousKey;
    }
  });

  it('publishes report, generates share token and unpublishes cleanly', async () => {
    process.env.SEMESTER_REPORT_SHARE_SECRET =
      'test-secret-at-least-32-chars-long-123456';
    mockReportsRepo.findOne.mockResolvedValue({
      id: 'r1',
      teacherId: 'test-teacher',
      status: 'draft',
      studentName: '小宇',
      className: '启航班',
      periodType: 'week',
      snapshot: { subjectName: '英语' },
      content: { summary: '学期表现优良' },
    });

    const published = await service.publish('r1');
    expect(published.report.status).toBe('published');
    expect(published.url).toContain('/r/subject/');

    const unpublished = await service.unpublish('r1');
    expect(unpublished.status).toBe('draft');
    expect(mockSharesRepo.update).toHaveBeenCalled();
  });

  it('returns published content in the parent view format and rejects revoked links', async () => {
    mockSemesterReportsService.subjectReportStudent.mockImplementation(
      (_studentId, teacherId) => {
        if (teacherId !== 'test-teacher') throw new Error('未登录');
        return Promise.resolve(null);
      },
    );
    mockSharesRepo.findOne.mockResolvedValueOnce({
      reportId: 'r1',
      teacherId: 'test-teacher',
    });
    mockReportsRepo.findOne.mockResolvedValueOnce({
      teacherId: 'test-teacher',
      studentId: 's1',
      studentName: '小宇',
      className: '启航班',
      periodType: 'week',
      courseScope: 'Unit 1 Colours',
      snapshot: {
        subjectName: '英语',
        courseSelections: [{ manualContent: '第 1 节课：颜色词汇' }],
      },
      content: {
        summary: '表现良好',
        courseScope: 'Unit 1 Colours',
        nextWeekContent: 'Unit 2 Numbers',
      },
    });

    await expect(service.publicReport('a'.repeat(43))).resolves.toMatchObject({
      studentName: '小宇',
      subject: '英语',
      courseScope: 'Unit 1 Colours',
      content: {
        summary: '表现良好',
        courseContent: '第 1 节课：颜色词汇',
        courseScope: 'Unit 1 Colours',
        nextWeekContent: 'Unit 2 Numbers',
      },
      isSubjectReport: true,
    });
    await expect(service.publicReport('a'.repeat(43))).rejects.toThrow(
      '报告链接无效或已失效',
    );
  });

  it('deletes report by marking deleted and revoking shares', async () => {
    mockReportsRepo.findOne.mockResolvedValue({
      id: 'r1',
      teacherId: 'test-teacher',
      status: 'draft',
    });

    const result = await service.deleteReport('r1');
    expect(result.deleted).toBe(true);
    expect(mockReportsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'deleted' }),
    );
  });

  it('automatically ensures tables on module init', async () => {
    const mockQuery = jest.fn().mockResolvedValue([]);
    mockReportsRepo.manager = { query: mockQuery };

    await service.onModuleInit();
    expect(mockQuery).toHaveBeenCalledTimes(5);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining(
        'CREATE TABLE IF NOT EXISTS subject_report_subjects',
      ),
    );
  });

  it('recovers from ER_NO_SUCH_TABLE by ensuring tables and retrying query', async () => {
    const mockQuery = jest.fn().mockResolvedValue([]);
    mockReportsRepo.manager = { query: mockQuery };

    const missingTableErr = new Error(
      "Table 'classroom_toolkit.subject_report_subjects' doesn't exist",
    );
    (missingTableErr as { code?: string }).code = 'ER_NO_SUCH_TABLE';

    mockSubjectsRepo.find
      .mockRejectedValueOnce(missingTableErr)
      .mockResolvedValueOnce([
        { id: 'sub-1', name: '数学', enabled: true, performanceConfig: null },
      ]);

    const subjects = await service.listSubjects();
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining(
        'CREATE TABLE IF NOT EXISTS subject_report_subjects',
      ),
    );
    expect(subjects).toHaveLength(1);
    expect(subjects[0].name).toBe('数学');
  });

  describe('listReports sort memory optimization', () => {
    it('sorts lightweight IDs via derived table and preserves report order', async () => {
      const mockRawIds = [{ id: 'rep-2' }, { id: 'rep-1' }];
      const mockDerivedQb = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        setParameters: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(mockRawIds),
      };

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getQuery: jest
          .fn()
          .mockReturnValue(
            'SELECT report.id, report.created_at FROM subject_reports',
          ),
        getParameters: jest.fn().mockReturnValue({ teacherId: 'test-teacher' }),
      };

      const mockLoadQuery = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: 'rep-1',
            studentName: '学生A',
            className: '一班',
            periodType: 'week',
            periodStart: new Date('2026-11-01'),
            periodEnd: new Date('2026-11-06'),
            createdAt: new Date('2026-11-01'),
            content: { classroomPhoto: 'photo-1' },
          },
          {
            id: 'rep-2',
            studentName: '学生B',
            className: '二班',
            periodType: 'week',
            periodStart: new Date('2026-11-01'),
            periodEnd: new Date('2026-11-06'),
            createdAt: new Date('2026-11-02'),
            content: { classroomPhoto: 'photo-2' },
          },
        ]),
      };

      mockReportsRepo.manager = {
        createQueryBuilder: jest.fn().mockReturnValue(mockDerivedQb),
      };
      mockReportsRepo.createQueryBuilder
        .mockReturnValueOnce(mockQuery)
        .mockReturnValueOnce(mockLoadQuery);

      mockSharesRepo.findOne.mockResolvedValue(null);

      const reports = await service.listReports({ status: 'draft' });

      expect(mockDerivedQb.getRawMany).toHaveBeenCalled();
      expect(mockLoadQuery.andWhere).toHaveBeenCalledWith(
        'report.id IN (:...ids)',
        { ids: ['rep-2', 'rep-1'] },
      );
      expect(reports).toHaveLength(2);
      expect(reports[0].id).toBe('rep-2');
      expect(reports[1].id).toBe('rep-1');
    });

    it('returns empty array directly when no reports match', async () => {
      const mockDerivedQb = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        setParameters: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getQuery: jest.fn().mockReturnValue(''),
        getParameters: jest.fn().mockReturnValue({}),
      };

      mockReportsRepo.manager = {
        createQueryBuilder: jest.fn().mockReturnValue(mockDerivedQb),
      };
      mockReportsRepo.createQueryBuilder.mockReturnValue(mockQuery);

      const reports = await service.listReports();
      expect(reports).toEqual([]);
    });
  });
});
