import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTaskStatsCorrection20261116000001 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    if (!(await runner.hasColumn('task_stats_students', 'needs_correction'))) {
      await runner.query(
        'ALTER TABLE task_stats_students ADD COLUMN needs_correction TINYINT(1) NULL',
      );
    }
  }

  async down(): Promise<void> {
    // 保留教师已保存的待改正标记。
  }
}
