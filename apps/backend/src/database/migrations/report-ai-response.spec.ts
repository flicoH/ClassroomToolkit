import { AddReportAiResponse20261103000000 } from './20261103000000-add-report-ai-response';
import type { QueryRunner } from 'typeorm';

describe('report AI response migration', () => {
  it('adds the nullable JSON archive column once', async () => {
    const runner = {
      hasColumn: jest.fn().mockResolvedValue(false),
      query: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;

    await new AddReportAiResponse20261103000000().up(runner);

    expect(runner.query).toHaveBeenCalledWith(
      expect.stringContaining('`ai_response` JSON NULL'),
    );
  });
});
