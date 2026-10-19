import { SemesterReportsService } from './semester-reports.service';

describe('report list metadata query', () => {
  function setup(rawSnapshots: unknown[]) {
    const entities = rawSnapshots.map((_, index) => ({
      id: `report-${index}`,
      status: 'draft',
      studentName: '学生',
      updatedAt: new Date('2026-10-11T08:09:10Z'),
    }));
    const idsQuery = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getQuery: jest
        .fn()
        .mockReturnValue(
          'SELECT id, created_at FROM semester_reports LIMIT 9007199254740991',
        ),
      getParameters: jest.fn().mockReturnValue({ teacherId: 'teacher' }),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([...entities].reverse()),
    };
    const sortedQuery = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([...entities].reverse()),
    };
    const query = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getRawAndEntities: jest.fn().mockResolvedValue({
        entities,
        raw: rawSnapshots.map((summary_snapshot) => ({ summary_snapshot })),
      }),
    };
    // Sorting complete JSON rows reproduces the database failure after uploading photos.
    let metadataRead = false;
    const reports = {
      manager: { createQueryBuilder: jest.fn().mockReturnValue(sortedQuery) },
      find: jest.fn().mockRejectedValue(new Error('ER_OUT_OF_SORTMEMORY')),
      createQueryBuilder: jest.fn(() => {
        if (!metadataRead) {
          metadataRead = true;
          return idsQuery;
        }
        return query;
      }),
    };
    const shares = { findOne: jest.fn().mockResolvedValue(null) };
    const service = new SemesterReportsService(
      ...([
        {},
        {},
        {},
        reports,
        shares,
        {},
        {},
        {},
        { teacherId: 'teacher' },
      ] as unknown as ConstructorParameters<typeof SemesterReportsService>),
    );
    return { service, reports, query, idsQuery, shares, sortedQuery };
  }
  it('lists summaries without selecting photos, course page text or content for sorting', async () => {
    const { service, reports, query, idsQuery, shares } = setup([
      JSON.stringify({
        reportVersion: 'v2',
        subjectName: '英语、数学',
        courseSelections: [{ subjectId: 'math', courseScope: 'Unit1' }],
        generationMode: 'template',
      }),
      {
        reportVersion: 'v2',
        subjectName: '英语',
        courseSubjectIds: ['english', 'english', null],
      },
      null,
    ]);
    const result = await service.listReports();
    expect(result.map((row) => row.id)).toEqual([
      'report-2',
      'report-1',
      'report-0',
    ]);
    result.reverse();
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      updatedAt: new Date('2026-10-11T08:09:10Z'),
      reportVersion: 'v2',
      subjectName: '英语、数学',
      courseSelections: [{ subjectId: 'math', courseScope: 'Unit1' }],
      generationMode: 'template',
      content: null,
      share: null,
    });
    expect(result[1].courseSelections).toEqual([
      { subjectId: 'english', courseScope: '' },
    ]);
    expect(result[2]).toMatchObject({
      reportVersion: 'v1',
      courseSelections: [],
      content: null,
    });
    expect(result.every((report) => !('snapshot' in report))).toBe(true);
    expect(reports.find).not.toHaveBeenCalled();
    expect(query.select.mock.calls[0][0]).toContain('report.updatedAt');
    expect(result.every((report) => report.updatedAt instanceof Date)).toBe(
      true,
    );
    expect(query.select.mock.calls[0][0]).not.toContain('report.snapshot');
    expect(query.select.mock.calls[0][0]).not.toContain('report.content');
    const projection = query.addSelect.mock.calls[0][0];
    expect(projection).toContain('$.courseDocuments[*].subjectId');
    expect(projection).not.toMatch(/classroomPhoto|\.pages/);
    expect(query.where).toHaveBeenCalledWith('report.teacherId = :teacherId', {
      teacherId: 'teacher',
    });
    expect(query.andWhere).toHaveBeenCalledWith('report.status != :deleted', {
      deleted: 'deleted',
    });
    expect(idsQuery.select).toHaveBeenCalledWith(['report.id']);
    expect(idsQuery.where).toHaveBeenCalledWith(
      'report.teacherId = :teacherId',
      { teacherId: 'teacher' },
    );
    expect(idsQuery.andWhere).toHaveBeenCalledWith(
      'report.status != :deleted',
      { deleted: 'deleted' },
    );
    expect(idsQuery.orderBy).toHaveBeenCalledWith('report.createdAt', 'DESC');
    expect(idsQuery.take).toHaveBeenCalledWith(200);
    expect(query.orderBy).not.toHaveBeenCalled();
    expect(query.andWhere).toHaveBeenCalledWith('report.id IN (:...ids)', {
      ids: ['report-2', 'report-1', 'report-0'],
    });
    expect(shares.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          teacherId: 'teacher',
          reportId: 'report-0',
        }),
      }),
    );
  });
  it('returns an empty owned list and propagates actual database failures', async () => {
    const { service, reports, query, idsQuery, shares } = setup([]);
    await expect(service.listReports()).resolves.toEqual([]);
    expect(shares.findOne).not.toHaveBeenCalled();
    reports.createQueryBuilder.mockReturnValue(idsQuery);
    expect(query.getRawAndEntities).not.toHaveBeenCalled();
    idsQuery.getMany.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(service.listReports()).rejects.toThrow('database unavailable');
  });
  it('searches all owned reports before pagination and keeps input as literal parameters', async () => {
    const { service, idsQuery, sortedQuery } = setup([]);
    await service.listReports({
      q: ' 小明_% ',
      status: 'draft',
      period: 'week',
      version: 'v2',
      page: '2',
    });
    expect(idsQuery.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('report.studentName LIKE :search'),
      { search: '%小明!_!%%' },
    );
    expect(idsQuery.andWhere).toHaveBeenCalledWith('report.status = :status', {
      status: 'draft',
    });
    expect(idsQuery.andWhere).toHaveBeenCalledWith(
      'report.periodType = :period',
      { period: 'week' },
    );
    expect(idsQuery.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('$.reportVersion'),
      { version: 'v2' },
    );
    expect(sortedQuery.offset).toHaveBeenCalledWith(200);
    expect(sortedQuery.addOrderBy).toHaveBeenCalledWith(
      'matched_reports.id',
      'DESC',
    );
    expect(idsQuery.where).toHaveBeenCalledWith(
      'report.teacherId = :teacherId',
      { teacherId: 'teacher' },
    );
  });
  it.each([{ version: 'v2' }, { q: '阅读' }, { version: 'v1', q: '学生' }])(
    'materializes only matching IDs before sorting large photo snapshots (%j)',
    async (filters) => {
      const { service, idsQuery, sortedQuery } = setup([]);
      await service.listReports(filters);
      expect(idsQuery.select).toHaveBeenCalledWith('report.id', 'id');
      expect(idsQuery.addSelect).toHaveBeenCalledWith(
        'report.createdAt',
        'created_at',
      );
      expect(idsQuery.limit).toHaveBeenCalledWith(Number.MAX_SAFE_INTEGER);
      expect(sortedQuery.from).toHaveBeenCalledWith(
        '(SELECT id, created_at FROM semester_reports LIMIT 9007199254740991)',
        'matched_reports',
      );
      expect(sortedQuery.setParameters).toHaveBeenCalledWith({
        teacherId: 'teacher',
      });
      expect(sortedQuery.limit).toHaveBeenCalledWith(200);
      expect(sortedQuery.offset).toHaveBeenCalledWith(0);
      expect(idsQuery.orderBy).not.toHaveBeenCalled();
      expect(idsQuery.take).not.toHaveBeenCalled();
      expect(idsQuery.skip).not.toHaveBeenCalled();
    },
  );
  it.each([
    { startDate: '2026-10-18' },
    { endDate: '2026-10-18' },
    { startDate: '2026-10-18', endDate: '2026-10-18', version: 'v2' },
  ])(
    'filters overlapping report dates with inclusive Shanghai days before pagination (%j)',
    async (filters) => {
      const { service, idsQuery } = setup([]);
      await service.listReports(filters);
      if (filters.startDate)
        expect(idsQuery.andWhere).toHaveBeenCalledWith(
          'report.periodEnd > :startDate',
          { startDate: new Date('2026-10-17T16:00:00.000Z') },
        );
      if (filters.endDate)
        expect(idsQuery.andWhere).toHaveBeenCalledWith(
          'report.periodStart < :endDate',
          { endDate: new Date('2026-10-18T16:00:00.000Z') },
        );
      expect(idsQuery.where).toHaveBeenCalledWith(
        'report.teacherId = :teacherId',
        { teacherId: 'teacher' },
      );
    },
  );
  it.each([
    { page: '0' },
    { page: '1.5' },
    { page: 'oops' },
    { page: '999999999999999999999' },
    { status: 'deleted' },
    { period: 'day' },
    { version: 'v3' },
    { q: ['student'] },
    { q: 'x'.repeat(101) },
    { startDate: '2026-02-30' },
    { endDate: '2026-13-01' },
    { startDate: '2026-10-18T00:00:00Z' },
    { startDate: ['2026-10-18'] },
    { endDate: ['2026-10-18'] },
    { startDate: '2026-10-19', endDate: '2026-10-18' },
  ])('rejects invalid report filters %j', async (filters) => {
    const { service, reports } = setup([]);
    await expect(service.listReports(filters)).rejects.toThrow();
    expect(reports.createQueryBuilder).not.toHaveBeenCalled();
  });
});
