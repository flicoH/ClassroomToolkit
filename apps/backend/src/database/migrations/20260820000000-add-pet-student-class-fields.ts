import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPetStudentClassFields20260820000000 implements MigrationInterface {
  name = 'AddPetStudentClassFields20260820000000';

  async up(queryRunner: QueryRunner) {
    if (!(await queryRunner.hasTable('pet_points_students'))) return;

    if (!(await queryRunner.hasColumn('pet_points_students', 'class_id'))) {
      await queryRunner.query(
        "ALTER TABLE `pet_points_students` ADD COLUMN `class_id` VARCHAR(64) NOT NULL DEFAULT 'grade-1' COMMENT '班级ID'",
      );
    }

    if (!(await queryRunner.hasColumn('pet_points_students', 'class_name'))) {
      await queryRunner.query(
        "ALTER TABLE `pet_points_students` ADD COLUMN `class_name` VARCHAR(64) NOT NULL DEFAULT '一年级' COMMENT '班级名称'",
      );
    }
  }

  async down(queryRunner: QueryRunner) {
    if (!(await queryRunner.hasTable('pet_points_students'))) return;

    if (await queryRunner.hasColumn('pet_points_students', 'class_name')) {
      await queryRunner.query(
        'ALTER TABLE `pet_points_students` DROP COLUMN `class_name`',
      );
    }

    if (await queryRunner.hasColumn('pet_points_students', 'class_id')) {
      await queryRunner.query(
        'ALTER TABLE `pet_points_students` DROP COLUMN `class_id`',
      );
    }
  }
}
