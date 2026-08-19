import type { MigrationInterface, QueryRunner } from 'typeorm';

const businessTables = [
  'student_classrooms',
  'student_groups',
  'student_students',
  'task_stats_tasks',
  'task_stats_students',
  'seating_chart_charts',
  'seating_chart_students',
  'seating_chart_seats',
  'random_picker_classes',
  'random_picker_students',
  'random_picker_histories',
  'random_picker_history_students',
  'countdown_states',
  'sticky_notes_notes',
  'pet_points_students',
  'pet_points_rubrics',
  'pet_points_rewards',
  'pet_points_evaluation_records',
  'pet_points_redemptions',
  'gacha_machine_rewards',
  'gacha_machine_draw_records',
] as const;

export class AddTeacherDataIsolation20260819000000 implements MigrationInterface {
  name = 'AddTeacherDataIsolation20260819000000';

  async up(queryRunner: QueryRunner) {
    const preferredUsername = process.env.LEGACY_DATA_OWNER_USERNAME;
    const preferredRows = preferredUsername
      ? ((await queryRunner.query(
          'SELECT id FROM teacher_auth_teachers WHERE username = ? LIMIT 1',
          [preferredUsername],
        )) as Array<{ id: string }>)
      : [];
    const fallbackRows = (await queryRunner.query(
      'SELECT id FROM teacher_auth_teachers ORDER BY created_at ASC LIMIT 1',
    )) as Array<{ id: string }>;
    const legacyOwnerId = preferredRows[0]?.id ?? fallbackRows[0]?.id;

    for (const table of businessTables) {
      if (!(await queryRunner.hasTable(table))) continue;
      if (!(await queryRunner.hasColumn(table, 'teacher_id'))) {
        await queryRunner.query(
          `ALTER TABLE \`${table}\` ADD COLUMN teacher_id VARCHAR(64) NULL`,
        );
        if (legacyOwnerId) {
          await queryRunner.query(
            `UPDATE \`${table}\` SET teacher_id = ? WHERE teacher_id IS NULL`,
            [legacyOwnerId],
          );
        }
        const rows = (await queryRunner.query(
          `SELECT COUNT(*) AS row_count FROM \`${table}\` WHERE teacher_id IS NULL`,
        )) as Array<{ row_count: string | number }>;
        const rowCount = rows[0]?.row_count ?? 0;
        if (Number(rowCount) > 0) {
          throw new Error(
            `无法迁移 ${table}：存在业务数据，但数据库中没有可归属的教师账号`,
          );
        }
        await queryRunner.query(
          `ALTER TABLE \`${table}\` MODIFY teacher_id VARCHAR(64) NOT NULL`,
        );
      }
      const indexName = `idx_${table}_teacher`;
      const metadata = await queryRunner.getTable(table);
      if (!metadata?.indices.some((index) => index.name === indexName)) {
        await queryRunner.query(
          `CREATE INDEX \`${indexName}\` ON \`${table}\` (teacher_id)`,
        );
      }
    }

    if (await queryRunner.hasTable('countdown_states')) {
      await queryRunner.query(
        "UPDATE countdown_states SET id = teacher_id WHERE id = 'default' AND teacher_id IS NOT NULL",
      );
    }
  }

  async down(queryRunner: QueryRunner) {
    for (const table of [...businessTables].reverse()) {
      if (
        !(await queryRunner.hasTable(table)) ||
        !(await queryRunner.hasColumn(table, 'teacher_id'))
      )
        continue;
      await queryRunner.query(
        `DROP INDEX \`idx_${table}_teacher\` ON \`${table}\``,
      );
      await queryRunner.query(
        `ALTER TABLE \`${table}\` DROP COLUMN teacher_id`,
      );
    }
  }
}
