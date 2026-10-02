import { randomBytes } from 'node:crypto';
import { SemesterReportEntity } from './semester-report.entity';
import { SemesterReportsService } from './semester-reports.service';

describe('report publishing', () => {
  const previousKey = process.env.REPORT_SHARE_ENCRYPTION_KEY;
  const content = {
    summary: '课堂表现记录',
    courseOverview: '本期课程',
    strengths: [],
    areasToImprove: [],
    homeSuggestions: [],
    limitations: [],
  };

  function setup(status = 'draft') {
    const row = {
      id: 'report',
      teacherId: 'teacher',
      status,
      content,
      snapshot: {},
    } as SemesterReportEntity;
    const reports = {
      findOne: jest.fn().mockResolvedValue(row),
      save: jest.fn().mockResolvedValue(row),
    };
    let share: Record<string, unknown> | null = null;
    const shares = {
      findOne: jest.fn(async () => share),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => (share = value)),
    };
    const events = { create: jest.fn((value) => value), save: jest.fn() };
    const dependencies = [
      { findOne: jest.fn().mockResolvedValue({ name: '学期' }) },
      { findOne: jest.fn().mockResolvedValue({ name: '英语' }) },
      {},
      reports,
      shares,
      events,
      {},
      {},
      { teacherId: 'teacher' },
    ] as unknown as ConstructorParameters<typeof SemesterReportsService>;
    const service = new SemesterReportsService(...dependencies);
    return { service, row, reports, shares, events };
  }

  beforeEach(() => {
    process.env.REPORT_SHARE_ENCRYPTION_KEY =
      randomBytes(32).toString('base64');
  });
  afterEach(() => {
    if (previousKey === undefined)
      delete process.env.REPORT_SHARE_ENCRYPTION_KEY;
    else process.env.REPORT_SHARE_ENCRYPTION_KEY = previousKey;
  });

  it('publishes a validated draft and records publishing and share creation', async () => {
    const { service, row, shares, events } = setup();
    const result = await service.publish('report');
    expect(row.status).toBe('published');
    expect(result.report).not.toHaveProperty('snapshot');
    expect(result.url).toMatch(/\/r\/[A-Za-z0-9_-]{43}$/);
    expect(shares.save).toHaveBeenCalledTimes(1);
    expect(events.save.mock.calls.map(([event]) => event.action)).toEqual([
      'share-created',
      'report-published',
    ]);
  });

  it('returns the same link on retry without duplicate publication or sharing events', async () => {
    const { service, reports, shares, events } = setup();
    const first = await service.publish('report');
    const second = await service.publish('report');
    expect(second.url).toBe(first.url);
    expect(second.shareId).toBe(first.shareId);
    expect(reports.save).toHaveBeenCalledTimes(1);
    expect(shares.save).toHaveBeenCalledTimes(1);
    expect(events.save).toHaveBeenCalledTimes(2);
  });

  it('does not publish or create a share without an encryption key', async () => {
    delete process.env.REPORT_SHARE_ENCRYPTION_KEY;
    const { service, row, reports, shares } = setup();
    await expect(service.publish('report')).rejects.toThrow(
      'REPORT_SHARE_ENCRYPTION_KEY',
    );
    expect(row.status).toBe('draft');
    expect(reports.save).not.toHaveBeenCalled();
    expect(shares.save).not.toHaveBeenCalled();
  });

  it('checks ownership and rejects reports that are unavailable to the teacher', async () => {
    const { service, reports, shares } = setup();
    reports.findOne.mockResolvedValue(null);
    await expect(service.publish('report')).rejects.toThrow('报告不存在');
    expect(reports.findOne).toHaveBeenCalledWith({
      where: { id: 'report', teacherId: 'teacher' },
    });
    expect(shares.save).not.toHaveBeenCalled();
  });
  it('saves teacher mastery and classroom feedback and exposes them through the parent link with readable sources', async () => {
    const { service, row, events } = setup();
    row.snapshot = {
      allowedReferences: ['course:course:p4'],
      courseDocuments: [
        {
          id: 'course',
          fileName: 'Health.pdf',
          pages: [{ page: 4, text: 'Course' }],
        },
      ],
    };
    const reviewed = {
      ...content,
      learningContents: [
        {
          id: 'goal-1',
          section: 'Unit1 第1课',
          text: '听懂词汇 hand / foot',
          mastery: 'needs_support',
          sourceRefs: ['course:course:p4'],
        },
      ],
      classroomPerformance: [
        { text: '课堂任务 · 基本完成', sourceRefs: ['teacher-review'] },
      ],
    };
    await service.editDraft('report', reviewed);
    expect(row.snapshot?.teacherReviewedAt).toBeDefined();
    const result = await service.publish('report');
    const token = new URL(result.url).pathname.split('/').pop()!;
    const parent = await service.publicReport(token);
    expect(parent.content.learningContents[0].mastery).toBe('needs_support');
    expect(parent.content.learningContents[0].sourceRefs).toEqual([
      'Health.pdf 第 4 页',
    ]);
    expect(parent.content.classroomPerformance[0]).toEqual({
      text: '课堂任务 · 基本完成',
      sourceRefs: ['教师核对与评价'],
    });
    expect(parent).not.toHaveProperty('snapshot');
    expect(events.save.mock.calls.map(([event]) => event.action)).toContain(
      'draft-edited',
    );
  });
  it('serves the frozen pet point changes from the report snapshot, even for older edited content', async () => {
    const { service, row } = setup('published');
    row.snapshot = {
      allowedReferences: ['score:record'],
      scoreSummary: {
        positive: 4,
        negative: -1,
        net: 3,
        count: 2,
        records: [
          {
            id: 'record',
            label: '主动参与',
            delta: 4,
            createdAt: '2026-09-21T01:00:00.000Z',
          },
        ],
      },
    };
    row.content = { ...content, scoreDetails: { positive: 999, records: [] } };
    const share = await service.createShare('report');
    const token = new URL(share.url).pathname.split('/').pop()!;
    const parent = await service.publicReport(token);
    expect(parent.content.scoreDetails).toEqual({
      positive: 4,
      negative: -1,
      net: 3,
      count: 2,
      records: [
        { label: '主动参与', delta: 4, createdAt: '2026-09-21T01:00:00.000Z' },
      ],
    });
    expect(parent).not.toHaveProperty('snapshot');
  });
});
