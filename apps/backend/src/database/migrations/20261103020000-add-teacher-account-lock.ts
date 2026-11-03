import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTeacherAccountLock20261103020000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('teacher_auth_teachers', 'status'))) {
      await queryRunner.query(
        "ALTER TABLE `teacher_auth_teachers` ADD COLUMN `status` VARCHAR(20) NOT NULL DEFAULT 'active' COMMENT '账号状态：active正常 locked锁定'",
      );
    }
    if (!(await queryRunner.hasColumn('teacher_auth_teachers', 'locked_at'))) {
      await queryRunner.query(
        "ALTER TABLE `teacher_auth_teachers` ADD COLUMN `locked_at` DATETIME NULL COMMENT '锁定时间'",
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('teacher_auth_teachers', 'locked_at')) {
      await queryRunner.query(
        'ALTER TABLE `teacher_auth_teachers` DROP COLUMN `locked_at`',
      );
    }
    if (await queryRunner.hasColumn('teacher_auth_teachers', 'status')) {
      await queryRunner.query(
        'ALTER TABLE `teacher_auth_teachers` DROP COLUMN `status`',
      );
    }
  }
}
