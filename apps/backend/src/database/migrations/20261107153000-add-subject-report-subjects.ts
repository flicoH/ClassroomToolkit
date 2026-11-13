import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubjectReportSubjects20261107153000 implements MigrationInterface {
  name = 'AddSubjectReportSubjects20261107153000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS subject_report_subjects (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        teacher_id VARCHAR(64) NOT NULL,
        name VARCHAR(100) NOT NULL,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        performance_config JSON NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX idx_srs_teacher (teacher_id, enabled, name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // 保留学科设置历史数据，避免应用回滚误删配置
  }
}
