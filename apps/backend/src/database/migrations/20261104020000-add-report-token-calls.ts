import type { MigrationInterface, QueryRunner } from 'typeorm';
import { extractCallFromAiResponse } from '../scripts/extract-token-call';

/**
 * 创建学期/阶段总结报告大模型调用的独立流水表，并在上线执行迁移时
 * 自动将已落库的历史 AI 报告 (semester_reports.ai_response) 提取并回填至 Token 追踪表。
 */
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

    if (await queryRunner.hasTable('semester_reports')) {
      const reports = (await queryRunner.query(
        "SELECT id, teacher_id, student_id, ai_response, created_at, updated_at FROM semester_reports WHERE ai_response IS NOT NULL AND status != 'deleted' ORDER BY created_at ASC",
      )) as Array<{
        id: string;
        teacher_id: string;
        student_id: string;
        ai_response: unknown;
        created_at: Date | string;
        updated_at?: Date | string | null;
      }>;

      if (reports && reports.length > 0) {
        const existingCalls = (await queryRunner.query(
          'SELECT DISTINCT report_id FROM semester_report_token_calls',
        )) as Array<{ report_id: string }>;
        const existingReportIds = new Set(
          existingCalls.map((c) => c.report_id),
        );

        for (const report of reports) {
          if (existingReportIds.has(report.id)) {
            continue;
          }

          const createdAt =
            report.created_at instanceof Date
              ? report.created_at
              : new Date(report.created_at);
          const updatedAt = report.updated_at
            ? report.updated_at instanceof Date
              ? report.updated_at
              : new Date(report.updated_at)
            : null;

          const extracted = extractCallFromAiResponse(
            report.ai_response,
            createdAt,
            updatedAt,
          );
          if (!extracted) {
            continue;
          }

          const callId = `hist-${report.id}`.slice(0, 64);
          await queryRunner.query(
            `INSERT IGNORE INTO semester_report_token_calls (
              id, report_id, teacher_id, student_id, provider, model,
              called_at, responded_at, prompt_tokens, completion_tokens,
              total_tokens, status, response_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              callId,
              report.id,
              report.teacher_id,
              report.student_id,
              extracted.provider,
              extracted.model,
              extracted.calledAt,
              extracted.respondedAt,
              extracted.promptTokens,
              extracted.completionTokens,
              extracted.totalTokens,
              extracted.status,
              extracted.responseId,
              extracted.calledAt,
              extracted.respondedAt,
            ],
          );
        }
      }
    }
  }

  async down(): Promise<void> {
    // 保留调用流水表，避免回滚应用版本时丢失已采集的审计与排障记录。
  }
}
