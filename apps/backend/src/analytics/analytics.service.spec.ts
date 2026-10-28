import { BadRequestException, Logger } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
describe('AnalyticsService', () => {
  it('accepts semester report opens but rejects client-supplied use events and unknown features', async () => {
    const db = { saveEvent: jest.fn().mockResolvedValue({}) };
    const service = new AnalyticsService(db as never);
    const body = {
      feature: 'semester-reports',
      kind: 'open',
      eventId: '11111111-1111-4111-8111-111111111111',
    };
    await expect(service.recordOpen('teacher', body)).resolves.toEqual({
      accepted: true,
    });
    expect(db.saveEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        teacherId: 'teacher',
        feature: 'semester-reports',
        kind: 'open',
      }),
    );
    await expect(
      service.recordOpen('teacher', { ...body, kind: 'use' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.recordOpen('teacher', { ...body, feature: 'unknown' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.saveEvent).toHaveBeenCalledTimes(1);
  });
  it('deduplicates retries while isolating teachers and actions', async () => {
    const db = { saveEvent: jest.fn().mockResolvedValue({}) };
    const service = new AnalyticsService(db as never);
    await service.record('a', 'use', 'students', 'import', 'event');
    await service.record('a', 'use', 'students', 'import', 'event');
    await service.record('b', 'use', 'students', 'import', 'event');
    expect(db.saveEvent.mock.calls[0]![0].dedupeKey).toBe(
      db.saveEvent.mock.calls[1]![0].dedupeKey,
    );
    expect(db.saveEvent.mock.calls[0]![0].dedupeKey).not.toBe(
      db.saveEvent.mock.calls[2]![0].dedupeKey,
    );
  });
  it('does not fail a classroom operation if event persistence fails', async () => {
    const service = new AnalyticsService({
      saveEvent: jest.fn().mockRejectedValue(new Error('offline')),
    } as never);
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    await expect(
      service.record('a', 'use', 'students', 'create'),
    ).resolves.toBe(false);
    log.mockRestore();
  });
});
