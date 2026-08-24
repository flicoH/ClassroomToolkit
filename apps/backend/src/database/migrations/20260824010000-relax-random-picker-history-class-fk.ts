import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RelaxRandomPickerHistoryClassFk20260824010000 implements MigrationInterface {
  name = 'RelaxRandomPickerHistoryClassFk20260824010000';

  async up(queryRunner: QueryRunner) {
    if (!(await queryRunner.hasTable('random_picker_histories'))) return;

    const constraints = (await queryRunner.query(
      `
        SELECT CONSTRAINT_NAME AS constraint_name
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'random_picker_histories'
          AND COLUMN_NAME = 'class_id'
          AND REFERENCED_TABLE_NAME = 'random_picker_classes'
      `,
    )) as Array<{ constraint_name: string }>;

    for (const constraint of constraints) {
      await queryRunner.query(
        `ALTER TABLE \`random_picker_histories\` DROP FOREIGN KEY \`${constraint.constraint_name}\``,
      );
    }
  }

  async down() {
    // No-op: histories now reference student-management classrooms by id.
  }
}
