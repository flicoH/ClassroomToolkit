import type { QueryRunner } from 'typeorm';
import { AddSubjectPerformanceConfig20261012000000 } from './migrations/20261012000000-add-subject-performance-config';

it('adds the nullable configuration once and preserves teacher data on rollback', async () => {
  const query = jest.fn();
  const hasColumn = jest.fn().mockResolvedValue(false);
  const runner = { query, hasColumn } as unknown as QueryRunner;
  const migration = new AddSubjectPerformanceConfig20261012000000();
  await migration.up(runner);
  expect(query).toHaveBeenCalledWith(expect.stringContaining('JSON NULL'));
  hasColumn.mockResolvedValue(true);
  await migration.up(runner);
  await migration.down();
  expect(query).toHaveBeenCalledTimes(1);
});
