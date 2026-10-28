import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  function featureDatabase() {
    return {
      findFeatureUsage: jest.fn().mockResolvedValue([]),
      countActiveTeachers: jest.fn().mockResolvedValue([{ count: '0' }]),
      findFeatureDays: jest.fn().mockResolvedValue([]),
      findMetadata: jest
        .fn()
        .mockResolvedValue([{ startedAt: '2026-09-01T00:00:00.000Z' }]),
    };
  }

  it('includes semester reports with zero metrics before any usage is recorded', async () => {
    const result = await new AdminService(featureDatabase() as never).features({
      start: '2026-10-08',
      end: '2026-10-09',
    });
    expect(result.items).toContainEqual(
      expect.objectContaining({
        key: 'semester-reports',
        name: '学期报告',
        teachers: 0,
        uses: 0,
        openTeachers: 0,
        usageRate: 0,
      }),
    );
  });

  it('includes report usage in rankings and keeps teacher-specific queries scoped', async () => {
    const db = featureDatabase();
    db.findFeatureUsage.mockResolvedValueOnce([
      {
        feature: 'semester-reports',
        teachers: '2',
        uses: '5',
        openTeachers: '3',
      },
    ]);
    db.countActiveTeachers.mockResolvedValue([{ count: '4' }]);
    const result = await new AdminService(db as never).features({
      start: '2026-10-08',
      end: '2026-10-09',
      sort: 'uses',
      teacherId: 'teacher',
    });
    expect(result.items[0]).toMatchObject({
      key: 'semester-reports',
      name: '学期报告',
      uses: 5,
      teachers: 2,
      openTeachers: 3,
      usageRate: 0.5,
    });
    for (const call of db.findFeatureUsage.mock.calls)
      expect(call[2]).toBe('teacher');
    expect(db.countActiveTeachers).toHaveBeenCalledWith(
      expect.anything(),
      'teacher',
    );
  });

  it('accepts the report trend and fills missing days without leaking another teacher', async () => {
    const db = featureDatabase();
    db.findFeatureDays.mockResolvedValue([
      { date: '2026-10-09', teachers: '1', uses: '3' },
    ]);
    const result = await new AdminService(db as never).featureTrend(
      'semester-reports',
      { start: '2026-10-08', end: '2026-10-09', teacherId: 'teacher' },
    );
    expect(result.name).toBe('学期报告');
    expect(result.series).toEqual([
      { date: '2026-10-08', teachers: 0, uses: 0 },
      { date: '2026-10-09', teachers: 1, uses: 3 },
    ]);
    expect(db.findFeatureDays).toHaveBeenCalledWith(
      'semester-reports',
      expect.anything(),
      'teacher',
    );
  });

  it('validates pagination before accessing persistence', async () => {
    const database = { findDirectory: jest.fn() };
    const service = new AdminService(database as never);
    await expect(
      service.list('students', { pageSize: '1000' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.findDirectory).not.toHaveBeenCalled();
  });

  it('rejects a missing teacher before requesting statistics', async () => {
    const database = {
      findTeacherById: jest.fn().mockResolvedValue([]),
      findTeacherStats: jest.fn(),
    };
    const service = new AdminService(database as never);
    await expect(service.teacher('missing', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(database.findTeacherStats).not.toHaveBeenCalled();
  });

  it('fills missing registration days and includes the earlier cumulative baseline', async () => {
    const database = {
      findRegistrationDays: jest
        .fn()
        .mockResolvedValue([{ date: '2025-01-02', count: '2' }]),
      countRegistrationsBefore: jest.fn().mockResolvedValue([{ count: '3' }]),
      findMetadata: jest
        .fn()
        .mockResolvedValue([{ startedAt: '2025-01-01T00:00:00.000Z' }]),
    };
    const result = await new AdminService(database as never).registrations({
      start: '2025-01-02',
      end: '2025-01-03',
    });
    expect(result.series).toEqual([
      { date: '2025-01-02', count: 2, cumulative: 5 },
      { date: '2025-01-03', count: 0, cumulative: 5 },
    ]);
    expect(result.total).toBe(2);
  });
});
