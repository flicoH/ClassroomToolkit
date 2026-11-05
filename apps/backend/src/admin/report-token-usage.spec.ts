import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AdminAuthGuard } from './auth/admin-auth.guard';
import { Reflector } from '@nestjs/core';
import { AdminDatabase } from './admin.database';
import { SemesterReportWorker } from '../semester-reports/semester-report.worker';
import {
  SemesterReportEntity,
  SemesterReportTokenCallEntity,
} from '../semester-reports/semester-report.entity';
import type { DataSource } from 'typeorm';

describe('Admin Report Token Usage & Tracking', () => {
  const originalBaseUrl = process.env.REPORT_AI_BASE_URL;
  const originalApiKey = process.env.REPORT_AI_API_KEY;
  const originalModel = process.env.REPORT_AI_MODEL;

  beforeEach(() => {
    process.env.REPORT_AI_BASE_URL = 'https://example.invalid/v1';
    process.env.REPORT_AI_API_KEY = 'test-api-key';
    process.env.REPORT_AI_MODEL = 'moonshot-v1-8k';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalBaseUrl === undefined) delete process.env.REPORT_AI_BASE_URL;
    else process.env.REPORT_AI_BASE_URL = originalBaseUrl;
    if (originalApiKey === undefined) delete process.env.REPORT_AI_API_KEY;
    else process.env.REPORT_AI_API_KEY = originalApiKey;
    if (originalModel === undefined) delete process.env.REPORT_AI_MODEL;
    else process.env.REPORT_AI_MODEL = originalModel;
  });

  const createMockReport = (
    overrides: Partial<SemesterReportEntity> = {},
  ): SemesterReportEntity => {
    return {
      id: 'rep-1',
      teacherId: 'teacher-1',
      termId: 'term-1',
      subjectId: 'subject-1',
      studentId: 'student-1',
      studentName: '测试学生',
      className: '三年级一班',
      periodType: 'week',
      periodStart: new Date('2026-11-02T00:00:00.000Z'),
      periodEnd: new Date('2026-11-08T23:59:59.000Z'),
      scoreScope: 'overall',
      snapshot: {
        generationMode: 'ai',
        courseScope: '健康课',
        allowedReferences: ['course:doc-1:p1'],
        courseDocuments: [
          {
            id: 'doc-1',
            fileName: 'Health.pdf',
            pages: [{ page: 1, text: '健康饮食与作息目标。' }],
          },
        ],
      },
      content: null,
      aiResponse: null,
      status: 'generating',
      keywords: '健康',
      teacherObservation: '积极配合',
      courseScope: '健康课',
      errorMessage: null,
      publishedAt: null,
      createdAt: new Date('2026-11-04T02:00:00.000Z'),
      updatedAt: new Date('2026-11-04T02:00:00.000Z'),
      ...overrides,
    };
  };

  describe('Worker token usage collection', () => {
    it('records in_progress and updates to responded with token usage for normal Kimi calls', async () => {
      const savedRecords: Array<Partial<SemesterReportTokenCallEntity>> = [];
      const tokenCallsRepo = {
        save: jest.fn(
          async (record: Partial<SemesterReportTokenCallEntity>) => {
            savedRecords.push(record);
            return record;
          },
        ),
      };
      const mockDataSource = {
        getRepository: jest.fn((entity) => {
          if (entity === SemesterReportTokenCallEntity) return tokenCallsRepo;
          return null;
        }),
      } as unknown as DataSource;

      const validKimiBody = {
        id: 'chatcmpl-test-123',
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: '学生在健康课程中表现优秀。',
                courseOverview: '学习了健康饮食。',
                strengths: [
                  {
                    text: '能按时完成健康计划',
                    sourceRefs: ['course:doc-1:p1'],
                  },
                ],
                areasToImprove: [],
                homeSuggestions: [],
                limitations: ['依据当前课程记录草拟'],
              }),
            },
          },
        ],
        usage: {
          prompt_tokens: 150,
          completion_tokens: 80,
          total_tokens: 230,
        },
      };

      jest.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(validKimiBody), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      const worker = new SemesterReportWorker(mockDataSource) as unknown as {
        generate(
          report: SemesterReportEntity,
          mode: 'ai',
        ): Promise<Record<string, unknown>>;
      };

      const report = createMockReport();
      const content = await worker.generate(report, 'ai');

      expect(content).toBeDefined();
      expect(tokenCallsRepo.save).toHaveBeenCalledTimes(2);

      const initialSave = savedRecords[0];
      expect(initialSave.status).toBe('in_progress');
      expect(initialSave.reportId).toBe('rep-1');
      expect(initialSave.studentId).toBe('student-1');
      expect(initialSave.model).toBe('moonshot-v1-8k');
      expect(initialSave.promptTokens).toBeNull();
      expect(initialSave.completionTokens).toBeNull();
      expect(initialSave.totalTokens).toBeNull();

      const updatedSave = savedRecords[1];
      expect(updatedSave.id).toBe(initialSave.id);
      expect(updatedSave.status).toBe('responded');
      expect(updatedSave.promptTokens).toBe(150);
      expect(updatedSave.completionTokens).toBe(80);
      expect(updatedSave.totalTokens).toBe(230);
      expect(updatedSave.responseId).toBe('chatcmpl-test-123');
      expect(updatedSave.respondedAt).toBeInstanceOf(Date);
    });

    it('records multiple independent calls under the same report upon re-generation', async () => {
      const savedRecords: Array<Partial<SemesterReportTokenCallEntity>> = [];
      const tokenCallsRepo = {
        save: jest.fn(
          async (record: Partial<SemesterReportTokenCallEntity>) => {
            savedRecords.push(record);
            return record;
          },
        ),
      };
      const mockDataSource = {
        getRepository: jest.fn(() => tokenCallsRepo),
      } as unknown as DataSource;

      const worker = new SemesterReportWorker(mockDataSource) as unknown as {
        generate(
          report: SemesterReportEntity,
          mode: 'ai',
        ): Promise<Record<string, unknown>>;
      };

      const validContent = {
        summary: '报告内容',
        courseOverview: '课程概况',
        strengths: [{ text: '优点', sourceRefs: ['course:doc-1:p1'] }],
        areasToImprove: [],
        homeSuggestions: [],
        limitations: ['仅供参考'],
      };

      jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'chatcmpl-call-1',
              choices: [{ message: { content: JSON.stringify(validContent) } }],
              usage: {
                prompt_tokens: 100,
                completion_tokens: 50,
                total_tokens: 150,
              },
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'chatcmpl-call-2',
              choices: [{ message: { content: JSON.stringify(validContent) } }],
              usage: {
                prompt_tokens: 110,
                completion_tokens: 60,
                total_tokens: 170,
              },
            }),
            { status: 200 },
          ),
        );

      const report = createMockReport();
      await worker.generate(report, 'ai');
      await worker.generate(report, 'ai');

      // 每次调用各保存 2 次（进行中 + 收到响应），总计 4 次保存，且两次调用的 call ID 互不相同
      expect(savedRecords).toHaveLength(4);
      expect(savedRecords[0].id).not.toBe(savedRecords[2].id);
      expect(savedRecords[0].reportId).toBe('rep-1');
      expect(savedRecords[2].reportId).toBe('rep-1');
      expect(savedRecords[1].totalTokens).toBe(150);
      expect(savedRecords[3].totalTokens).toBe(170);
    });

    it('records tokens even when report content validation or JSON parsing fails after receiving usage', async () => {
      const savedRecords: Array<Partial<SemesterReportTokenCallEntity>> = [];
      const tokenCallsRepo = {
        save: jest.fn(
          async (record: Partial<SemesterReportTokenCallEntity>) => {
            savedRecords.push(record);
            return record;
          },
        ),
      };
      const mockDataSource = {
        getRepository: jest.fn(() => tokenCallsRepo),
      } as unknown as DataSource;

      // 模型返回了有效的 Token 用量，但返回的正文是残缺非 JSON 文本
      jest.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'chatcmpl-invalid-json',
            choices: [{ message: { content: '这不是合法的JSON对象' } }],
            usage: {
              prompt_tokens: 200,
              completion_tokens: 50,
              total_tokens: 250,
            },
          }),
          { status: 200 },
        ),
      );

      const worker = new SemesterReportWorker(mockDataSource) as unknown as {
        generate(
          report: SemesterReportEntity,
          mode: 'ai',
        ): Promise<Record<string, unknown>>;
      };

      const report = createMockReport();
      await expect(worker.generate(report, 'ai')).rejects.toThrow(
        '未返回有效 JSON 结构',
      );

      // 验证在抛出内容校验异常前，用量已经成功落库
      expect(savedRecords).toHaveLength(2);
      expect(savedRecords[1].status).toBe('responded');
      expect(savedRecords[1].promptTokens).toBe(200);
      expect(savedRecords[1].completionTokens).toBe(50);
      expect(savedRecords[1].totalTokens).toBe(250);
    });

    it('records null usage when 200 response lacks usage information', async () => {
      const savedRecords: Array<Partial<SemesterReportTokenCallEntity>> = [];
      const tokenCallsRepo = {
        save: jest.fn(
          async (record: Partial<SemesterReportTokenCallEntity>) => {
            savedRecords.push(record);
            return record;
          },
        ),
      };
      const mockDataSource = {
        getRepository: jest.fn(() => tokenCallsRepo),
      } as unknown as DataSource;

      const validContent = {
        summary: '摘要',
        courseOverview: '课程',
        strengths: [{ text: '优点', sourceRefs: ['course:doc-1:p1'] }],
        areasToImprove: [],
        homeSuggestions: [],
        limitations: ['参考'],
      };

      jest.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'chatcmpl-no-usage',
            choices: [{ message: { content: JSON.stringify(validContent) } }],
            // 缺失 usage 字段
          }),
          { status: 200 },
        ),
      );

      const worker = new SemesterReportWorker(mockDataSource) as unknown as {
        generate(
          report: SemesterReportEntity,
          mode: 'ai',
        ): Promise<Record<string, unknown>>;
      };

      const report = createMockReport();
      await worker.generate(report, 'ai');

      expect(savedRecords).toHaveLength(2);
      expect(savedRecords[1].status).toBe('responded');
      expect(savedRecords[1].promptTokens).toBeNull();
      expect(savedRecords[1].completionTokens).toBeNull();
      expect(savedRecords[1].totalTokens).toBeNull();
      expect(savedRecords[1].responseId).toBe('chatcmpl-no-usage');
    });

    it('records failed status and null usage when upstream returns HTTP error', async () => {
      const savedRecords: Array<Partial<SemesterReportTokenCallEntity>> = [];
      const tokenCallsRepo = {
        save: jest.fn(
          async (record: Partial<SemesterReportTokenCallEntity>) => {
            savedRecords.push(record);
            return record;
          },
        ),
      };
      const mockDataSource = {
        getRepository: jest.fn(() => tokenCallsRepo),
      } as unknown as DataSource;

      jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(
          new Response('Service Unavailable', { status: 503 }),
        );

      const worker = new SemesterReportWorker(mockDataSource) as unknown as {
        generate(
          report: SemesterReportEntity,
          mode: 'ai',
        ): Promise<Record<string, unknown>>;
      };

      const report = createMockReport();
      await expect(worker.generate(report, 'ai')).rejects.toThrow('HTTP 503');

      expect(savedRecords).toHaveLength(2);
      expect(savedRecords[0].status).toBe('in_progress');
      expect(savedRecords[1].status).toBe('failed');
      expect(savedRecords[1].promptTokens).toBeNull();
      expect(savedRecords[1].totalTokens).toBeNull();
      expect(savedRecords[1].respondedAt).toBeInstanceOf(Date);
    });

    it('records failed status and null usage when upstream times out or network fails', async () => {
      const savedRecords: Array<Partial<SemesterReportTokenCallEntity>> = [];
      const tokenCallsRepo = {
        save: jest.fn(
          async (record: Partial<SemesterReportTokenCallEntity>) => {
            savedRecords.push(record);
            return record;
          },
        ),
      };
      const mockDataSource = {
        getRepository: jest.fn(() => tokenCallsRepo),
      } as unknown as DataSource;

      jest
        .spyOn(global, 'fetch')
        .mockRejectedValueOnce(
          new Error('The operation was aborted due to timeout'),
        );

      const worker = new SemesterReportWorker(mockDataSource) as unknown as {
        generate(
          report: SemesterReportEntity,
          mode: 'ai',
        ): Promise<Record<string, unknown>>;
      };

      const report = createMockReport();
      await expect(worker.generate(report, 'ai')).rejects.toThrow(
        '网络连接失败或超时',
      );

      expect(savedRecords).toHaveLength(2);
      expect(savedRecords[0].status).toBe('in_progress');
      expect(savedRecords[1].status).toBe('failed');
      expect(savedRecords[1].promptTokens).toBeNull();
      expect(savedRecords[1].totalTokens).toBeNull();
      expect(savedRecords[1].respondedAt).toBeInstanceOf(Date);
    });

    it('does not write token call record when report generation mode is template', async () => {
      const tokenCallsRepo = {
        save: jest.fn(),
      };
      const mockDataSource = {
        getRepository: jest.fn(() => tokenCallsRepo),
      } as unknown as DataSource;

      const worker = new SemesterReportWorker(mockDataSource) as unknown as {
        generate(
          report: SemesterReportEntity,
          mode: 'template',
        ): Promise<Record<string, unknown>>;
      };

      const report = createMockReport({
        snapshot: {
          generationMode: 'template',
          allowedReferences: ['course:doc-1:p1'],
          courseDocuments: [
            {
              id: 'doc-1',
              fileName: 'Health.pdf',
              pages: [{ page: 1, text: '健康饮食与作息目标。' }],
            },
          ],
          learningContents: [
            {
              id: 'c1',
              section: '第一节',
              text: '健康饮食',
              sourceRefs: ['course:doc-1:p1'],
            },
          ],
        },
      });

      const content = await worker.generate(report, 'template');
      expect(content).toBeDefined();
      expect(tokenCallsRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('Admin Service & Database query behavior', () => {
    it('returns report token usage summary with tracked, template and legacy statuses', async () => {
      const mockDb: Partial<AdminDatabase> = {
        findReportTokenUsage: jest.fn(async (_q, range, page) => {
          return {
            total: 3,
            page: page.page,
            pageSize: page.pageSize,
            range: { start: range.start, end: range.end },
            summary: {
              totalReports: 3,
              totalCalls: 2,
              promptTokens: 300,
              completionTokens: 150,
              totalTokens: 450,
              unknownCalls: 1,
            },
            items: [
              {
                reportId: 'rep-tracked',
                studentId: 'stu-1',
                studentName: '追踪学生',
                className: '一班',
                reportKind: 'week',
                periodType: 'week',
                periodStart: '2026-11-02T00:00:00.000Z',
                periodEnd: '2026-11-08T23:59:59.000Z',
                latestCalledAt: '2026-11-04T08:00:00.000Z',
                callsCount: 2,
                promptTokens: 300,
                completionTokens: 150,
                totalTokens: 450,
                unknownCallsCount: 1,
                trackingStatus: 'tracked' as const,
              },
              {
                reportId: 'rep-template',
                studentId: 'stu-2',
                studentName: '模板学生',
                className: '一班',
                reportKind: 'stage',
                periodType: 'month',
                periodStart: '2026-10-01T00:00:00.000Z',
                periodEnd: '2026-10-31T23:59:59.000Z',
                latestCalledAt: null,
                callsCount: 0,
                promptTokens: null,
                completionTokens: null,
                totalTokens: null,
                unknownCallsCount: 0,
                trackingStatus: 'template_no_model' as const,
              },
              {
                reportId: 'rep-legacy',
                studentId: 'stu-3',
                studentName: '旧报告学生',
                className: '二班',
                reportKind: 'week',
                periodType: 'week',
                periodStart: '2026-09-01T00:00:00.000Z',
                periodEnd: '2026-09-07T23:59:59.000Z',
                latestCalledAt: null,
                callsCount: 0,
                promptTokens: null,
                completionTokens: null,
                totalTokens: null,
                unknownCallsCount: 0,
                trackingStatus: 'legacy_untracked' as const,
              },
            ],
          };
        }),
      };

      const service = new AdminService(mockDb as AdminDatabase);
      const result = await service.reportTokenUsage({
        start: '2026-10-06',
        end: '2026-11-04',
        page: '1',
        pageSize: '20',
      });

      expect(result.summary.totalTokens).toBe(450);
      expect(result.summary.unknownCalls).toBe(1);
      expect(result.items).toHaveLength(3);
      expect(result.items[0].trackingStatus).toBe('tracked');
      expect(result.items[1].trackingStatus).toBe('template_no_model');
      expect(result.items[2].trackingStatus).toBe('legacy_untracked');

      // 验证未泄露提示词、密钥或错误堆栈
      expect(
        (result.items[0] as Record<string, unknown>).apiKey,
      ).toBeUndefined();
      expect(
        (result.items[0] as Record<string, unknown>).messages,
      ).toBeUndefined();
      expect(
        (result.items[0] as Record<string, unknown>).content,
      ).toBeUndefined();
    });

    it('extracts studentNo from composite studentId and populates teacher metadata in AdminDatabase', async () => {
      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        clone: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        getRawOne: jest.fn().mockResolvedValue({ count: '1' }),
        getRawMany: jest.fn().mockResolvedValue([
          {
            reportId: 'rep-composite',
            teacherId: 'teacher-101',
            teacherName: '王老师',
            teacherUsername: 'wang101',
            studentId: 'teacher-101:class-201:2026020',
            studentName: '王小明',
            className: '三年级一班',
            periodType: 'week',
            periodStart: '2026-11-02',
            periodEnd: '2026-11-08',
            snapshot: JSON.stringify({ generationMode: 'ai' }),
            createdAt: '2026-11-04',
            latestCalledAt: '2026-11-04T08:00:00.000Z',
            callsCount: 1,
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
            unknownCallsCount: 0,
          },
        ]),
      };

      const mockCallsQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalCalls: '1',
          promptTokens: '100',
          completionTokens: '50',
          totalTokens: '150',
          unknownCalls: '0',
        }),
      };

      const mockReportRepo = {
        createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      };
      const mockCallsRepo = {
        createQueryBuilder: jest.fn().mockReturnValue(mockCallsQueryBuilder),
      };

      const mockTeachersRepo = {
        manager: {
          getRepository: jest.fn((entity) => {
            if (entity === SemesterReportEntity) return mockReportRepo;
            if (entity === SemesterReportTokenCallEntity) return mockCallsRepo;
            return null;
          }),
        },
      };

      const { AdminDatabase: _ignored, ..._rest } = {};
      void _ignored;
      void _rest;
      const db = new AdminDatabase(
        mockTeachersRepo as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );

      const result = await db.findReportTokenUsage(
        {},
        {
          from: '2026-10-05 16:00:00.000',
          to: '2026-11-04 16:00:00.000',
          start: '2026-10-06',
          end: '2026-11-04',
        },
        { page: 1, pageSize: 20, offset: 0 },
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].teacherName).toBe('王老师');
      expect(result.items[0].teacherUsername).toBe('wang101');
      expect(result.items[0].studentNo).toBe('2026020');
      expect(result.items[0].className).toBe('三年级一班');
    });

    it('dynamically falls back to aiResponse for historical reports with zero tracked calls', async () => {
      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        clone: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        getRawOne: jest.fn().mockResolvedValue({ count: '1' }),
        getRawMany: jest.fn().mockResolvedValue([
          {
            reportId: 'rep-hist-untracked',
            teacherId: 'teacher-202',
            teacherName: '李老师',
            teacherUsername: 'li202',
            studentId: 'stu-hist',
            studentName: '历史学生',
            className: '二年级三班',
            periodType: 'month',
            periodStart: '2026-10-01',
            periodEnd: '2026-10-31',
            snapshot: JSON.stringify({ generationMode: 'ai' }),
            aiResponse: JSON.stringify({
              id: 'chatcmpl-hist-fallback',
              model: 'moonshot-v1-8k',
              usage: {
                prompt_tokens: 350,
                completion_tokens: 150,
                total_tokens: 500,
              },
            }),
            createdAt: '2026-10-25T08:00:00.000Z',
            updatedAt: '2026-10-25T08:00:03.000Z',
            latestCalledAt: null,
            callsCount: 0,
            promptTokens: null,
            completionTokens: null,
            totalTokens: null,
            unknownCallsCount: 0,
          },
        ]),
      };

      const mockCallsQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalCalls: '0',
          promptTokens: '0',
          completionTokens: '0',
          totalTokens: '0',
          unknownCalls: '0',
        }),
      };

      const mockReportRepo = {
        createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      };
      const mockCallsRepo = {
        createQueryBuilder: jest.fn().mockReturnValue(mockCallsQueryBuilder),
      };

      const mockTeachersRepo = {
        manager: {
          getRepository: jest.fn((entity) => {
            if (entity === SemesterReportEntity) return mockReportRepo;
            if (entity === SemesterReportTokenCallEntity) return mockCallsRepo;
            return null;
          }),
        },
      };

      const db = new AdminDatabase(
        mockTeachersRepo as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );

      const result = await db.findReportTokenUsage(
        {},
        {
          from: '2026-10-01 00:00:00.000',
          to: '2026-11-01 00:00:00.000',
          start: '2026-10-01',
          end: '2026-10-31',
        },
        { page: 1, pageSize: 20, offset: 0 },
      );

      expect(result.items).toHaveLength(1);
      const item = result.items[0];
      expect(item.trackingStatus).toBe('tracked');
      expect(item.callsCount).toBe(1);
      expect(item.promptTokens).toBe(350);
      expect(item.completionTokens).toBe(150);
      expect(item.totalTokens).toBe(500);
    });

    it('returns synthesized call log from aiResponse when findReportTokenCalls finds no records in calls table', async () => {
      const mockReportRepo = {
        findOne: jest.fn().mockResolvedValue({
          id: 'rep-hist-call',
          studentName: '测试历史学生',
          status: 'draft',
          aiResponse: {
            id: 'chatcmpl-hist-call-1',
            model: 'moonshot-v1-8k',
            created: 1730000000,
            usage: {
              prompt_tokens: 200,
              completion_tokens: 100,
              total_tokens: 300,
            },
          },
          createdAt: new Date('2026-10-27T08:00:00.000Z'),
          updatedAt: new Date('2026-10-27T08:00:03.000Z'),
        }),
      };

      const mockCallsQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      const mockCallsRepo = {
        createQueryBuilder: jest.fn().mockReturnValue(mockCallsQueryBuilder),
      };

      const mockTeachersRepo = {
        manager: {
          getRepository: jest.fn((entity) => {
            if (entity === SemesterReportEntity) return mockReportRepo;
            if (entity === SemesterReportTokenCallEntity) return mockCallsRepo;
            return null;
          }),
        },
      };

      const db = new AdminDatabase(
        mockTeachersRepo as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );

      const callsResult = await db.findReportTokenCalls(
        'rep-hist-call',
        {},
        {
          from: '2026-10-01 00:00:00.000',
          to: '2026-11-01 00:00:00.000',
          start: '2026-10-01',
          end: '2026-10-31',
        },
        { page: 1, pageSize: 10, offset: 0 },
      );

      expect(callsResult).not.toBeNull();
      expect(callsResult!.total).toBe(1);
      expect(callsResult!.items).toHaveLength(1);
      expect(callsResult!.items[0].totalTokens).toBe(300);
      expect(callsResult!.items[0].responseId).toBe('chatcmpl-hist-call-1');
      expect(callsResult!.items[0].status).toBe('responded');
    });

    it('returns detailed call logs for a specific report excluding sensitive data', async () => {
      const mockDb: Partial<AdminDatabase> = {
        findReportTokenCalls: jest.fn(async (reportId, _q, range, page) => {
          return {
            reportId,
            studentName: '测试学生',
            total: 2,
            page: page.page,
            pageSize: page.pageSize,
            range: { start: range.start, end: range.end },
            items: [
              {
                id: 'call-2',
                calledAt: '2026-11-04T08:00:00.000Z',
                respondedAt: '2026-11-04T08:00:02.500Z',
                durationMs: 2500,
                provider: 'kimi',
                model: 'moonshot-v1-8k',
                status: 'responded' as const,
                promptTokens: 180,
                completionTokens: 90,
                totalTokens: 270,
                responseId: 'chatcmpl-def456',
              },
              {
                id: 'call-1',
                calledAt: '2026-11-04T07:30:00.000Z',
                respondedAt: '2026-11-04T07:30:05.000Z',
                durationMs: 5000,
                provider: 'kimi',
                model: 'moonshot-v1-8k',
                status: 'failed' as const,
                promptTokens: null,
                completionTokens: null,
                totalTokens: null,
                responseId: null,
              },
            ],
          };
        }),
      };

      const service = new AdminService(mockDb as AdminDatabase);
      const result = await service.reportTokenCalls('rep-1', {
        start: '2026-10-06',
        end: '2026-11-04',
      });

      expect(result.reportId).toBe('rep-1');
      expect(result.items).toHaveLength(2);
      expect(result.items[0].status).toBe('responded');
      expect(result.items[0].durationMs).toBe(2500);
      expect(result.items[1].status).toBe('failed');
      expect(result.items[1].totalTokens).toBeNull();

      // 验证排障明细仅包含展示字段，排除提示词、密钥与原生错误响应
      const call = result.items[0] as Record<string, unknown>;
      expect(call.apiKey).toBeUndefined();
      expect(call.prompt).toBeUndefined();
      expect(call.messages).toBeUndefined();
      expect(call.rawResponse).toBeUndefined();
    });

    it('throws NotFoundException when report does not exist for call details', async () => {
      const mockDb: Partial<AdminDatabase> = {
        findReportTokenCalls: jest.fn(async () => null),
      };

      const service = new AdminService(mockDb as AdminDatabase);
      await expect(
        service.reportTokenCalls('non-existent-report', {
          start: '2026-10-06',
          end: '2026-11-04',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects invalid query parameters and date ranges according to dateRange rules', async () => {
      const service = new AdminService({} as AdminDatabase);

      await expect(
        service.reportTokenUsage({
          start: '2026-02-30', // 非法日期
          end: '2026-11-04',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.reportTokenUsage({
          start: '2026-11-04',
          end: '2026-10-01', // 开始晚于结束
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.reportTokenUsage({
          page: '-1', // 非法页码
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('calculates Beijing time UTC boundaries correctly across day boundaries', async () => {
      let capturedRange: {
        from: string;
        to: string;
        start: string;
        end: string;
      } | null = null;
      const mockDb: Partial<AdminDatabase> = {
        findReportTokenUsage: jest.fn(async (_q, range, page) => {
          capturedRange = range;
          return {
            total: 0,
            page: page.page,
            pageSize: page.pageSize,
            range: { start: range.start, end: range.end },
            summary: {
              totalReports: 0,
              totalCalls: 0,
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
              unknownCalls: 0,
            },
            items: [],
          };
        }),
      };

      const service = new AdminService(mockDb as AdminDatabase);
      await service.reportTokenUsage({
        start: '2026-11-04',
        end: '2026-11-04',
      });

      // 北京时间 2026-11-04 00:00:00+08:00 对应 UTC 2026-11-03 16:00:00
      // 结束为次日零点 2026-11-05 00:00:00+08:00 对应 UTC 2026-11-04 16:00:00
      expect(capturedRange).not.toBeNull();
      expect(capturedRange!.from).toBe('2026-11-03 16:00:00.000');
      expect(capturedRange!.to).toBe('2026-11-04 16:00:00.000');
    });
  });

  describe('Admin Controller & Guard permissions', () => {
    it('requires admin access and delegates to service', async () => {
      const mockService = {
        reportTokenUsage: jest.fn().mockResolvedValue({ total: 0, items: [] }),
        reportTokenCalls: jest
          .fn()
          .mockResolvedValue({ reportId: 'rep-1', items: [] }),
      };

      const controller = new AdminController(
        mockService as unknown as AdminService,
      );

      const q = { start: '2026-10-06', end: '2026-11-04' };
      await controller.reportTokenUsage(q);
      expect(mockService.reportTokenUsage).toHaveBeenCalledWith(q);

      await controller.reportTokenCalls('rep-1', q);
      expect(mockService.reportTokenCalls).toHaveBeenCalledWith('rep-1', q);
    });

    it('rejects unauthenticated requests via AdminAuthGuard', async () => {
      const reflector = new Reflector();
      const mockAuthService = {
        authenticate: jest
          .fn()
          .mockRejectedValue(new BadRequestException('未登录')),
      };
      const guard = new AdminAuthGuard(reflector, mockAuthService as never);

      const context = {
        getHandler: () => AdminController.prototype.reportTokenUsage,
        getClass: () => AdminController,
        switchToHttp: () => ({
          getRequest: () => ({
            method: 'GET',
            headers: {},
          }),
        }),
      } as never;

      await expect(guard.canActivate(context)).rejects.toThrow('未登录');
    });
  });
});
