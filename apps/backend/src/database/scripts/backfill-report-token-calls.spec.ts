import type { DataSource } from 'typeorm';
import {
  extractCallFromAiResponse,
  runBackfillTokenCalls,
} from './backfill-report-token-calls';
import {
  SemesterReportEntity,
  SemesterReportTokenCallEntity,
} from '../../semester-reports/semester-report.entity';

describe('backfill-report-token-calls', () => {
  describe('extractCallFromAiResponse', () => {
    it('extracts tokens, model and responseId from standard Kimi response object', () => {
      const payload = {
        id: 'chatcmpl-test-001',
        model: 'moonshot-v1-8k',
        created: 1730000000,
        choices: [{ message: { content: '{"summary":"测试"}' } }],
        usage: {
          prompt_tokens: 250,
          completion_tokens: 120,
          total_tokens: 370,
        },
      };

      const extracted = extractCallFromAiResponse(
        payload,
        new Date('2026-10-27T00:00:00.000Z'),
      );

      expect(extracted).not.toBeNull();
      expect(extracted!.provider).toBe('moonshot');
      expect(extracted!.model).toBe('moonshot-v1-8k');
      expect(extracted!.status).toBe('responded');
      expect(extracted!.promptTokens).toBe(250);
      expect(extracted!.completionTokens).toBe(120);
      expect(extracted!.totalTokens).toBe(370);
      expect(extracted!.responseId).toBe('chatcmpl-test-001');
      expect(extracted!.calledAt.getTime()).toBe(1730000000 * 1000);
    });

    it('extracts JSON string ai_response properly', () => {
      const payloadString = JSON.stringify({
        id: 'chatcmpl-test-str',
        model: 'kimi-k2.6',
        usage: {
          prompt_tokens: 500,
          completion_tokens: 300,
          total_tokens: 800,
        },
      });

      const extracted = extractCallFromAiResponse(
        payloadString,
        new Date('2026-10-28T08:00:00.000Z'),
      );

      expect(extracted).not.toBeNull();
      expect(extracted!.provider).toBe('kimi');
      expect(extracted!.model).toBe('kimi-k2.6');
      expect(extracted!.totalTokens).toBe(800);
    });

    it('extracts failed call metadata from error ai_response payload', () => {
      const errorPayload = {
        model: 'moonshot-v1-32k',
        error: {
          type: 'network_or_timeout',
          message: '连接超时',
        },
      };

      const extracted = extractCallFromAiResponse(
        errorPayload,
        new Date('2026-10-29T10:00:00.000Z'),
      );

      expect(extracted).not.toBeNull();
      expect(extracted!.status).toBe('failed');
      expect(extracted!.model).toBe('moonshot-v1-32k');
      expect(extracted!.promptTokens).toBeNull();
      expect(extracted!.totalTokens).toBeNull();
    });

    it('returns null for empty, non-AI or invalid payloads', () => {
      expect(extractCallFromAiResponse(null, new Date())).toBeNull();
      expect(extractCallFromAiResponse({}, new Date())).toBeNull();
      expect(extractCallFromAiResponse('invalid-json', new Date())).toBeNull();
      expect(
        extractCallFromAiResponse({ other: 'unrelated' }, new Date()),
      ).toBeNull();
    });
  });

  describe('runBackfillTokenCalls', () => {
    it('skips already tracked reports and backfills unrecorded historical reports', async () => {
      const mockReports: Array<Partial<SemesterReportEntity>> = [
        {
          id: 'rep-already-tracked',
          teacherId: 'teacher-1',
          studentId: 'stu-1',
          status: 'draft',
          aiResponse: {
            id: 'chatcmpl-0',
            model: 'moonshot-v1-8k',
            usage: {
              prompt_tokens: 100,
              completion_tokens: 50,
              total_tokens: 150,
            },
          },
          createdAt: new Date('2026-10-20T00:00:00.000Z'),
          updatedAt: new Date('2026-10-20T00:00:02.000Z'),
        },
        {
          id: 'rep-historical-1',
          teacherId: 'teacher-1',
          studentId: 'stu-2',
          status: 'draft',
          aiResponse: {
            id: 'chatcmpl-hist-1',
            model: 'moonshot-v1-8k',
            usage: {
              prompt_tokens: 300,
              completion_tokens: 150,
              total_tokens: 450,
            },
          },
          createdAt: new Date('2026-10-22T00:00:00.000Z'),
          updatedAt: new Date('2026-10-22T00:00:03.000Z'),
        },
      ];

      const reportQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockReports),
      };

      const callsQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValue([{ reportId: 'rep-already-tracked' }]),
      };

      const savedBatches: Array<SemesterReportTokenCallEntity[]> = [];
      const mockCallsRepo = {
        createQueryBuilder: jest.fn().mockReturnValue(callsQueryBuilder),
        create: jest.fn((attrs) => attrs),
        save: jest.fn(async (items) => {
          savedBatches.push(items);
          return items;
        }),
      };

      const mockReportRepo = {
        createQueryBuilder: jest.fn().mockReturnValue(reportQueryBuilder),
      };

      const mockDs = {
        getRepository: jest.fn((entity) => {
          if (entity === SemesterReportEntity) return mockReportRepo;
          if (entity === SemesterReportTokenCallEntity) return mockCallsRepo;
          return null;
        }),
      } as unknown as DataSource;

      const mockLogger = {
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
      } as unknown as Console;

      const stats = await runBackfillTokenCalls({
        dataSource: mockDs,
        dryRun: false,
        logger: mockLogger,
      });

      expect(stats.totalReportsWithAiResponse).toBe(2);
      expect(stats.alreadyTrackedCount).toBe(1);
      expect(stats.backfilledCount).toBe(1);
      expect(stats.totalTokens).toBe(450);
      expect(mockCallsRepo.save).toHaveBeenCalledTimes(1);
      expect(savedBatches[0][0].reportId).toBe('rep-historical-1');
      expect(savedBatches[0][0].totalTokens).toBe(450);
      expect(savedBatches[0][0].responseId).toBe('chatcmpl-hist-1');
    });

    it('performs preview only without saving in dryRun mode', async () => {
      const mockReports: Array<Partial<SemesterReportEntity>> = [
        {
          id: 'rep-dry-run',
          teacherId: 'teacher-2',
          studentId: 'stu-3',
          status: 'draft',
          aiResponse: {
            id: 'chatcmpl-dry',
            model: 'moonshot-v1-8k',
            usage: {
              prompt_tokens: 120,
              completion_tokens: 80,
              total_tokens: 200,
            },
          },
          createdAt: new Date('2026-10-25T00:00:00.000Z'),
          updatedAt: new Date('2026-10-25T00:00:02.000Z'),
        },
      ];

      const reportQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockReports),
      };

      const callsQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      const mockCallsRepo = {
        createQueryBuilder: jest.fn().mockReturnValue(callsQueryBuilder),
        create: jest.fn((attrs) => attrs),
        save: jest.fn(),
      };

      const mockReportRepo = {
        createQueryBuilder: jest.fn().mockReturnValue(reportQueryBuilder),
      };

      const mockDs = {
        getRepository: jest.fn((entity) => {
          if (entity === SemesterReportEntity) return mockReportRepo;
          if (entity === SemesterReportTokenCallEntity) return mockCallsRepo;
          return null;
        }),
      } as unknown as DataSource;

      const mockLogger = {
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
      } as unknown as Console;

      const stats = await runBackfillTokenCalls({
        dataSource: mockDs,
        dryRun: true,
        logger: mockLogger,
      });

      expect(stats.backfilledCount).toBe(1);
      expect(stats.totalTokens).toBe(200);
      expect(mockCallsRepo.save).not.toHaveBeenCalled();
    });
  });
});
