/// <reference types="jest" />
// 确保新增结构幂等且回滚不删除教师配置；不连接真实业务库。
import type { QueryRunner } from 'typeorm';
import { AddSubjectCourseContentTitles20261107000000 } from './migrations/20261107000000-add-subject-course-content-titles';
import { AddReportTermEnabled20261107000001 } from './migrations/20261107000001-add-report-term-enabled';
import { AddSubjectTermBinding20261108000000 } from './migrations/20261108000000-add-subject-term-binding';

it.each([
  {
    migration: new AddSubjectCourseContentTitles20261107000000(),
    table: 'subject_report_subjects',
    column: 'course_content_titles',
    sql: 'ALTER TABLE subject_report_subjects ADD COLUMN course_content_titles JSON NULL',
  },
  {
    migration: new AddReportTermEnabled20261107000001(),
    table: 'semester_report_terms',
    column: 'enabled',
    sql: 'ALTER TABLE semester_report_terms ADD COLUMN enabled TINYINT(1) NOT NULL DEFAULT 1',
  },
])(
  'adds missing $table.$column once without changing existing business rows',
  async ({ migration, table, column, sql }) => {
    const hasColumn = jest.fn().mockResolvedValue(false);
    const query = jest.fn().mockResolvedValue(undefined);
    const runner = { hasColumn, query } as unknown as QueryRunner;
    await migration.up(runner);
    expect(hasColumn).toHaveBeenCalledWith(table, column);
    expect(query).toHaveBeenCalledWith(sql);
    hasColumn.mockResolvedValue(true);
    await migration.up(runner);
    await migration.down();
    expect(query).toHaveBeenCalledTimes(1);
  },
);

it('adds term_id to semester and subject report subjects idempotently without deleting rows', async () => {
  const migration = new AddSubjectTermBinding20261108000000();
  const hasColumn = jest.fn().mockResolvedValue(false);
  const hasTable = jest.fn().mockResolvedValue(true);
  const query = jest.fn().mockResolvedValue(undefined);
  const runner = { hasColumn, hasTable, query } as unknown as QueryRunner;

  await migration.up(runner);
  expect(hasColumn).toHaveBeenCalledWith('semester_report_subjects', 'term_id');
  expect(hasColumn).toHaveBeenCalledWith('subject_report_subjects', 'term_id');
  expect(query).toHaveBeenCalledWith(
    'ALTER TABLE semester_report_subjects ADD COLUMN term_id VARCHAR(64) NULL',
  );
  expect(query).toHaveBeenCalledWith(
    'ALTER TABLE subject_report_subjects ADD COLUMN term_id VARCHAR(64) NULL',
  );

  hasColumn.mockResolvedValue(true);
  await migration.up(runner);
  await migration.down();
  expect(query).toHaveBeenCalledTimes(2);
});
