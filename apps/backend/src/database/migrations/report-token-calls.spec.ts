import { AddReportTokenCalls20261104020000 } from './20261104020000-add-report-token-calls';
import type { QueryRunner } from 'typeorm';

describe('report token calls migration', () => {
  it('creates the semester_report_token_calls table with required indexes', async () => {
    const runner = {
      query: jest.fn().mockResolvedValue(undefined),
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

  it('keeps existing call audit table during rollback', async () => {
    const runner = {
      query: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;

    await new AddReportTokenCalls20261104020000().down(runner);

    expect(runner.query).not.toHaveBeenCalled();
  });
});
