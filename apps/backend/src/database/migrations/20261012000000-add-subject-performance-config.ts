import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubjectPerformanceConfig20261012000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    if (
      !(await queryRunner.hasColumn(
        'semester_report_subjects',
        'performance_config',
      ))
    ) {
      await queryRunner.query(
        'ALTER TABLE `semester_report_subjects` ADD COLUMN `performance_config` JSON NULL',
      );
    }
  }
  async down(): Promise<void> {
    // Keep teacher-authored configuration when reverting code; old versions ignore this nullable column.
  }
}
