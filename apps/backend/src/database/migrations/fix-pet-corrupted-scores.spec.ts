import type { QueryRunner } from 'typeorm';
import { FixPetCorruptedScores20261104010000 } from './20261104010000-fix-pet-corrupted-scores';

describe('FixPetCorruptedScores20261104010000 migration', () => {
  it('repairs completed_pets and trophies from completed snapshots', async () => {
    const executedQueries: Array<{ sql: string; params?: unknown[] }> = [];
    const runner = {
      hasTable: jest.fn().mockResolvedValue(true),
      query: jest.fn().mockImplementation((sql: string, params?: unknown[]) => {
        executedQueries.push({ sql, params });
        if (sql.includes('SELECT id, teacher_id, student_id, snapshot')) {
          return Promise.resolve([
            {
              id: 'c1',
              teacher_id: 't1',
              student_id: 's1',
              snapshot: JSON.stringify({ earnedBadges: 1 }),
            },
            {
              id: 'c2',
              teacher_id: 't1',
              student_id: 's1',
              snapshot: JSON.stringify({ earnedBadges: 2 }),
            },
          ]);
        }
        if (sql.includes('SELECT DISTINCT s.id, s.logical_id')) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      }),
    } as unknown as QueryRunner;

    await new FixPetCorruptedScores20261104010000().up(runner);

    expect(
      executedQueries.some(
        (q) =>
          q.sql.includes('UPDATE `pet_points_students`') &&
          q.sql.includes('`completed_pets` = GREATEST(`completed_pets`, ?)') &&
          q.params?.[0] === 2 &&
          q.params?.[1] === 3 &&
          q.params?.[2] === 's1',
      ),
    ).toBe(true);
  });

  it('restores score, experience, and pet attributes for students with score=0 from evaluation history', async () => {
    const executedQueries: Array<{ sql: string; params?: unknown[] }> = [];
    const runner = {
      hasTable: jest.fn().mockResolvedValue(true),
      query: jest.fn().mockImplementation((sql: string, params?: unknown[]) => {
        executedQueries.push({ sql, params });
        if (sql.includes('SELECT id, teacher_id, student_id, snapshot')) {
          return Promise.resolve([]);
        }
        if (sql.includes('SELECT DISTINCT s.id, s.logical_id')) {
          return Promise.resolve([
            { id: 'student-zero', logical_id: 's-zero' },
          ]);
        }
        if (sql.includes('FROM pet_points_evaluation_records')) {
          return Promise.resolve([
            {
              id: 'eval-1',
              score_delta: 10,
              after_values: JSON.stringify({
                score: 180,
                experience: 60,
                energy: 15,
              }),
            },
          ]);
        }
        if (sql.includes('FROM pet_points_state_history')) {
          return Promise.resolve([
            {
              id: 'hist-1',
              pet: JSON.stringify({
                level: 3,
                stage: '第3形态',
                petId: 'fox',
                petName: '小狐狸',
              }),
            },
          ]);
        }
        return Promise.resolve([]);
      }),
    } as unknown as QueryRunner;

    await new FixPetCorruptedScores20261104010000().up(runner);

    expect(
      executedQueries.some(
        (q) =>
          q.sql.includes('UPDATE `pet_points_students`') &&
          q.sql.includes('`score` = ?') &&
          q.params?.[0] === 180 &&
          q.params?.[1] === 60 &&
          q.params?.[2] === 15 &&
          q.params?.[3] === 3 &&
          q.params?.[4] === '第3形态' &&
          q.params?.[5] === 'fox' &&
          q.params?.[6] === '小狐狸' &&
          q.params?.[7] === 'student-zero',
      ),
    ).toBe(true);
  });

  it('restores scores and pet progression specifically for Zhuang Kunxiang and Chen Ronghan', async () => {
    const executedQueries: Array<{ sql: string; params?: unknown[] }> = [];
    const runner = {
      hasTable: jest.fn().mockResolvedValue(true),
      query: jest.fn().mockImplementation((sql: string, params?: unknown[]) => {
        executedQueries.push({ sql, params });
        return Promise.resolve([]);
      }),
    } as unknown as QueryRunner;

    await new FixPetCorruptedScores20261104010000().up(runner);

    expect(
      executedQueries.some(
        (q) =>
          q.sql.includes("`name` = '庄坤翔'") &&
          q.sql.includes('`score` = 259') &&
          q.sql.includes("`pet_name` = '珊瑚鲸'") &&
          q.sql.includes('`completed_pets` = 1'),
      ),
    ).toBe(true);

    expect(
      executedQueries.some(
        (q) =>
          q.sql.includes("`name` = '陈荣涵'") &&
          q.sql.includes('`score` = 125') &&
          q.sql.includes("`pet_name` = '泡泡獭'") &&
          q.sql.includes("`stage` = '第6形态'"),
      ),
    ).toBe(true);
  });
});
