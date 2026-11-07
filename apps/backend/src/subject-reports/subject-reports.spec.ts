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
      { allowDisabledSubject: true, skipSubjectValidation: true },
    );
    mockReportsRepo.findOne.mockResolvedValueOnce(null);
    await expect(
      service.previewDraftCourseScope('foreign', { courseScope: '第3页' }),
    ).rejects.toThrow();
    expect(mockSemesterReportsService.previewCourseScope).toHaveBeenCalledTimes(
      1,
    );
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
        url: expect.stringContaining('/r/subject/'),
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
      async (_studentId, teacherId) => {
        if (teacherId !== 'test-teacher') throw new Error('未登录');
        return null;
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
      snapshot: {
        subjectName: '英语',
        courseSelections: [{ manualContent: '第 1 节课：颜色词汇' }],
      },
      content: { summary: '表现良好' },
    });

    await expect(service.publicReport('a'.repeat(43))).resolves.toMatchObject({
      studentName: '小宇',
      subject: '英语',
      content: { summary: '表现良好', courseContent: '第 1 节课：颜色词汇' },
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
});
