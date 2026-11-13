import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Preserve the provider response separately from editable report content. */
export class AddReportAiResponse20261103000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('semester_reports', 'ai_response'))) {
      await queryRunner.query(
        'ALTER TABLE `semester_reports` ADD COLUMN `ai_response` JSON NULL AFTER `content`',
      );
    }
  }

  async down(): Promise<void> {
    // Keep raw AI evidence on rollback; older application versions ignore it.
  }
}
