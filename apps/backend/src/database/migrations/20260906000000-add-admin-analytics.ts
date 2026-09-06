import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdminAnalytics20260906000000 implements MigrationInterface {
  /** 增量新增管理账号、会话和统计表；不迁移或覆盖现有教师与学生业务数据。 */
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE admin_accounts (
      id varchar(64) PRIMARY KEY, username varchar(64) NOT NULL UNIQUE,
      password_hash varchar(256) NOT NULL, salt varchar(64) NOT NULL,
      created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await q.query(`CREATE TABLE admin_sessions (
      token_hash varchar(64) PRIMARY KEY, admin_id varchar(64) NOT NULL,
      expires_at datetime(3) NOT NULL,
      INDEX idx_admin_session_expiry (expires_at),
      FOREIGN KEY (admin_id) REFERENCES admin_accounts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await q.query(`CREATE TABLE analytics_events (
      id varchar(64) PRIMARY KEY, teacher_id varchar(64) NULL,
      kind varchar(32) NOT NULL, feature varchar(32) NULL, action varchar(64) NULL,
      dedupe_key varchar(64) NOT NULL UNIQUE,
      created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_analytics_time (created_at, kind),
      INDEX idx_analytics_teacher (teacher_id, created_at),
      INDEX idx_analytics_feature (feature, kind, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await q.query(`CREATE TABLE analytics_settings (
      id tinyint PRIMARY KEY, started_at datetime(3) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await q.query(
      'INSERT INTO analytics_settings VALUES (1, UTC_TIMESTAMP(3))',
    );
  }
  /** 回滚会删除新增管理身份及全部统计历史，仅适用于明确需要撤销此迁移的场景。 */
  async down(q: QueryRunner): Promise<void> {
    for (const table of [
      'analytics_settings',
      'analytics_events',
      'admin_sessions',
      'admin_accounts',
    ]) {
      await q.query(`DROP TABLE ${table}`);
    }
  }
}
