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
      publishedAt: status === 'published' ? new Date() : null,
    } as SemesterReportEntity;
    const reports = {
      findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        where.id === row.id &&
        (where.teacherId === undefined || where.teacherId === row.teacherId) &&
        (!where.status || where.status === row.status)
          ? row
          : null,
      ),
      save: jest.fn().mockResolvedValue(row),
      manager: {} as Record<string, unknown>,
    };
    let storedShares: Record<string, unknown>[] = [];
    const matches = (
      value: Record<string, unknown>,
      where: Record<string, unknown>,
    ) =>
      Object.entries(where).every(([key, expected]) =>
        expected &&
        typeof expected === 'object' &&
        'type' in expected &&
        expected.type === 'isNull'
          ? value[key] === null
          : value[key] === expected,
      );
    const shares = {
      findOne: jest.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          storedShares.find((value) => matches(value, where)) ?? null,
      ),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        const index = storedShares.findIndex((share) => share.id === value.id);
        if (index < 0) storedShares.push(value);
        else storedShares[index] = value;
        return value;
      }),
      update: jest.fn(async (where, patch) => {
        for (const share of storedShares)
          if (matches(share, where)) Object.assign(share, patch);
      }),
    };
    const events = { create: jest.fn((value) => value), save: jest.fn() };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === SemesterReportEntity
          ? reports
          : entity.name === 'ReportShareEntity'
            ? shares
            : events,
      ),
    };
    reports.manager.transaction = jest.fn(async (callback) => {
      const savedRow = structuredClone(row);
      const savedShares = structuredClone(storedShares);
      try {
        return await callback(manager);
      } catch (error) {
        Object.assign(row, savedRow);
        storedShares = savedShares;
        throw error;
      }
    });
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
      lock: { mode: 'pessimistic_write' },
    });
    expect(shares.save).not.toHaveBeenCalled();
  });
  it('returns a revoked publication to an editable draft and never reuses the old parent link', async () => {
    const { service, row, events } = setup();
    row.snapshot = {
      scoreSummary: {
        positive: 4,
        negative: -1,
        net: 3,
        count: 2,
        records: [],
      },
    };
    const snapshot = structuredClone(row.snapshot);
    const first = await service.publish('report');
    await expect(service.editDraft('report', content)).rejects.toThrow(
      '只有草稿可以编辑',
    );
    const oldToken = new URL(first.url).pathname.split('/').pop()!;
    expect((await service.publicReport(oldToken)).content.summary).toBe(
      content.summary,
    );
    const result = await service.revokeShare('report', first.shareId);
    expect(result).toMatchObject({ revoked: true, status: 'draft' });
    expect(row.status).toBe('draft');
    expect(row.publishedAt).toBeNull();
    expect(row.content).toEqual(content);
    expect(row.snapshot).toEqual(snapshot);
    await expect(service.publicReport(oldToken)).rejects.toThrow(
      '报告链接无效或已失效',
    );
    await expect(service.createShare('report')).rejects.toThrow('请先发布报告');
    await service.editDraft('report', {
      ...content,
      summary: '老师修改后的评价',
    });
    const next = await service.publish('report');
    expect(next.url).not.toBe(first.url);
    expect(next.shareId).not.toBe(first.shareId);
    expect(
      (await service.publicReport(new URL(next.url).pathname.split('/').pop()!))
        .content.summary,
    ).toBe('老师修改后的评价');
    await expect(service.publicReport(oldToken)).rejects.toThrow(
      '报告链接无效或已失效',
    );
    expect(events.save.mock.calls.map(([event]) => event.action)).toContain(
      'report-unpublished',
    );
  });

  it('allows historical publications without a live link to be reopened and remains idempotent', async () => {
    const { service, row, events } = setup('published');
    expect(await service.unpublish('report')).toEqual({ status: 'draft' });
    expect(row.content).toEqual(content);
    expect(row.publishedAt).toBeNull();
    const calls = events.save.mock.calls.length;
    expect(await service.unpublish('report')).toEqual({ status: 'draft' });
    expect(events.save.mock.calls).toHaveLength(calls);
    await service.editDraft('report', {
      ...content,
      summary: '重新审核后的评价',
    });
    expect((await service.publish('report')).url).toContain('/r/');
  });

  it.each(['queued', 'generating', 'failed', 'deleted'])(
    'does not reopen a %s report',
    async (status) => {
      const { service, row, shares } = setup(status);
      await expect(service.unpublish('report')).rejects.toThrow(
        status === 'deleted' ? '报告不存在' : '仅可重新编辑已发布报告或草稿',
      );
      expect(row.status).toBe(status);
      expect(shares.update).not.toHaveBeenCalled();
    },
  );

  it('revokes every active link before editing a publication', async () => {
    const { service, shares } = setup();
    const first = await service.publish('report');
    const old = await shares.findOne({ where: { id: first.shareId } });
    await shares.save({ ...old, id: 'historical-duplicate' });
    await service.revokeShare('report', first.shareId);
    expect(
      (await shares.findOne({ where: { id: 'historical-duplicate' } }))
        ?.revokedAt,
    ).toBeInstanceOf(Date);
    expect(
      (await shares.findOne({ where: { id: 'historical-duplicate' } }))
        ?.tokenCiphertext,
    ).toBe('');
  });

  it('does not unpublish a new revision when an old revoke request is repeated', async () => {
    const { service, row, events } = setup();
    const first = await service.publish('report');
    await service.revokeShare('report', first.shareId);
    const next = await service.publish('report');
    const calls = events.save.mock.calls.length;
    await service.revokeShare('report', first.shareId);
    expect(row.status).toBe('published');
    expect(events.save.mock.calls).toHaveLength(calls);
    expect(
      (await service.publicReport(new URL(next.url).pathname.split('/').pop()!))
        .content.summary,
    ).toBe(content.summary);
  });

  it('checks report and share ownership before allowing editing again', async () => {
    const { service, row, reports, shares } = setup();
    const first = await service.publish('report');
    await expect(
      service.revokeShare('report', 'unknown-share'),
    ).rejects.toThrow('分享链接不存在');
    await expect(
      service.revokeShare('other-report', first.shareId),
    ).rejects.toThrow('报告不存在');
    row.teacherId = 'another-teacher';
    await expect(service.revokeShare('report', first.shareId)).rejects.toThrow(
      '报告不存在',
    );
    expect(row.status).toBe('published');
    expect(shares.update).not.toHaveBeenCalled();
    expect(reports.findOne).toHaveBeenCalledWith({
      where: { id: 'report', teacherId: 'teacher' },
      lock: { mode: 'pessimistic_write' },
    });
  });

  it('rolls back link revocation if reopening the draft fails', async () => {
    const { service, row, reports } = setup();
    const first = await service.publish('report');
    reports.save.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(service.revokeShare('report', first.shareId)).rejects.toThrow(
      'database unavailable',
    );
    expect(row.status).toBe('published');
    expect(
      (
        await service.publicReport(
          new URL(first.url).pathname.split('/').pop()!,
        )
      ).content.summary,
    ).toBe(content.summary);
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
