import type { QueryRunner } from 'typeorm';
import { AddTaskStatsItems20261116000000 } from './migrations/20261116000000-add-task-stats-items';

it('adds nullable columns without rewriting data and preserves them on rollback', async () => {
  const runner = {
    hasColumn: jest
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true),
    query: jest.fn(),
  };
  const migration = new AddTaskStatsItems20261116000000();
  await migration.up(runner as unknown as QueryRunner);
  await migration.up(runner as unknown as QueryRunner);
  await migration.down();
  expect(runner.query.mock.calls).toEqual([
    ['ALTER TABLE task_stats_tasks ADD COLUMN items JSON NULL'],
    ['ALTER TABLE task_stats_students ADD COLUMN checked_item_ids JSON NULL'],
  ]);
});
