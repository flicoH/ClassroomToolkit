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

  it.each([false, true])(
    'only creates schema when historical reports exist: %s',
    async (hasReports) => {
      const query = jest.fn().mockImplementation((sql: string) => {
        if (!sql.startsWith('CREATE TABLE IF NOT EXISTS')) {
          throw new Error(
            'Deployment must not read or backfill historical reports',
          );
        }
        return Promise.resolve([]);
      });
      const runner = {
        query,
        hasTable: jest.fn().mockResolvedValue(hasReports),
      } as unknown as QueryRunner;

      await new AddReportTokenCalls20261104020000().up(runner);

      expect(query).toHaveBeenCalledTimes(1);
      expect(runner.hasTable).not.toHaveBeenCalled();
    },
  );

  it('propagates schema creation failures', async () => {
    const runner = {
      query: jest.fn().mockRejectedValue(new Error('CREATE denied')),
    } as unknown as QueryRunner;
    await expect(
      new AddReportTokenCalls20261104020000().up(runner),
    ).rejects.toThrow('CREATE denied');
  });

  it('keeps existing call audit table during rollback', async () => {
    const runner = {
      query: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;

    await new AddReportTokenCalls20261104020000().down(runner);

    expect(runner.query).not.toHaveBeenCalled();
  });
});
