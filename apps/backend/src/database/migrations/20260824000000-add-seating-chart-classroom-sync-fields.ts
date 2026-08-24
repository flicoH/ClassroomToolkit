import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSeatingChartClassroomSyncFields20260824000000 implements MigrationInterface {
  name = 'AddSeatingChartClassroomSyncFields20260824000000';

  async up(queryRunner: QueryRunner) {
    if (await queryRunner.hasTable('seating_chart_charts')) {
      if (!(await queryRunner.hasColumn('seating_chart_charts', 'class_id'))) {
        await queryRunner.query(
          'ALTER TABLE `seating_chart_charts` ADD COLUMN `class_id` VARCHAR(64) NULL AFTER `class_name`',
        );
      }
      const chartsTable = await queryRunner.getTable('seating_chart_charts');
      if (
        !chartsTable?.indices.some(
          (index) => index.name === 'idx_seating_chart_charts_teacher_class',
        )
      ) {
        await queryRunner.query(
          'CREATE INDEX `idx_seating_chart_charts_teacher_class` ON `seating_chart_charts` (`teacher_id`, `class_id`)',
        );
      }
    }

    if (
      (await queryRunner.hasTable('seating_chart_students')) &&
      !(await queryRunner.hasColumn(
        'seating_chart_students',
        'source_student_id',
      ))
    ) {
      await queryRunner.query(
        'ALTER TABLE `seating_chart_students` ADD COLUMN `source_student_id` VARCHAR(64) NULL AFTER `chart_id`',
      );
      await queryRunner.query(
        'UPDATE `seating_chart_students` SET `source_student_id` = `student_no` WHERE `source_student_id` IS NULL',
      );
    }
  }

  async down(queryRunner: QueryRunner) {
    if (
      (await queryRunner.hasTable('seating_chart_students')) &&
      (await queryRunner.hasColumn(
        'seating_chart_students',
        'source_student_id',
      ))
    ) {
      await queryRunner.query(
        'ALTER TABLE `seating_chart_students` DROP COLUMN `source_student_id`',
      );
    }

    if (
      (await queryRunner.hasTable('seating_chart_charts')) &&
      (await queryRunner.hasColumn('seating_chart_charts', 'class_id'))
    ) {
      const chartsTable = await queryRunner.getTable('seating_chart_charts');
      if (
        chartsTable?.indices.some(
          (index) => index.name === 'idx_seating_chart_charts_teacher_class',
        )
      ) {
        await queryRunner.query(
          'DROP INDEX `idx_seating_chart_charts_teacher_class` ON `seating_chart_charts`',
        );
      }
      await queryRunner.query(
        'ALTER TABLE `seating_chart_charts` DROP COLUMN `class_id`',
      );
    }
  }
}
