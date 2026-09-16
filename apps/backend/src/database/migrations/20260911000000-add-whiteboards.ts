import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWhiteboards20260911000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE whiteboard_documents (
      id varchar(64) PRIMARY KEY,
      teacher_id varchar(64) NOT NULL,
      title varchar(128) NOT NULL,
      pages longtext NOT NULL,
      created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX idx_whiteboard_teacher_updated (teacher_id, updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE whiteboard_documents');
  }
}
