import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccountManagement20261012010000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    const columns: Array<[string, string, string]> = [
      ['teacher_auth_teachers', 'parent_account_id', 'VARCHAR(64) NULL'],
      [
        'teacher_auth_teachers',
        'status',
        "VARCHAR(16) NOT NULL DEFAULT 'active'",
      ],
      ['teacher_auth_teachers', 'deleted_at', 'DATETIME NULL'],
      ['teacher_auth_teachers', 'session_version', 'INT NOT NULL DEFAULT 0'],
      ['semester_report_events', 'actor_account_id', 'VARCHAR(64) NULL'],
      ['semester_report_events', 'actor_name_snapshot', 'VARCHAR(64) NULL'],
      [
        'semester_report_events',
        'actor_type',
        "VARCHAR(16) NOT NULL DEFAULT 'unknown'",
      ],
      ['analytics_events', 'owner_account_id', 'VARCHAR(64) NULL'],
      ['analytics_events', 'report_version', 'VARCHAR(8) NULL'],
    ];
    for (const [table, column, definition] of columns) {
      if (!(await runner.hasColumn(table, column)))
        await runner.query(
          `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`,
        );
    }
    for (const [table, name, fields] of [
      [
        'teacher_auth_teachers',
        'idx_account_parent',
        'parent_account_id, status',
      ],
      [
        'semester_report_events',
        'idx_report_actor_time',
        'actor_account_id, created_at',
      ],
      [
        'analytics_events',
        'idx_analytics_owner_time',
        'owner_account_id, created_at',
      ],
    ]) {
      const existing = await runner.query(
        'SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
        [table, name],
      );
      if (!existing.length)
        await runner.query(
          `CREATE INDEX \`${name}\` ON \`${table}\` (${fields})`,
        );
    }
    await runner.query(`CREATE TABLE IF NOT EXISTS account_management_audit (
      id VARCHAR(64) PRIMARY KEY, owner_account_id VARCHAR(64) NOT NULL,
      actor_account_id VARCHAR(64) NOT NULL, target_account_id VARCHAR(64) NOT NULL,
      action VARCHAR(32) NOT NULL, created_at DATETIME(3) NOT NULL,
      INDEX idx_account_audit_owner (owner_account_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    // 历史统计记录已知账号归属；历史报告未采集编辑人，不伪造姓名。
    await runner.query(
      'UPDATE analytics_events e JOIN teacher_auth_teachers t ON t.id = e.teacher_id SET e.owner_account_id = COALESCE(t.parent_account_id, t.id) WHERE e.owner_account_id IS NULL',
    );
  }
  async down(): Promise<void> {
    // 回退需关闭子账号并撤销会话；保留列、账号与审计数据，禁止删除业务历史。
  }
}
