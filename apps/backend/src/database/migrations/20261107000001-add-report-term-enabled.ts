import type { MigrationInterface, QueryRunner } from 'typeorm';

/** 仅新增学期停用标记，默认兼容已有学期；不删除或重算历史业务数据。 */
export class AddReportTermEnabled20261107000001 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    if (!(await runner.hasColumn('semester_report_terms', 'enabled'))) {
      await runner.query(
        'ALTER TABLE semester_report_terms ADD COLUMN enabled TINYINT(1) NOT NULL DEFAULT 1',
      );
    }
  }
  async down(): Promise<void> {
    // 保留停用状态，避免回滚结构时丢失教师设置。
  }
}
