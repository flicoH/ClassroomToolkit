import { SemesterReportWorker } from './semester-report.worker';
import {
  SemesterReportEntity,
  ReportEventEntity,
} from './semester-report.entity';
import type { DataSource } from 'typeorm';

describe('generated report history', () => {
  it.each(['v1', 'v2'])(
    'saves a recoverable initial %s version in the generation transaction',
    async (reportVersion) => {
      const row = {
        id: 'report',
        teacherId: 'teacher',
        status: 'generating',
        content: null,
        snapshot: { reportVersion, generationMode: 'template' },
        courseScope: '第一课',
      };
      const reports = {
        findOne: jest.fn().mockResolvedValue(row),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
        save: jest.fn(),
      };
      const events = { create: jest.fn((value) => value), save: jest.fn() };
      const manager = {
        getRepository: jest.fn((entity) =>
          entity === SemesterReportEntity ? reports : events,
        ),
      };
      const transaction = jest.fn(async (callback) => callback(manager));
      const worker = new SemesterReportWorker({
        getRepository: manager.getRepository,
        transaction,
      } as unknown as DataSource);
      const internals = worker as unknown as {
        run(): Promise<void>;
        requeueExpiredClaims(): Promise<void>;
        processDocument(): Promise<boolean>;
        generate(): Promise<unknown>;
      };
      jest.spyOn(internals, 'requeueExpiredClaims').mockResolvedValue();
      jest.spyOn(internals, 'processDocument').mockResolvedValue(false);
      jest
        .spyOn(internals, 'generate')
        .mockResolvedValue({ summary: '生成寄语' });
      await internals.run();
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(reports.findOne).toHaveBeenLastCalledWith(
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
      expect(events.save).toHaveBeenLastCalledWith(
        expect.objectContaining({
          action: 'generation-succeeded',
          details: expect.objectContaining({
            revision: {
              schema: 1,
              after: expect.objectContaining({
                content: { summary: '生成寄语' },
              }),
            },
          }),
        }),
      );
      expect(manager.getRepository).toHaveBeenCalledWith(ReportEventEntity);
    },
  );
});
