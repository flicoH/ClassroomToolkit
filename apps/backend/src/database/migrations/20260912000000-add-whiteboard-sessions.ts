import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWhiteboardSessions20260912000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE whiteboard_teaching_sessions (
      id varchar(64) PRIMARY KEY,
      teacher_id varchar(64) NOT NULL,
      document_id varchar(64) NOT NULL,
      pages longtext NOT NULL,
      started_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      ended_at datetime(3) NULL,
      INDEX idx_whiteboard_session_document (teacher_id, document_id, started_at),
      CONSTRAINT fk_whiteboard_session_document FOREIGN KEY (document_id)
        REFERENCES whiteboard_documents(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE whiteboard_teaching_sessions');
  }
}
