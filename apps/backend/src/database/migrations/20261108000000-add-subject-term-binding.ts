import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 为学期报告与学科报告专用学科表新增 term_id 列，实现学科与学期绑定；
 * 列为可空以无缝兼容已有历史学科数据，不修改已有线上业务数据。
 */
export class AddSubjectTermBinding20261108000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    if (!(await runner.hasColumn('semester_report_subjects', 'term_id'))) {
      await runner.query(
        'ALTER TABLE semester_report_subjects ADD COLUMN term_id VARCHAR(64) NULL',
      );
    }
    if (
      (await runner.hasTable('subject_report_subjects')) &&
      !(await runner.hasColumn('subject_report_subjects', 'term_id'))
    ) {
      await runner.query(
        'ALTER TABLE subject_report_subjects ADD COLUMN term_id VARCHAR(64) NULL',
      );
    }
  }

  async down(): Promise<void> {
    // 保留已绑定的学期关联，避免回滚结构时丢失业务关联。
  }
}
