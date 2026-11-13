/// <reference types="jest" />
import { BadRequestException } from '@nestjs/common';
import { AdminService } from '../admin/admin.service';
import { AnalyticsService } from './analytics.service';

// 统计仅使用隔离事件替身，不连接业务库或回填历史记录。
describe.each([
  ['subject-reports', '学科报告'],
  ['semester-reports', '学期报告'],
])('%s analytics registration', (feature, name) => {
  it('accepts opens but rejects client-forged use events', async () => {
    const saveEvent = jest.fn().mockResolvedValue({});
    const service = new AnalyticsService({ saveEvent } as never);
    const body = {
      feature,
      kind: 'open',
      eventId: '11111111-1111-4111-8111-111111111111',
    };
    await expect(service.recordOpen('teacher', body)).resolves.toEqual({
      accepted: true,
    });
    expect(saveEvent).toHaveBeenCalledWith(
      expect.objectContaining({ teacherId: 'teacher', feature, kind: 'open' }),
    );
    await expect(
      service.recordOpen('teacher', { ...body, kind: 'use' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(saveEvent).toHaveBeenCalledTimes(1);
  });

  it('shows zero usage and supports teacher-scoped rankings and trends', async () => {
    const db = {
      findFeatureUsage: jest.fn().mockResolvedValue([]),
      countActiveTeachers: jest.fn().mockResolvedValue([{ count: '4' }]),
      findFeatureDays: jest
        .fn()
        .mockResolvedValue([{ date: '2026-11-08', teachers: '1', uses: '2' }]),
      findMetadata: jest
        .fn()
        .mockResolvedValue([{ startedAt: '2026-09-01T00:00:00.000Z' }]),
    };
    const service = new AdminService(db as never);
    const range = {
      start: '2026-11-07',
      end: '2026-11-08',
      teacherId: 'teacher',
    };
    const empty = await service.features(range);
    expect(empty.items.find((item) => item.key === feature)).toMatchObject({
      name,
      uses: 0,
      teachers: 0,
    });
    db.findFeatureUsage.mockResolvedValue([
      { feature, uses: '2', teachers: '1', openTeachers: '3' },
    ]);
    const ranked = await service.features(range);
    expect(ranked.items.find((item) => item.key === feature)).toMatchObject({
      name,
      uses: 2,
      teachers: 1,
      openTeachers: 3,
      usageRate: 0.25,
    });
    const trend = await service.featureTrend(feature, range);
    expect(trend.name).toBe(name);
    expect(trend.series).toEqual([
      { date: '2026-11-07', teachers: 0, uses: 0 },
      { date: '2026-11-08', teachers: 1, uses: 2 },
    ]);
    expect(db.findFeatureDays).toHaveBeenCalledWith(
      feature,
      expect.anything(),
      'teacher',
    );
    for (const call of db.findFeatureUsage.mock.calls as unknown[][]) {
      expect(call[2]).toBe('teacher');
    }
  });
});
