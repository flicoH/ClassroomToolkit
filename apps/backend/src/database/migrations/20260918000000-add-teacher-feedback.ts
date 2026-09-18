import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTeacherFeedback20260918000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    // CI 的 db:init 会先执行 schema.sql；表已由完整 schema 创建时只登记迁移，避免重复建表。
    if (await q.hasTable('teacher_feedback')) return;
    await q.query(`CREATE TABLE teacher_feedback (
      id varchar(64) PRIMARY KEY,
      teacher_id varchar(64) NOT NULL,
      content text NOT NULL,
      created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_teacher_feedback_created (created_at),
      INDEX idx_teacher_feedback_teacher (teacher_id, created_at),
      FOREIGN KEY (teacher_id) REFERENCES teacher_auth_teachers(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }

  async down(): Promise<void> {
    // 意见属于用户数据；即使误执行 migration:revert 也保留表和内容，避免生产数据丢失。
  }
}
