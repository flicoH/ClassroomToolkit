import { reportVersionToken } from './report-history';
import { randomBytes } from 'node:crypto';
import { SemesterReportEntity } from './semester-report.entity';
import { SemesterReportsService } from './semester-reports.service';

describe('report publishing', () => {
  const previousKey = process.env.REPORT_SHARE_ENCRYPTION_KEY;
  const previousBase = process.env.REPORT_PUBLIC_BASE_URL;
  const previousNodeEnv = process.env.NODE_ENV;
  const content = {
    summary: '课堂表现记录',
    courseOverview: '本期课程',
    strengths: [],
    areasToImprove: [],
    homeSuggestions: [],
    limitations: [],
  };

  const photo = {
    mimetype: 'image/png',
    size: 12,
    buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]),
  };
  it.each(['v1', 'v2'])(
    'protects the period-end pet and timestamp when editing and publishing %s',
    async (version) => {
      const { service, row } = setup();
      row.snapshot = {
        ...(version === 'v2' ? { reportVersion: 'v2' } : {}),
        pet: { petName: '团团', level: 4, stage: '第4形态' },
        petAsOf: '2026-10-09T15:59:59.999Z',
        petHistoryStatus: 'recorded',
      };
      await service.editDraft('report', {
        ...content,
        pet: { level: 10 },
        petAsOf: '2099-01-01',
        petHistoryStatus: 'unavailable',
      });
      const published = await service.publish('report');
      const parent = await service.publicReport(
        new URL(published.url).pathname.split('/').pop()!,
      );
      expect(parent.content).toMatchObject({
        pet: row.snapshot.pet,
        petAsOf: row.snapshot.petAsOf,
        petHistoryStatus: 'recorded',
      });
    },
  );
  it('adds a missing subject to a v2 draft without changing existing evaluations or visuals', async () => {
    const { service, row } = setup();
    Object.assign(row, {
      termId: 'term',
      studentId: 'student',
      periodType: 'term',
    });
    row.snapshot = {
      reportVersion: 'v2',
      courseSelections: [{ subjectId: 'english', courseScope: '' }],
      subjectName: '英语',
      allowedReferences: ['course:old:p1'],
      pet: { petName: '团团' },
      classroomPhoto: 'saved-photo',
    };
    row.content = {
      ...content,
      learningContents: [
        {
          id: 'old-goal',
          section: '英语',
          text: '原内容',
          mastery: 'mastered',
          sourceRefs: ['course:old:p1'],
        },
      ],
    };
    const internals = service as unknown as {
      requireTerm: jest.Mock;
      requireSubject: jest.Mock;
      findStudents: jest.Mock;
      findUsableDocuments: jest.Mock;
    };
    jest.spyOn(internals, 'requireTerm').mockResolvedValue({});
    jest.spyOn(internals, 'requireSubject').mockResolvedValue({ name: '数学' });
    jest
      .spyOn(internals, 'findStudents')
      .mockResolvedValue([{ id: 'student', classId: 'class' }]);
    jest.spyOn(internals, 'findUsableDocuments').mockResolvedValue([
      {
        id: 'math-doc',
        subjectId: 'math',
        classId: 'class',
        fileName: 'Math.pdf',
        sourcePages: [
          { page: 1, text: '| Unit1 | 1 | 数学第一课 | 策略 | 活动 |' },
        ],
      },
      {
        id: 'other-class',
        subjectId: 'math',
        classId: 'other',
        fileName: 'Other.pdf',
        sourcePages: [
          { page: 1, text: '| Unit1 | 1 | 别班内容 | 策略 | 活动 |' },
        ],
      },
    ]);
    await expect(service.addDraftSubjects('report', [])).rejects.toThrow();
    const originalSnapshot = row.snapshot;
    row.snapshot = {
      ...originalSnapshot,
      courseSelections: Array.from({ length: 20 }, (_, index) => ({
        subjectId: `existing-${index}`,
        courseScope: '',
      })),
    };
    await expect(
      service.addDraftSubjects('report', [
        { subjectId: 'math', courseScope: '' },
      ]),
    ).rejects.toThrow('最多选择 20');
    row.snapshot = originalSnapshot;
    const originalContent = row.content;
    row.content = {
      ...originalContent,
      learningContents: Array.from({ length: 500 }, (_, index) => ({
        id: `existing-${index}`,
        text: '原内容',
        mastery: 'mastered',
        sourceRefs: ['course:old:p1'],
      })),
    };
    await expect(
      service.addDraftSubjects('report', [
        { subjectId: 'math', courseScope: 'Unit1 1' },
      ]),
    ).rejects.toThrow('超过 500');
    expect(row.snapshot).toEqual(originalSnapshot);
    row.content = originalContent;
    const updated = await service.addDraftSubjects('report', [
      { subjectId: 'math', courseScope: 'Unit1 1' },
    ]);
    expect(updated.subjectName).toBe('英语、数学');
    expect(updated.content?.learningContents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'old-goal', mastery: 'mastered' }),
        expect.objectContaining({ text: '数学第一课', mastery: 'unassessed' }),
      ]),
    );
    expect(row.snapshot.learningContents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'old-goal', text: '原内容' }),
      ]),
    );
    expect(
      (row.snapshot.learningContents as Record<string, unknown>[]).every(
        (item) => !('mastery' in item),
      ),
    ).toBe(true);
    expect(JSON.stringify(updated.content)).not.toContain('别班内容');
    expect(updated.content?.summary).toBe(content.summary);
    expect(updated.content?.classroomPhoto).toBe('saved-photo');
    expect(row.snapshot.allowedReferences).toContain('course:math-doc:p1');
    await expect(
      service.addDraftSubjects('report', [
        { subjectId: 'math', courseScope: '' },
      ]),
    ).rejects.toThrow('已添加');
    internals.requireSubject.mockRejectedValueOnce(new Error('学科不存在'));
    await expect(
      service.addDraftSubjects('report', [
        { subjectId: 'other', courseScope: '' },
      ]),
    ).rejects.toThrow('学科不存在');
    await expect(
      service.addDraftSubjects('report', [
        { subjectId: 'missing', courseScope: 'Unit99' },
      ]),
    ).rejects.toThrow('没有匹配');
    row.status = 'published';
    await expect(
      service.addDraftSubjects('report', [
        { subjectId: 'extra', courseScope: '' },
      ]),
    ).rejects.toThrow('草稿');
    row.teacherId = 'other';
    await expect(
      service.addDraftSubjects('report', [
        { subjectId: 'extra', courseScope: '' },
      ]),
    ).rejects.toThrow('报告不存在');
  });
  function removableDraft() {
    const state = setup();
    const goal = (id: string, doc: string) => ({
      id,
      section: id,
      text: id,
      mastery: 'mastered',
      sourceRefs: [`course:${doc}:p1`],
    });
    Object.assign(state.row, {
      periodType: 'term',
      courseScope: '英语：本学期全部内容；数学：Unit1',
    });
    state.row.snapshot = {
      reportVersion: 'v2',
      subjectName: '英语、数学',
      courseSelections: [
        { subjectId: 'english', courseScope: '' },
        { subjectId: 'math', courseScope: 'Unit1' },
      ],
      courseDocuments: [
        {
          id: 'en-doc',
          subjectId: 'english',
          pages: [{ page: 1, text: '英语' }],
        },
        {
          id: 'math-doc',
          subjectId: 'math',
          pages: [{ page: 1, text: '数学' }],
        },
      ],
      learningContents: [
        goal('english-goal', 'en-doc'),
        goal('math-goal', 'math-doc'),
      ],
      allowedReferences: [
        'course:en-doc:p1',
        'course:math-doc:p1',
        'teacher-review',
      ],
      pet: { petName: '团团' },
      classroomPhoto: 'saved-photo',
    };
    state.row.content = {
      ...content,
      learningContents: state.row.snapshot.learningContents,
      strengths: [{ text: '英语进步', sourceRefs: ['course:en-doc:p1'] }],
      homeSuggestions: [
        {
          text: '数学练习',
          sourceRefs: ['course:math-doc:p1', 'teacher-review'],
        },
      ],
    };
    return state;
  }
  it('removes a draft subject and its sources while preserving other ratings, prose and visuals', async () => {
    const { service, row, events } = removableDraft();
    const result = await service.removeDraftSubject('report', 'math');
    expect(result.report.subjectName).toBe('英语');
    expect(result.report.courseScope).toBe('英语：本学期全部内容');
    expect(result.report.courseSelections).toEqual([
      { subjectId: 'english', courseScope: '' },
    ]);
    expect(result.removedReferences).toEqual(['course:math-doc:p1']);
    expect(row.snapshot.courseDocuments).toEqual([
      expect.objectContaining({ id: 'en-doc' }),
    ]);
    expect(row.snapshot.allowedReferences).not.toContain('course:math-doc:p1');
    expect(result.report.content).toMatchObject({
      summary: content.summary,
      classroomPhoto: 'saved-photo',
      pet: { petName: '团团' },
      learningContents: [
        expect.objectContaining({ id: 'english-goal', mastery: 'mastered' }),
      ],
      homeSuggestions: [],
      strengths: [{ text: '英语进步', sourceRefs: ['course:en-doc:p1'] }],
    });
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'draft-subject-removed' }),
    );
    await expect(
      service.editDraft('report', {
        ...row.content,
        homeSuggestions: [
          { text: '旧引用', sourceRefs: ['course:math-doc:p1'] },
        ],
      }),
    ).rejects.toThrow('引用');
    await expect(
      service.removeDraftSubject('report', 'english'),
    ).rejects.toThrow('至少保留一门学科');
  });
  it('supports older v2 snapshots without explicit courseSelections or learningContents', async () => {
    const { service, row } = removableDraft();
    delete row.snapshot.courseSelections;
    delete row.snapshot.learningContents;
    const result = await service.removeDraftSubject('report', 'math');
    expect(result.report.courseSelections).toEqual([
      { subjectId: 'english', courseScope: '' },
    ]);
    expect(result.report.content?.learningContents).toEqual([
      expect.objectContaining({ id: 'english-goal', mastery: 'mastered' }),
    ]);
    expect(JSON.stringify(row.snapshot.courseDocuments)).not.toContain(
      'math-doc',
    );
    expect(row.snapshot.learningContents).toEqual([
      expect.objectContaining({ id: 'english-goal' }),
    ]);
  });
  it('rejects missing subjects, published/legacy drafts and other teachers without changes', async () => {
    const { service, row, reports } = removableDraft();
    const snapshot = structuredClone(row.snapshot);
    await expect(
      service.removeDraftSubject('report', 'missing'),
    ).rejects.toThrow('未包含');
    row.status = 'published';
    await expect(service.removeDraftSubject('report', 'math')).rejects.toThrow(
      'v2 草稿',
    );
    row.status = 'draft';
    row.snapshot.reportVersion = 'v1';
    await expect(service.removeDraftSubject('report', 'math')).rejects.toThrow(
      'v2 草稿',
    );
    row.snapshot = snapshot;
    row.teacherId = 'other';
    await expect(service.removeDraftSubject('report', 'math')).rejects.toThrow(
      '报告不存在',
    );
    expect(reports.save).not.toHaveBeenCalled();
    expect(row.snapshot).toEqual(snapshot);
  });
  it.each(['v1', 'v2'])(
    'records and restores %s edits without reviving published links',
    async (version) => {
      const { service, row, events } = setup();
      row.snapshot = { reportVersion: version };
      await service.editDraft('report', { ...content, summary: '第一次修改' });
      const event = events.save.mock.calls[0]![0];
      expect(event.details.revision.before.content.summary).toBe(
        content.summary,
      );
      await service.editDraft('report', { ...content, summary: '第二次修改' });
      const history = await service.getEvents('report');
      expect(history[0]).toMatchObject({ label: '编辑报告草稿' });
      expect(JSON.stringify(history)).not.toContain('snapshot');
      const detail = await service.getEvent('report', event.id);
      expect(detail.changes).toContainEqual({
        field: '老师寄语',
        before: content.summary,
        after: '第一次修改',
      });
      const restored = await service.restoreEvent('report', event.id, {
        side: 'before',
        expectedVersion: detail.currentVersion,
      });
      expect(restored.content?.summary).toBe(content.summary);
      expect(row.status).toBe('draft');
      expect(events.save.mock.calls.at(-1)![0]).toMatchObject({
        action: 'report-restored',
        details: {
          restoredEventId: event.id,
          restoredSide: 'before',
          revision: { before: { content: { summary: '第二次修改' } } },
        },
      });
    },
  );
  it.each(['v1', 'v2'])(
    'restores a published %s history version directly as a draft and revokes every link',
    async (version) => {
      const { service, row, shares, events } = setup();
      row.snapshot = { reportVersion: version };
      await service.editDraft('report', { ...content, summary: '历史寄语' });
      const edit = events.save.mock.calls[0]![0];
      const publication = await service.publish('report');
      const token = new URL(publication.url).pathname.split('/').pop()!;
      const detail = await service.getEvent('report', edit.id);
      const restored = await service.restoreEvent('report', edit.id, {
        side: 'before',
        expectedVersion: detail.currentVersion,
      });
      expect(restored).toMatchObject({
        status: 'draft',
        content: { summary: content.summary },
      });
      expect(row.publishedAt).toBeNull();
      expect(shares.update).toHaveBeenCalled();
      await expect(service.publicReport(token)).rejects.toThrow();
      expect(events.save.mock.calls.at(-1)![0].action).toBe('report-restored');
    },
  );
  it('refuses to withdraw a publication created after the history was viewed', async () => {
    const { service, shares, events } = setup();
    await service.editDraft('report', { ...content, summary: '修改' });
    const edit = events.save.mock.calls[0]![0];
    const detail = await service.getEvent('report', edit.id);
    const publication = await service.publish('report');
    const token = new URL(publication.url).pathname.split('/').pop()!;
    await expect(
      service.restoreEvent('report', edit.id, {
        side: 'before',
        expectedVersion: detail.currentVersion,
      }),
    ).rejects.toThrow('已发生变化');
    expect(shares.update).not.toHaveBeenCalled();
    await expect(service.publicReport(token)).resolves.toMatchObject({
      content: { summary: '修改' },
    });
  });
  it('keeps a published report and its link intact if restoration fails', async () => {
    const { service, row, events } = setup();
    await service.editDraft('report', { ...content, summary: '修改' });
    const edit = events.save.mock.calls[0]![0];
    const publication = await service.publish('report');
    const token = new URL(publication.url).pathname.split('/').pop()!;
    const detail = await service.getEvent('report', edit.id);
    // Revocation/unpublication logs succeed; saving the restore record fails.
    events.save
      .mockImplementationOnce(async () => {})
      .mockImplementationOnce(async () => {})
      .mockRejectedValueOnce(new Error('audit failed'));
    await expect(
      service.restoreEvent('report', edit.id, {
        side: 'before',
        expectedVersion: detail.currentVersion,
      }),
    ).rejects.toThrow('audit failed');
    expect(row.status).toBe('published');
    expect(row.content?.summary).toBe('修改');
    await expect(service.publicReport(token)).resolves.toMatchObject({
      content: { summary: '修改' },
    });
  });
  it('stores recoverable report content for publish and sharing records', async () => {
    const { service, events } = setup();
    await service.publish('report');
    await service.unpublish('report');
    for (const [event] of events.save.mock.calls) {
      const detail = await service.getEvent('report', event.id);
      expect(detail.canRestoreAfter).toBe(true);
    }
  });

  it('restores removed subject sources and ratings, and rolls back if audit saving fails', async () => {
    const { service, row, events } = removableDraft();
    await service.removeDraftSubject('report', 'math');
    const event = events.save.mock.calls[0]![0];
    const detail = await service.getEvent('report', event.id);
    events.save.mockRejectedValueOnce(new Error('audit save failed'));
    await expect(
      service.restoreEvent('report', event.id, {
        side: 'before',
        expectedVersion: detail.currentVersion,
      }),
    ).rejects.toThrow('audit save failed');
    expect(row.snapshot.subjectName).toBe('英语');
    const result = await service.restoreEvent('report', event.id, {
      side: 'before',
      expectedVersion: detail.currentVersion,
    });
    expect(result.subjectName).toBe('英语、数学');
    expect(row.snapshot.allowedReferences).toContain('course:math-doc:p1');
    expect(result.content?.learningContents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'math-goal', mastery: 'mastered' }),
      ]),
    );
    expect(result.content?.classroomPhoto).toBe('saved-photo');
  });
  it('rejects stale, legacy, invalid, cross-report/teacher and generating restoration', async () => {
    const { service, row, events } = setup();
    await service.editDraft('report', { ...content, summary: '修改' });
    const event = events.save.mock.calls[0]![0];
    const currentVersion = reportVersionToken(row);
    await expect(
      service.restoreEvent('report', event.id, {
        side: 'before',
        expectedVersion: 'stale',
      }),
    ).rejects.toThrow('已发生变化');
    await expect(
      service.restoreEvent('report', event.id, {
        side: 'invalid',
        expectedVersion: currentVersion,
      }),
    ).rejects.toThrow('恢复目标');
    events.save.mock.calls[0]![0].details = null;
    await expect(
      service.restoreEvent('report', event.id, {
        side: 'after',
        expectedVersion: currentVersion,
      }),
    ).rejects.toThrow('未保存');
    events.save.mock.calls[0]![0].teacherId = 'other';
    await expect(service.getEvent('report', event.id)).rejects.toThrow(
      '记录不存在',
    );
    events.save.mock.calls[0]![0].teacherId = 'teacher';
    events.save.mock.calls[0]![0].reportId = 'other-report';
    await expect(service.getEvent('report', event.id)).rejects.toThrow(
      '记录不存在',
    );
    row.status = 'generating';
    await expect(
      service.restoreEvent('report', event.id, {
        side: 'before',
        expectedVersion: currentVersion,
      }),
    ).rejects.toThrow('草稿');
    expect(row.content?.summary).toBe('修改');
  });
  it('accepts a photo of exactly 5MB', async () => {
    const { service, row } = setup();
    row.snapshot = { reportVersion: 'v2' };
    const buffer = Buffer.alloc(5 * 1024 * 1024);
    photo.buffer.copy(buffer);
    await service.setClassroomPhoto('report', {
      ...photo,
      buffer,
      size: buffer.length,
    });
    expect(row.snapshot.classroomPhoto).toContain('data:image/png;base64,');
  });
  it.each(['v1', 'v2'])(
    'saves, replaces and removes exactly one %s photo and protects it from stale draft edits',
    async (version) => {
      const { service, row } = setup();
      row.snapshot = {
        reportVersion: version,
        pet: { petId: 'sprout-puff', stage: '成长形态' },
      };
      await service.setClassroomPhoto('report', photo);
      const first = row.snapshot.classroomPhoto;
      expect(first).toContain('data:image/png;base64,');
      await service.editDraft('report', {
        ...content,
        classroomPhoto: 'https://untrusted.test/photo',
        pet: null,
      });
      expect(row.content?.classroomPhoto).toBe(first);
      expect(row.content?.pet).toEqual(row.snapshot.pet);
      await service.setClassroomPhoto('report', {
        ...photo,
        buffer: Buffer.concat([photo.buffer.subarray(0, 11), Buffer.from([1])]),
      });
      expect(row.snapshot.classroomPhoto).not.toBe(first);
      await service.setClassroomPhoto('report');
      expect(row.content?.classroomPhoto).toBeNull();
    },
  );
  it.each(['v1', 'v2'])(
    'the published parent view gets %s pet and photo from the saved snapshot',
    async (version) => {
      const { service, row } = setup();
      row.snapshot = {
        ...(version === 'v2' ? { reportVersion: 'v2' } : {}),
        pet: { petName: '团团', stage: '第4形态' },
      };
      await service.setClassroomPhoto('report', photo);
      const published = await service.publish('report');
      const parent = await service.publicReport(
        new URL(published.url).pathname.split('/').pop()!,
      );
      if (version === 'v2') expect(parent.subject).toBe('全部课程');
      expect(parent.content).toMatchObject({
        ...(version === 'v2' ? { reportVersion: 'v2' } : {}),
        pet: { petName: '团团' },
        classroomPhoto: row.snapshot.classroomPhoto,
      });
      await service.unpublish('report');
      await expect(
        service.publicReport(new URL(published.url).pathname.split('/').pop()!),
      ).rejects.toThrow('失效');
    },
  );
  it.each(['v1', 'v2'])(
    'rejects invalid files, foreign teachers and published uploads for %s',
    async (version) => {
      const { service, row, reports } = setup();
      row.snapshot = { reportVersion: version };
      await expect(
        service.setClassroomPhoto('report', {
          ...photo,
          mimetype: 'image/svg+xml',
        }),
      ).rejects.toThrow('JPG');
      await expect(
        service.setClassroomPhoto('report', {
          ...photo,
          buffer: Buffer.alloc(12),
        }),
      ).rejects.toThrow('JPG');
      await expect(
        service.setClassroomPhoto('report', {
          ...photo,
          size: 5 * 1024 * 1024 + 1,
        }),
      ).rejects.toThrow('5MB');
      expect(reports.save).not.toHaveBeenCalled();
      row.status = 'published';
      await expect(service.setClassroomPhoto('report', photo)).rejects.toThrow(
        '草稿',
      );
      row.teacherId = 'other';
      await expect(service.setClassroomPhoto('report', photo)).rejects.toThrow(
        '报告不存在',
      );
    },
  );
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
    const events = {
      create: jest.fn((value) => value),
      save: jest.fn(),
      find: jest.fn(async ({ where }) =>
        events.save.mock.calls
          .map(([event]) => event)
          .filter((event) => matches(event, where)),
      ),
      findOne: jest.fn(
        async ({ where }) =>
          events.save.mock.calls
            .map(([event]) => event)
            .find((event) => matches(event, where)) ?? null,
      ),
    };
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
    process.env.NODE_ENV = 'test';
    process.env.REPORT_PUBLIC_BASE_URL = 'https://reports.school.test';
    process.env.REPORT_SHARE_ENCRYPTION_KEY =
      randomBytes(32).toString('base64');
  });
  afterEach(() => {
    if (previousBase === undefined) delete process.env.REPORT_PUBLIC_BASE_URL;
    else process.env.REPORT_PUBLIC_BASE_URL = previousBase;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
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

  it.each(['http://198.51.100.2', 'https://reports.school.test/'])(
    'uses the configured public website %s in production',
    async (base) => {
      process.env.NODE_ENV = 'production';
      process.env.REPORT_PUBLIC_BASE_URL = base;
      const { service } = setup();
      const url = new URL((await service.publish('report')).url);
      expect(url.origin).toBe(new URL(base).origin);
      expect(url.pathname).toMatch(/^\/r\/[A-Za-z0-9_-]{43}$/);
    },
  );

  it.each([
    undefined,
    '',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://[::1]:3001',
    'http://0.0.0.0:3001',
    'https://classroom.example.com',
    'ftp://reports.school.test',
    'https://reports.school.test/path',
    'https://user:password@reports.school.test',
    'https://reports.school.test?token=private',
    'https://reports.school.test/#fragment',
    'invalid',
  ])(
    'rejects an invalid production public URL %s before publishing or creating a link',
    async (base) => {
      process.env.NODE_ENV = 'production';
      if (base === undefined) delete process.env.REPORT_PUBLIC_BASE_URL;
      else process.env.REPORT_PUBLIC_BASE_URL = base;
      const { service, row, reports, shares, events } = setup();
      await expect(service.publish('report')).rejects.toThrow(
        'REPORT_PUBLIC_BASE_URL',
      );
      expect(row.status).toBe('draft');
      expect(reports.save).not.toHaveBeenCalled();
      expect(shares.save).not.toHaveBeenCalled();
      expect(events.save).not.toHaveBeenCalled();
    },
  );

  it('preserves the localhost fallback for local development', async () => {
    delete process.env.REPORT_PUBLIC_BASE_URL;
    const { service } = setup();
    expect((await service.publish('report')).url).toMatch(
      /^http:\/\/localhost:3001\/r\//,
    );
  });

  it('returns the existing token on the new website after correcting deployment configuration', async () => {
    const { service, shares } = setup();
    const first = await service.publish('report');
    process.env.REPORT_PUBLIC_BASE_URL = 'https://new.school.test/';
    const second = await service.createShare('report');
    expect(new URL(second.url).origin).toBe('https://new.school.test');
    expect(new URL(second.url).pathname).toBe(new URL(first.url).pathname);
    expect(second.shareId).toBe(first.shareId);
    expect(shares.save).toHaveBeenCalledTimes(1);
  });

  it('does not return or replace an existing parent link when production configuration becomes invalid', async () => {
    const { service, shares } = setup();
    await service.publish('report');
    process.env.NODE_ENV = 'production';
    process.env.REPORT_PUBLIC_BASE_URL = 'http://localhost:3001';
    await expect(service.createShare('report')).rejects.toThrow(
      'REPORT_PUBLIC_BASE_URL',
    );
    expect(shares.save).toHaveBeenCalledTimes(1);
    expect(shares.update).not.toHaveBeenCalled();
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
