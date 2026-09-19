import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPetLevelSettings20260919000000 implements MigrationInterface {
  name = 'AddPetLevelSettings20260919000000';

  async up(queryRunner: QueryRunner) {
    await queryRunner.query(
      'CREATE TABLE IF NOT EXISTS `pet_points_settings` (`teacher_id` VARCHAR(64) PRIMARY KEY, `max_level` INT NOT NULL DEFAULT 10) ENGINE=InnoDB',
    );
    await queryRunner.query(
      "ALTER TABLE `pet_points_students` MODIFY COLUMN `stage` VARCHAR(32) NOT NULL DEFAULT '初始形态'",
    );
  }

  async down(queryRunner: QueryRunner) {
    await queryRunner.query('DROP TABLE IF EXISTS `pet_points_settings`');
    // Existing stage values may include ten-form names, so keep the widened column.
  }
}
