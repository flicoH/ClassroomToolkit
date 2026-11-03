import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  const originalEncryptionKey = process.env.REPORT_AI_SETTINGS_ENCRYPTION_KEY;
  const originalBaseUrl = process.env.REPORT_AI_BASE_URL;
  const originalApiKey = process.env.REPORT_AI_API_KEY;
  const originalModel = process.env.REPORT_AI_MODEL;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalEncryptionKey === undefined)
      delete process.env.REPORT_AI_SETTINGS_ENCRYPTION_KEY;
    else process.env.REPORT_AI_SETTINGS_ENCRYPTION_KEY = originalEncryptionKey;
    for (const [name, value] of [
      ['REPORT_AI_BASE_URL', originalBaseUrl],
      ['REPORT_AI_API_KEY', originalApiKey],
      ['REPORT_AI_MODEL', originalModel],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  function reportAiDatabase() {
    let row: Record<string, unknown> | null = null;
    const repository = {
      manager: { getRepository: () => repository },
      findOne: jest.fn(async () => row),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        row = { ...value, updatedAt: new Date('2026-11-03T00:00:00Z') };
        return row;
      }),
      delete: jest.fn(async () => {
        row = null;
        return { affected: 1 };
      }),
    };
    return { reportAiSettings: () => repository, repository };
  }

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

  it('encrypts Admin-managed report AI credentials and returns only a mask', async () => {
    process.env.REPORT_AI_SETTINGS_ENCRYPTION_KEY = Buffer.alloc(
      32,
      7,
    ).toString('base64');
    const database = reportAiDatabase();
    const service = new AdminService(database as never);
    const result = await service.saveReportAiSettings({
      baseUrl: 'https://api.moonshot.cn/v1/',
      model: 'kimi-k2.6',
      apiKey: 'secret-report-key',
    });

    expect(result).toMatchObject({
      baseUrl: 'https://api.moonshot.cn/v1',
      model: 'kimi-k2.6',
      apiKeyMasked: 'secr••••-key',
      configured: true,
      source: 'database',
    });
    const saved = database.repository.save.mock.calls[0]![0];
    expect(saved.apiKeyCiphertext).not.toContain('secret-report-key');
  });

  it('rejects an AI service URL containing embedded credentials', async () => {
    process.env.REPORT_AI_SETTINGS_ENCRYPTION_KEY = Buffer.alloc(
      32,
      7,
    ).toString('base64');
    const service = new AdminService(reportAiDatabase() as never);
    await expect(
      service.saveReportAiSettings({
        baseUrl: 'https://user:password@example.com/v1',
        model: 'kimi-k2.6',
        apiKey: 'secret-report-key',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses the effective credential for the balance endpoint without exposing it', async () => {
    process.env.REPORT_AI_SETTINGS_ENCRYPTION_KEY = Buffer.alloc(
      32,
      7,
    ).toString('base64');
    const database = reportAiDatabase();
    const service = new AdminService(database as never);
    await service.saveReportAiSettings({
      baseUrl: 'https://api.moonshot.cn/v1',
      model: 'kimi-k2.6',
      apiKey: 'secret-report-key',
    });
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ available_balance: 8 }),
    } as Response);

    await expect(service.reportAiBalance()).resolves.toMatchObject({
      data: { available_balance: 8 },
      source: 'database',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.moonshot.cn/v1/users/me/balance',
      expect.objectContaining({
        headers: {
          authorization: 'Bearer secret-report-key',
          accept: 'application/json',
        },
      }),
    );
  });

  it('normalizes base URL missing /v1 to correctly request /v1/users/me/balance', async () => {
    process.env.REPORT_AI_SETTINGS_ENCRYPTION_KEY = Buffer.alloc(
      32,
      7,
    ).toString('base64');
    const database = reportAiDatabase();
    const service = new AdminService(database as never);
    await service.saveReportAiSettings({
      baseUrl: 'https://api.moonshot.cn',
      model: 'kimi-k2.6',
      apiKey: 'secret-report-key',
    });
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ available_balance: 10 }),
    } as Response);

    await expect(service.reportAiBalance()).resolves.toMatchObject({
      data: { available_balance: 10 },
      source: 'database',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.moonshot.cn/v1/users/me/balance',
      expect.anything(),
    );
  });

  it('falls back safely to .env when database AI configuration fails decryption', async () => {
    process.env.REPORT_AI_BASE_URL = 'https://api.example.test/v1';
    process.env.REPORT_AI_API_KEY = 'env-key-1234';
    process.env.REPORT_AI_MODEL = 'env-model';
    process.env.REPORT_AI_SETTINGS_ENCRYPTION_KEY = Buffer.alloc(
      32,
      7,
    ).toString('base64');
    const database = reportAiDatabase({
      id: 'default',
      baseUrl: 'https://api.moonshot.cn/v1',
      model: 'kimi-k2.6',
      apiKeyCiphertext: 'corrupted-ciphertext',
      updatedAt: new Date(),
    });
    const service = new AdminService(database as never);
    const result = await service.reportAiSettings();
    expect(result).toMatchObject({
      baseUrl: 'https://api.example.test/v1',
      model: 'env-model',
      apiKeyMasked: 'env-••••1234',
      configured: true,
      source: 'env',
    });
  });

  it('maps a failed balance request to a service error', async () => {
    process.env.REPORT_AI_BASE_URL = 'https://api.example.test/v1';
    process.env.REPORT_AI_API_KEY = 'env-key';
    process.env.REPORT_AI_MODEL = 'env-model';
    const service = new AdminService(reportAiDatabase() as never);
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network'));

    await expect(service.reportAiBalance()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('provides a descriptive guidance error when upstream balance returns HTTP 401', async () => {
    process.env.REPORT_AI_BASE_URL = 'https://api.example.test/v1';
    process.env.REPORT_AI_API_KEY = 'Bearer invalid-key';
    process.env.REPORT_AI_MODEL = 'env-model';
    const service = new AdminService(reportAiDatabase() as never);
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: {
          message: 'Invalid Authentication',
          code: 'invalid_authentication',
        },
      }),
    } as Response);

    await expect(service.reportAiBalance()).rejects.toThrow(
      '余额接口返回 HTTP 401 (Invalid Authentication)：认证失败，请检查 API Key 是否有效',
    );
  });
});
