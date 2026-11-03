import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdminReportAiSettings20261103010000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS admin_report_ai_settings (
      id VARCHAR(32) NOT NULL PRIMARY KEY,
      base_url VARCHAR(500) NOT NULL,
      model VARCHAR(100) NOT NULL,
      api_key_ciphertext TEXT NOT NULL,
      updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
  async down(): Promise<void> {
    // Retain encrypted credentials on rollback; older versions ignore this table.
  }
}
