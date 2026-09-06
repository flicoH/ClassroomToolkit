import { Logger } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
describe('AnalyticsService', () => {
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
