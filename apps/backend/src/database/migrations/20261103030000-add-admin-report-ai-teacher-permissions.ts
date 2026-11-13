import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdminReportAiTeacherPermissions20261103030000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('admin_report_ai_teacher_permissions'))) {
      await queryRunner.query(
        `CREATE TABLE \`admin_report_ai_teacher_permissions\` (
          \`teacher_id\` VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '教师ID',
          \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '授权时间',
          CONSTRAINT \`fk_admin_report_ai_teacher\`
            FOREIGN KEY (\`teacher_id\`) REFERENCES \`teacher_auth_teachers\` (\`id\`)
            ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 报告权限配置教师表'`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('admin_report_ai_teacher_permissions')) {
      await queryRunner.query(
        'DROP TABLE `admin_report_ai_teacher_permissions`',
      );
    }
  }
}
