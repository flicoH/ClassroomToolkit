import { AddReportTokenCalls20261104020000 } from './20261104020000-add-report-token-calls';
import type { QueryRunner } from 'typeorm';

describe('report token calls migration', () => {
  it('creates the semester_report_token_calls table with required indexes', async () => {
    const runner = {
      query: jest.fn().mockResolvedValue([]),
      hasTable: jest.fn().mockResolvedValue(false),
    } as unknown as QueryRunner;

    await new AddReportTokenCalls20261104020000().up(runner);

    expect(runner.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'CREATE TABLE IF NOT EXISTS semester_report_token_calls',
      ),
    );
    expect(runner.query).toHaveBeenCalledWith(
      expect.stringContaining('INDEX idx_srtc_called_at'),
    );
    expect(runner.query).toHaveBeenCalledWith(
      expect.stringContaining('INDEX idx_srtc_report_called'),
    );
    expect(runner.query).toHaveBeenCalledWith(
      expect.stringContaining('INDEX idx_srtc_student_called'),
    );
    expect(runner.query).toHaveBeenCalledWith(
      expect.stringContaining('INDEX idx_srtc_teacher'),
    );
  });

  it('automatically backfills historical ai_response reports using cursor pagination without filesort', async () => {
    const historicalReports = [
      {
        id: 'rep-hist-1',
        teacher_id: 'teacher-1',
        student_id: 'student-1',
        ai_response: JSON.stringify({
          id: 'chatcmpl-hist-1',
          model: 'moonshot-v1-8k',
          created: 1730000000,
          usage: {
            prompt_tokens: 120,
            completion_tokens: 60,
            total_tokens: 180,
          },
        }),
        created_at: new Date('2026-10-25T10:00:00Z'),
        updated_at: new Date('2026-10-25T10:00:03Z'),
      },
      {
        id: 'rep-hist-already-tracked',
        teacher_id: 'teacher-1',
        student_id: 'student-2',
        ai_response: {
          id: 'chatcmpl-tracked',
          model: 'moonshot-v1-8k',
          usage: {
            prompt_tokens: 200,
            completion_tokens: 100,
            total_tokens: 300,
          },
        },
        created_at: '2026-10-26T10:00:00Z',
        updated_at: null,
      },
      {
        id: 'rep-hist-invalid',
        teacher_id: 'teacher-1',
        student_id: 'student-3',
        ai_response: 'not-valid-json',
        created_at: new Date('2026-10-27T10:00:00Z'),
        updated_at: null,
      },
    ];

    let batchCount = 0;
    const mockQuery = jest
      .fn()
      .mockImplementation((sql: string, params?: unknown[]) => {
        if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
          return Promise.resolve(undefined);
        }
        if (sql.includes('SELECT DISTINCT report_id')) {
          return Promise.resolve([{ report_id: 'rep-hist-already-tracked' }]);
        }
        if (sql.includes('SELECT id, teacher_id, student_id, ai_response')) {
          batchCount++;
          // 验证查询使用了主键游标和排序，避免对大 JSON 列执行 filesort
          expect(sql).toContain('ORDER BY id ASC');
          expect(sql).toContain('id > ?');
          expect(sql).not.toContain('ORDER BY created_at');
          if (params && params[0] === '') {
            return Promise.resolve(historicalReports);
          }
          return Promise.resolve([]);
        }
        if (sql.includes('INSERT IGNORE INTO semester_report_token_calls')) {
          return Promise.resolve({ affectedRows: 1 });
        }
        return Promise.resolve([]);
      });

    const runner = {
      query: mockQuery,
      hasTable: jest.fn().mockImplementation((table: string) => {
        return Promise.resolve(table === 'semester_reports');
      }),
    } as unknown as QueryRunner;

    await new AddReportTokenCalls20261104020000().up(runner);

    expect(batchCount).toBe(2);

    // rep-hist-1 应被成功写入
    const insertCalls = mockQuery.mock.calls.filter(
      (c: unknown[]) =>
        typeof c[0] === 'string' &&
        c[0].includes('INSERT IGNORE INTO semester_report_token_calls'),
    );
    expect(insertCalls).toHaveLength(1);

    const [sql, params] = insertCalls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT IGNORE INTO semester_report_token_calls');
    expect(params[0]).toBe('hist-rep-hist-1');
    expect(params[1]).toBe('rep-hist-1');
    expect(params[2]).toBe('teacher-1');
    expect(params[3]).toBe('student-1');
    expect(params[4]).toBe('moonshot');
    expect(params[5]).toBe('moonshot-v1-8k');
    expect(params[8]).toBe(120);
    expect(params[9]).toBe(60);
    expect(params[10]).toBe(180);
    expect(params[11]).toBe('responded');
    expect(params[12]).toBe('chatcmpl-hist-1');

    // 已追踪的 rep-hist-already-tracked 不应再次插入
    const trackedInsert = insertCalls.find(
      (c: unknown[]) =>
        ((c[1] as unknown[])[1] as string) === 'rep-hist-already-tracked',
    );
    expect(trackedInsert).toBeUndefined();
  });

  it('keeps existing call audit table during rollback', async () => {
    const runner = {
      query: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;

    await new AddReportTokenCalls20261104020000().down(runner);

    expect(runner.query).not.toHaveBeenCalled();
  });
});
