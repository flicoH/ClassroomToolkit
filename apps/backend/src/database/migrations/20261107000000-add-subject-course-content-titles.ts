import type { MigrationInterface, QueryRunner } from 'typeorm';

/** 仅新增可空配置列，不回填教师配置；列检查支持失败后的安全重跑。 */
export class AddSubjectCourseContentTitles20261107000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    if (
      !(await runner.hasColumn(
        'subject_report_subjects',
        'course_content_titles',
      ))
    ) {
      await runner.query(
        'ALTER TABLE subject_report_subjects ADD COLUMN course_content_titles JSON NULL',
      );
    }
  }
  async down(): Promise<void> {
    // 回滚代码时保留教师配置，避免删除业务数据。
  }
}
