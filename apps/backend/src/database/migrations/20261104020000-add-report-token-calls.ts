import type { MigrationInterface, QueryRunner } from 'typeorm';

/** 仅创建调用流水表；历史报告回填必须独立执行，避免部署改写业务数据或长时间扫描。 */
export class AddReportTokenCalls20261104020000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS semester_report_token_calls (
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
      INDEX idx_srtc_called_at (called_at),
      INDEX idx_srtc_report_called (report_id, called_at),
      INDEX idx_srtc_student_called (student_id, called_at),
      INDEX idx_srtc_teacher (teacher_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }

  async down(): Promise<void> {
    // 保留调用流水表，避免回滚应用版本时丢失已采集的审计与排障记录。
  }
}
