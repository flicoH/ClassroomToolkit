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
        queueDueScheduledReports(): Promise<void>;
        processDocument(): Promise<boolean>;
        generate(): Promise<unknown>;
      };
      jest.spyOn(internals, 'requeueExpiredClaims').mockResolvedValue();
      jest.spyOn(internals, 'queueDueScheduledReports').mockResolvedValue();
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

  it('promotes due scheduled reports to queued status in background worker', async () => {
    const qb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 2 }),
    };
    const repo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    const worker = new SemesterReportWorker({
      getRepository: jest.fn().mockReturnValue(repo),
    } as unknown as DataSource);
    const internals = worker as unknown as {
      queueDueScheduledReports(): Promise<void>;
    };
    await internals.queueDueScheduledReports();
    expect(qb.set).toHaveBeenCalledWith({ status: 'queued' });
    expect(qb.where).toHaveBeenCalledWith('status = :status', {
      status: 'scheduled',
    });
    expect(qb.execute).toHaveBeenCalled();
  });

  it('recognizes a legacy queued task from scheduledTask without reportKind', async () => {
    const stageRow = {
      id: 'legacy-stage-report',
      teacherId: 'teacher-1',
      studentName: '历史学生',
      periodType: 'term',
      periodStart: new Date('2026-03-01'),
      periodEnd: new Date('2026-05-30'),
      status: 'queued',
      content: null,
      snapshot: {
        reportVersion: 'v2',
        generationMode: 'template',
        allowedReferences: ['stage-summary'],
        scheduledTask: { taskId: 'legacy-task', name: '历史阶段汇总' },
      },
    };
    const reports = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(stageRow)
        .mockResolvedValueOnce({ ...stageRow, status: 'generating' }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      save: jest.fn(),
    };
    const events = { create: jest.fn((value) => value), save: jest.fn() };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === SemesterReportEntity ? reports : events,
      ),
    };
    const worker = new SemesterReportWorker({
      getRepository: manager.getRepository,
      transaction: jest.fn(async (callback) => callback(manager)),
    } as unknown as DataSource);
    const internals = worker as unknown as {
      run(): Promise<void>;
      requeueExpiredClaims(): Promise<void>;
      queueDueScheduledReports(): Promise<void>;
      processDocument(): Promise<boolean>;
    };
    jest.spyOn(internals, 'requeueExpiredClaims').mockResolvedValue();
    jest.spyOn(internals, 'queueDueScheduledReports').mockResolvedValue();
    jest.spyOn(internals, 'processDocument').mockResolvedValue(false);

    await internals.run();

    expect(reports.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft' }),
    );
  });

  it('generates stage report draft when scheduled task becomes queued', async () => {
    const stageRow = {
      id: 'stage-report-1',
      teacherId: 'teacher-1',
      studentName: '测试学生',
      periodType: 'term',
      periodStart: new Date('2026-03-01'),
      periodEnd: new Date('2026-05-30'),
      status: 'queued',
      content: null,
      snapshot: {
        reportVersion: 'v2',
        reportKind: 'stage',
        generationMode: 'auto',
        allowedReferences: ['stage-summary'],
        scheduledTask: {
          id: 'task-1',
          name: '阶段成长汇总',
          executeAt: new Date(Date.now() - 1000).toISOString(),
        },
      },
    };
    const reports = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(stageRow)
        .mockResolvedValueOnce({ ...stageRow, status: 'generating' }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      save: jest.fn(),
    };
    const events = { create: jest.fn((val) => val), save: jest.fn() };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === SemesterReportEntity ? reports : events,
      ),
    };
    const transaction = jest.fn(async (cb) => cb(manager));
    const worker = new SemesterReportWorker({
      getRepository: manager.getRepository,
      transaction,
    } as unknown as DataSource);
    const internals = worker as unknown as {
      run(): Promise<void>;
      requeueExpiredClaims(): Promise<void>;
      queueDueScheduledReports(): Promise<void>;
      processDocument(): Promise<boolean>;
    };
    jest.spyOn(internals, 'requeueExpiredClaims').mockResolvedValue();
    jest.spyOn(internals, 'queueDueScheduledReports').mockResolvedValue();
    jest.spyOn(internals, 'processDocument').mockResolvedValue(false);

    await internals.run();

    expect(reports.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'draft',
        content: expect.objectContaining({
          summary: expect.stringContaining('测试学生'),
        }),
      }),
    );
  });

  it('creates a fallback draft instead of leaving a stage student failed when AI fails', async () => {
    process.env.REPORT_AI_BASE_URL = 'https://example.invalid/v1';
    process.env.REPORT_AI_API_KEY = 'test-key';
    process.env.REPORT_AI_MODEL = 'kimi-k2.6';
    const stageRow = {
      id: 'stage-fallback-1',
      teacherId: 'teacher-1',
      studentName: '兜底学生',
      periodType: 'term',
      periodStart: new Date('2026-03-01'),
      periodEnd: new Date('2026-05-30'),
      status: 'queued',
      content: null,
      aiResponse: null,
      snapshot: {
        reportVersion: 'v2',
        reportKind: 'stage',
        generationMode: 'ai',
        allowedReferences: ['stage-summary'],
        scheduledTask: { id: 'task-fallback', name: '阶段汇总' },
      },
    };
    const reports = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(stageRow)
        .mockResolvedValueOnce({ ...stageRow, status: 'generating' }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      save: jest.fn(),
    };
    const events = { create: jest.fn((value) => value), save: jest.fn() };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === SemesterReportEntity ? reports : events,
      ),
    };
    const worker = new SemesterReportWorker({
      getRepository: manager.getRepository,
      transaction: jest.fn(async (callback) => callback(manager)),
    } as unknown as DataSource);
    const internals = worker as unknown as {
      run(): Promise<void>;
      requeueExpiredClaims(): Promise<void>;
      queueDueScheduledReports(): Promise<void>;
      processDocument(): Promise<boolean>;
      generate(): Promise<unknown>;
    };
    jest.spyOn(internals, 'requeueExpiredClaims').mockResolvedValue();
    jest.spyOn(internals, 'queueDueScheduledReports').mockResolvedValue();
    jest.spyOn(internals, 'processDocument').mockResolvedValue(false);
    jest.spyOn(internals, 'generate').mockRejectedValue(new Error('Kimi 超时'));

    await internals.run();

    expect(reports.update).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'failed' }),
    );
    expect(reports.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'draft',
        aiResponse: expect.objectContaining({
          error: expect.objectContaining({ message: 'Kimi 超时' }),
        }),
      }),
    );
    expect(events.save).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'generation-fallback' }),
    );
    delete process.env.REPORT_AI_BASE_URL;
    delete process.env.REPORT_AI_API_KEY;
    delete process.env.REPORT_AI_MODEL;
  });
});
