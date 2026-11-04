import type { QueryRunner } from 'typeorm';
import { FixPetDuplicateStudents20261104000000 } from './20261104000000-fix-pet-duplicate-students';

describe('fix pet duplicate students migration', () => {
  it('restores lost names for 2026001 and 2026003 across student and pet tables', async () => {
    const executedQueries: Array<{ sql: string; params?: unknown[] }> = [];
    const runner = {
      hasTable: jest.fn().mockResolvedValue(true),
      query: jest.fn().mockImplementation((sql: string, params?: unknown[]) => {
        executedQueries.push({ sql, params });
        if (sql.includes('GROUP BY')) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      }),
    } as unknown as QueryRunner;

    await new FixPetDuplicateStudents20261104000000().up(runner);

    const sqlStatements = executedQueries.map((q) => q.sql);
    expect(
      sqlStatements.some(
        (sql) =>
          sql.includes('UPDATE `student_students`') &&
          sql.includes("'林俊杰'") &&
          sql.includes("'2026001'"),
      ),
    ).toBe(true);
    expect(
      sqlStatements.some(
        (sql) =>
          sql.includes('UPDATE `student_students`') &&
          sql.includes("'陈奕迅'") &&
          sql.includes("'2026003'"),
      ),
    ).toBe(true);
    expect(
      sqlStatements.some(
        (sql) =>
          sql.includes('UPDATE `pet_points_students`') &&
          sql.includes("'林俊杰'") &&
          sql.includes("'2026001'"),
      ),
    ).toBe(true);
    expect(
      sqlStatements.some(
        (sql) =>
          sql.includes('UPDATE `pet_points_students`') &&
          sql.includes("'陈奕迅'") &&
          sql.includes("'2026003'"),
      ),
    ).toBe(true);
  });

  it('deduplicates duplicate students, merges properties, re-points child records and deletes redundant rows', async () => {
    const executedQueries: Array<{ sql: string; params?: unknown[] }> = [];
    const runner = {
      hasTable: jest.fn().mockResolvedValue(true),
      query: jest.fn().mockImplementation((sql: string, params?: unknown[]) => {
        executedQueries.push({ sql, params });
        if (sql.includes('GROUP BY')) {
          return Promise.resolve([
            {
              teacher_id: 'teacher-1',
              class_id: 'grade-1',
              student_no: '2026001',
            },
          ]);
        }
        if (sql.includes('SELECT * FROM pet_points_students')) {
          return Promise.resolve([
            {
              id: 'primary-id',
              teacher_id: 'teacher-1',
              class_id: 'grade-1',
              student_no: '2026001',
              score: 20,
              trophies: 1,
              pet_id: 'cloud-bear',
              pet_name: '熊熊',
              pet_progress: 50,
              pet_hatched: 1,
              level_num: 3,
              stage: '第2形态',
              pet_experience: 50,
              logical_id: 'logical-1',
              roster_active: 1,
              revision: 2,
            },
            {
              id: 'extra-id',
              teacher_id: 'teacher-1',
              class_id: 'grade-1',
              student_no: '2026001',
              score: 5,
              trophies: 0,
              pet_id: null,
              pet_name: null,
              pet_progress: 0,
              pet_hatched: 0,
              level_num: 1,
              stage: '初始形态',
              pet_experience: 0,
              logical_id: null,
              roster_active: 1,
              revision: 0,
            },
          ]);
        }
        return Promise.resolve([]);
      }),
    } as unknown as QueryRunner;

    await new FixPetDuplicateStudents20261104000000().up(runner);

    const rePointRecords = executedQueries.find((q) =>
      q.sql.includes('UPDATE `pet_points_evaluation_records`'),
    );
    expect(rePointRecords).toBeDefined();
    expect(rePointRecords?.params).toEqual(['primary-id', 'extra-id']);

    const rePointRedemptions = executedQueries.find((q) =>
      q.sql.includes('UPDATE `pet_points_redemptions`'),
    );
    expect(rePointRedemptions).toBeDefined();
    expect(rePointRedemptions?.params).toEqual(['primary-id', 'extra-id']);

    const deleteExtra = executedQueries.find((q) =>
      q.sql.includes('DELETE FROM `pet_points_students`'),
    );
    expect(deleteExtra).toBeDefined();
    expect(deleteExtra?.params).toEqual(['extra-id']);

    const updatePrimary = executedQueries.find(
      (q) =>
        q.sql.includes('UPDATE `pet_points_students`') &&
        q.sql.includes('roster_active` = TRUE'),
    );
    expect(updatePrimary).toBeDefined();
    expect(updatePrimary?.params?.slice(-1)[0]).toBe('primary-id');
  });
});
