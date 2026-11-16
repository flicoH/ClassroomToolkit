import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTaskStatsItems20261116000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    if (!(await runner.hasColumn('task_stats_tasks', 'items'))) {
      await runner.query(
        'ALTER TABLE task_stats_tasks ADD COLUMN items JSON NULL',
      );
    }
    if (!(await runner.hasColumn('task_stats_students', 'checked_item_ids'))) {
      await runner.query(
        'ALTER TABLE task_stats_students ADD COLUMN checked_item_ids JSON NULL',
      );
    }
  }

  async down(): Promise<void> {
    // 回滚应用时保留教师已录入的子项与勾选数据。
  }
}
