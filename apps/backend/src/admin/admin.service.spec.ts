import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';

describe('AdminService', () => {
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
