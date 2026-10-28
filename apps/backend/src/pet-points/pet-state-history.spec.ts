import type { EntityManager, Repository } from 'typeorm';
import { PetStateHistoryEntity } from './entities/pet-state-history.entity';
import {
  petAppearanceAtReportEnd,
  recordPetAppearance,
} from './pet-state-history';

const egg = {
  petId: 'sprout-puff',
  petName: '团团',
  stage: '初始形态',
  level: 1,
  petHatched: false,
};
const grown = { ...egg, stage: '第4形态', level: 4, petHatched: true };
const end = new Date('2026-10-09T16:00:00Z');

describe('period-end pet history', () => {
  afterEach(() => jest.useRealTimers());
  function repository() {
    const entries = [
      {
        id: '1',
        teacherId: 'teacher',
        studentId: 'student',
        recordedAt: new Date('2026-10-01T00:00:00Z'),
        pet: egg,
      },
      {
        id: '2',
        teacherId: 'teacher',
        studentId: 'student',
        recordedAt: new Date(end.getTime() - 1),
        pet: grown,
      },
      {
        id: '3',
        teacherId: 'teacher',
        studentId: 'student',
        recordedAt: end,
        pet: { ...grown, level: 10 },
      },
      {
        id: '4',
        teacherId: 'other',
        studentId: 'student',
        recordedAt: new Date(end.getTime() - 1),
        pet: { ...grown, petName: '他人' },
      },
    ];
    const findOne = jest.fn(async ({ where, order }) => {
      expect(order).toEqual({ recordedAt: 'DESC', id: 'DESC' });
      expect(where.recordedAt.type).toBe('lessThanOrEqual');
      return (
        entries
          .filter(
            (entry) =>
              entry.teacherId === where.teacherId &&
              entry.studentId === where.studentId &&
              entry.recordedAt <= where.recordedAt.value,
          )
          .sort(
            (a, b) =>
              b.recordedAt.getTime() - a.recordedAt.getTime() ||
              Number(b.id) - Number(a.id),
          )[0] ?? null
      );
    });
    return {
      entries,
      findOne,
      repo: { findOne } as unknown as Repository<PetStateHistoryEntity>,
    };
  }
  it('includes the last millisecond of the Shanghai end date and excludes subsequent changes and other teachers', async () => {
    const { repo } = repository();
    const result = await petAppearanceAtReportEnd(
      repo,
      'teacher',
      'student',
      end,
    );
    expect(result).toEqual({
      pet: grown,
      petAsOf: '2026-10-09T15:59:59.999Z',
      petHistoryStatus: 'recorded',
    });
    expect(
      (await petAppearanceAtReportEnd(repo, 'teacher', 'another-student', end))
        .petHistoryStatus,
    ).toBe('unavailable');
  });
  it('uses only recorded history as of generation when the period ends in the future', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-09T08:00:00Z'));
    const { repo } = repository();
    expect(
      await petAppearanceAtReportEnd(
        repo,
        'teacher',
        'student',
        new Date('2026-12-31T16:00:00Z'),
      ),
    ).toEqual({
      pet: egg,
      petAsOf: '2026-10-09T08:00:00.000Z',
      petHistoryStatus: 'recorded',
    });
  });
  it('carries the last known form forward and freezes an unfinished day at generation time', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-09T08:00:00Z'));
    const { repo } = repository();
    expect(
      await petAppearanceAtReportEnd(repo, 'teacher', 'student', end),
    ).toEqual({
      pet: egg,
      petAsOf: '2026-10-09T08:00:00.000Z',
      petHistoryStatus: 'recorded',
    });
  });
  it('does not backfill a period before the first observation', async () => {
    const { repo } = repository();
    expect(
      await petAppearanceAtReportEnd(
        repo,
        'teacher',
        'student',
        new Date('2026-09-30T16:00:00Z'),
      ),
    ).toMatchObject({ pet: null, petHistoryStatus: 'unavailable' });
  });
  it('uses the last observation for same-millisecond changes and distinguishes unadopted pets from deletion', async () => {
    const { repo, entries } = repository();
    entries.push({
      ...entries[1],
      id: '5',
      pet: { ...egg, petId: null },
    } as unknown as (typeof entries)[number]);
    expect(
      await petAppearanceAtReportEnd(repo, 'teacher', 'student', end),
    ).toMatchObject({ pet: { petId: null }, petHistoryStatus: 'recorded' });
    entries.push({
      ...entries[1],
      id: '6',
      pet: null,
    } as unknown as (typeof entries)[number]);
    expect(
      await petAppearanceAtReportEnd(repo, 'teacher', 'student', end),
    ).toMatchObject({ pet: null, petHistoryStatus: 'unavailable' });
  });
  it('propagates storage failures rather than substituting a live pet', async () => {
    const { repo, findOne } = repository();
    findOne.mockRejectedValueOnce(new Error('history unavailable'));
    await expect(
      petAppearanceAtReportEnd(repo, 'teacher', 'student', end),
    ).rejects.toThrow('history unavailable');
  });
  it('appends form changes and a deletion marker without duplicating score-only updates', async () => {
    let last: unknown = null;
    const history = {
      findOne: jest.fn(async () => last),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        last = value;
      }),
    };
    const manager = {
      getRepository: jest.fn(() => history),
    } as unknown as EntityManager;
    const student = { teacherId: 'teacher', id: 'stored-student' };
    await recordPetAppearance(manager, student, egg);
    await recordPetAppearance(manager, student, { ...egg });
    await recordPetAppearance(manager, student, grown);
    await recordPetAppearance(manager, student, null);
    expect(history.save).toHaveBeenCalledTimes(3);
    expect(history.findOne).toHaveBeenCalledWith({
      where: { teacherId: 'teacher', studentId: 'stored-student' },
      order: { recordedAt: 'DESC', id: 'DESC' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(history.save.mock.calls.map(([row]) => row.pet)).toEqual([
      egg,
      grown,
      null,
    ]);
    expect(history.save.mock.calls[0][0]).toMatchObject({
      teacherId: 'teacher',
      studentId: 'stored-student',
      recordedAt: expect.any(Date),
    });
  });
});
