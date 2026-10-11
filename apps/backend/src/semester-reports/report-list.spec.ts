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
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([...entities].reverse()),
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
    const reports = {
      find: jest.fn().mockRejectedValue(new Error('ER_OUT_OF_SORTMEMORY')),
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(idsQuery)
        .mockReturnValue(query),
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
    return { service, reports, query, idsQuery, shares };
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
});
