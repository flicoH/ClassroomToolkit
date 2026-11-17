import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOtherAiCalls20261117000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS other_ai_calls (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      operation VARCHAR(32) NOT NULL,
      document_id VARCHAR(64) NULL,
      teacher_id VARCHAR(64) NULL,
      page_number INT UNSIGNED NULL,
      called_at DATETIME(6) NOT NULL,
      responded_at DATETIME(6) NOT NULL,
      status VARCHAR(24) NOT NULL,
      http_status SMALLINT UNSIGNED NULL,
      prompt_tokens INT UNSIGNED NULL,
      completion_tokens INT UNSIGNED NULL,
      total_tokens INT UNSIGNED NULL,
      INDEX idx_other_ai_calls_date (called_at, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }

  async down(): Promise<void> {
    // Preserve call history during app rollback.
  }
}
