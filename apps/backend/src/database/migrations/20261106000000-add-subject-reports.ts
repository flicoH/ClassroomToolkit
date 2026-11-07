import type { MigrationInterface, QueryRunner } from 'typeorm';

const statements = [
  `CREATE TABLE IF NOT EXISTS subject_reports (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    teacher_id VARCHAR(64) NOT NULL,
    term_id VARCHAR(64) NOT NULL,
    subject_id VARCHAR(64) NOT NULL,
    student_id VARCHAR(64) NOT NULL,
    student_name VARCHAR(100) NOT NULL,
    class_name VARCHAR(100) NOT NULL,
    period_type VARCHAR(16) NOT NULL,
    period_start DATETIME NOT NULL,
    period_end DATETIME NOT NULL,
    score_scope VARCHAR(16) NOT NULL DEFAULT 'overall',
    snapshot JSON NULL,
    content JSON NULL,
    ai_response JSON NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'queued',
    keywords TEXT NULL,
    teacher_observation TEXT NULL,
    course_scope TEXT NULL,
    error_message VARCHAR(500) NULL,
    published_at DATETIME NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    INDEX idx_sub_reports_teacher_period (teacher_id, period_start, period_type),
    INDEX idx_sub_reports_student (teacher_id, student_id, subject_id, period_start),
    INDEX idx_sub_reports_status (status, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS subject_report_shares (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    teacher_id VARCHAR(64) NOT NULL,
    report_id VARCHAR(64) NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    token_ciphertext TEXT NOT NULL,
    expires_at DATETIME NULL,
    revoked_at DATETIME NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    INDEX idx_sub_share_report (teacher_id, report_id, revoked_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS subject_report_events (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    teacher_id VARCHAR(64) NOT NULL,
    report_id VARCHAR(64) NULL,
    document_id VARCHAR(64) NULL,
    action VARCHAR(40) NOT NULL,
    details JSON NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    INDEX idx_sub_events_report (teacher_id, report_id, created_at),
    INDEX idx_sub_events_doc (teacher_id, document_id, created_at),
    INDEX idx_sub_events_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS subject_report_token_calls (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    report_id VARCHAR(64) NOT NULL,
    teacher_id VARCHAR(64) NOT NULL,
    student_id VARCHAR(64) NOT NULL,
    provider VARCHAR(32) NOT NULL DEFAULT 'kimi',
    model VARCHAR(64) NOT NULL,
    called_at DATETIME(6) NOT NULL,
    responded_at DATETIME(6) NULL,
    prompt_tokens INT NULL,
    completion_tokens INT NULL,
    total_tokens INT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'in_progress',
    response_id VARCHAR(128) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    INDEX idx_srtc_sub_called_at (called_at),
    INDEX idx_srtc_sub_report_called (report_id, called_at),
    INDEX idx_srtc_sub_student_called (student_id, called_at),
    INDEX idx_srtc_sub_teacher (teacher_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS subject_report_subjects (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    teacher_id VARCHAR(64) NOT NULL,
    name VARCHAR(100) NOT NULL,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    performance_config JSON NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    INDEX idx_srs_teacher (teacher_id, enabled, name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

export class AddSubjectReports20261106000000 implements MigrationInterface {
  name = 'AddSubjectReports20261106000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const sql of statements) {
      await queryRunner.query(sql);
    }
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // 保留学科报告历史数据，避免应用回滚误删学生隐私数据
  }
}
