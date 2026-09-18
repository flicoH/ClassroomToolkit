import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTeacherFeedback20260918000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
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

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE teacher_feedback');
  }
}
