import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStudentPhoto20261013000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('student_students', 'photo'))) {
      await queryRunner.query(
        'ALTER TABLE `student_students` ADD COLUMN `photo` MEDIUMTEXT NULL',
      );
    }
  }
  async down(): Promise<void> {
    // Earlier code ignores this nullable column; retain uploaded student photos on rollback.
  }
}
