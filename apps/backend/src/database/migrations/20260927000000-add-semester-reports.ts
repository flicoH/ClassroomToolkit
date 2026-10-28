import type { MigrationInterface, QueryRunner } from 'typeorm';

const statements = [
  `CREATE TABLE IF NOT EXISTS semester_report_terms (
    id VARCHAR(64) NOT NULL PRIMARY KEY, teacher_id VARCHAR(64) NOT NULL,
    name VARCHAR(100) NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    INDEX idx_sr_terms_teacher (teacher_id, start_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS semester_report_subjects (
    id VARCHAR(64) NOT NULL PRIMARY KEY, teacher_id VARCHAR(64) NOT NULL,
    name VARCHAR(100) NOT NULL, enabled TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    INDEX idx_sr_subjects_teacher (teacher_id, enabled)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS semester_report_documents (
    id VARCHAR(64) NOT NULL PRIMARY KEY, teacher_id VARCHAR(64) NOT NULL,
    term_id VARCHAR(64) NOT NULL, subject_id VARCHAR(64) NOT NULL,
    class_id VARCHAR(64) NOT NULL DEFAULT '*', file_name VARCHAR(255) NOT NULL,
    file_hash CHAR(64) NOT NULL, storage_path VARCHAR(500) NULL, content_text LONGTEXT NULL, source_pages JSON NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'uploaded', error_message VARCHAR(500) NULL,
    confirmed_units JSON NULL, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    INDEX idx_sr_docs_scope (teacher_id, term_id, subject_id, class_id, status),
    INDEX idx_sr_docs_hash (teacher_id, file_hash)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS semester_reports (
    id VARCHAR(64) NOT NULL PRIMARY KEY, teacher_id VARCHAR(64) NOT NULL,
    term_id VARCHAR(64) NOT NULL, subject_id VARCHAR(64) NOT NULL,
    student_id VARCHAR(64) NOT NULL, student_name VARCHAR(100) NOT NULL,
    class_name VARCHAR(100) NOT NULL, period_type VARCHAR(16) NOT NULL,
    period_start DATETIME NOT NULL, period_end DATETIME NOT NULL,
    score_scope VARCHAR(16) NOT NULL DEFAULT 'overall', snapshot JSON NULL,
    content JSON NULL, status VARCHAR(24) NOT NULL DEFAULT 'queued', keywords TEXT NULL,
    teacher_observation TEXT NULL, course_scope TEXT NULL, error_message VARCHAR(500) NULL,
    published_at DATETIME NULL, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    INDEX idx_sr_reports_teacher_period (teacher_id, period_start, period_type),
    INDEX idx_sr_reports_student (teacher_id, student_id, subject_id, period_start),
    INDEX idx_sr_reports_status (status, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS semester_report_shares (
    id VARCHAR(64) NOT NULL PRIMARY KEY, teacher_id VARCHAR(64) NOT NULL,
    report_id VARCHAR(64) NOT NULL, token_hash CHAR(64) NOT NULL UNIQUE,
    token_ciphertext TEXT NOT NULL, expires_at DATETIME NULL, revoked_at DATETIME NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    INDEX idx_sr_share_report (teacher_id, report_id, revoked_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS semester_report_events (
    id VARCHAR(64) NOT NULL PRIMARY KEY, teacher_id VARCHAR(64) NOT NULL,
    report_id VARCHAR(64) NULL, document_id VARCHAR(64) NULL,
    action VARCHAR(40) NOT NULL, details JSON NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    INDEX idx_sr_events_report (teacher_id, report_id, created_at),
    INDEX idx_sr_events_doc (teacher_id, document_id, created_at),
    INDEX idx_sr_events_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

export class AddSemesterReports20260927000000 implements MigrationInterface {
  name = 'AddSemesterReports20260927000000';

  async up(queryRunner: QueryRunner) {
    for (const sql of statements) await queryRunner.query(sql);
    if (
      !(await queryRunner.hasColumn(
        'semester_report_documents',
        'source_pages',
      ))
    ) {
      await queryRunner.query(
        'ALTER TABLE semester_report_documents ADD COLUMN source_pages JSON NULL AFTER content_text',
      );
    }
    if (await queryRunner.hasTable('pet_points_evaluation_records')) {
      if (
        !(await queryRunner.hasColumn(
          'pet_points_evaluation_records',
          'subject_id',
        ))
      ) {
        await queryRunner.query(
          'ALTER TABLE pet_points_evaluation_records ADD COLUMN subject_id VARCHAR(64) NULL',
        );
      }
    }
  }

  async down(queryRunner: QueryRunner) {
    // Published student reports contain private data. Keep the tables on rollback;
    // removing them requires an explicit retention decision and verified backup.
    if (
      (await queryRunner.hasTable('pet_points_evaluation_records')) &&
      (await queryRunner.hasColumn(
        'pet_points_evaluation_records',
        'subject_id',
      ))
    ) {
      await queryRunner.query(
        'ALTER TABLE pet_points_evaluation_records DROP COLUMN subject_id',
      );
    }
  }
}
