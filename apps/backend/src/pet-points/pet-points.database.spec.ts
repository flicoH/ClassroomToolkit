import type { Repository } from 'typeorm';
import { TeacherContext } from '../auth/teacher-context';
import { PetStudentEntity } from './entities/pet-student.entity';
import { PetStateHistoryEntity } from './entities/pet-state-history.entity';
import { PetPointsDatabase } from './pet-points.database';
import type { StudentPet } from './pet-points.types';

describe('pet state and history persistence', () => {
  function setup() {
    let state = {
      id: 'teacher:one',
      teacherId: 'teacher',
      name: '小明',
      classId: 'class',
      petId: 'sprout-puff',
      petName: '团团',
      level: 1,
      stage: '初始形态',
      petHatched: false,
    } as PetStudentEntity | undefined;
    let observations: Array<Record<string, unknown>> = [];
    const history = {
      findOne: jest.fn(async () => observations.at(-1) ?? null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        observations.push(structuredClone(value));
        return value;
      }),
    };
    const students = {
      findOne: jest.fn(async ({ where, lock }) => {
        expect(lock).toEqual({ mode: 'pessimistic_write' });
        expect(
          (Array.isArray(where) ? where : [where]).every(
            (item) => item.teacherId === 'teacher',
          ),
        ).toBe(true);
        return state ? structuredClone(state) : null;
      }),
      find: jest.fn(async () => (state ? [structuredClone(state)] : [])),
      create: jest.fn((value) => value),
      merge: jest.fn((value, patch) =>
        Object.assign(
          value,
          Object.fromEntries(
            Object.entries(patch).filter(([, item]) => item !== undefined),
          ),
        ),
      ),
      save: jest.fn(async (value) => {
        state = structuredClone(value);
        return value;
      }),
      delete: jest.fn(async () => {
        state = undefined;
      }),
    };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === PetStateHistoryEntity ? history : students,
      ),
    };
    const transaction = jest.fn(async (work) => {
      const before = structuredClone({ state, observations });
      try {
        return await work(manager);
      } catch (error) {
        state = before.state;
        observations = before.observations;
        throw error;
      }
    });
    const outside = {
      manager: { transaction },
    } as unknown as Repository<PetStudentEntity>;
    const unused = {} as never;
    const database = new PetPointsDatabase(
      outside,
      unused,
      unused,
      unused,
      unused,
      unused,
      { teacherId: 'teacher' } as TeacherContext,
    );
    return {
      database,
      students,
      history,
      transaction,
      state: () => state,
      observations: () => observations,
      remove: () => {
        state = undefined;
      },
    };
  }
  it('persists adoption, growth, rollback and rebinding while retaining all earlier forms', async () => {
    const { database, observations } = setup();
    await database.updateStudent('one', { petHatched: true });
    await database.updateStudent('one', { level: 4, stage: '第4形态' });
    await database.updateStudent('one', { level: 2, stage: '第2形态' });
    await database.updateStudent('one', {
      petId: 'another',
      petName: '新伙伴',
    });
    expect(observations().map((row) => row.pet)).toEqual([
      expect.objectContaining({ petHatched: true, level: 1 }),
      expect.objectContaining({ level: 4, stage: '第4形态' }),
      expect.objectContaining({ level: 2, stage: '第2形态' }),
      expect.objectContaining({ petId: 'another', petName: '新伙伴' }),
    ]);
    expect(
      observations().every(
        (row) => row.teacherId === 'teacher' && row.studentId === 'teacher:one',
      ),
    ).toBe(true);
  });
  it('creates a history baseline on roster sync and avoids duplicate forms on score-only updates', async () => {
    const { database, state, observations } = setup();
    await database.saveStudent({ ...state(), id: 'one' } as StudentPet);
    await database.updateStudent('one', { score: 15, absent: true });
    expect(state()).toMatchObject({ score: 15, absent: true });
    expect(observations()).toHaveLength(1);
  });
  it('rolls back the current pet update if history cannot be stored', async () => {
    const { database, history, state, observations } = setup();
    history.save.mockRejectedValueOnce(new Error('storage failed'));
    await expect(database.updateStudent('one', { level: 4 })).rejects.toThrow(
      'storage failed',
    );
    expect(state()?.level).toBe(1);
    expect(observations()).toHaveLength(0);
  });
  it('does not record an inaccessible student and retains a marker when a student leaves the roster', async () => {
    const { database, remove, history } = setup();
    remove();
    expect(
      await database.updateStudent('other-teacher-student', { level: 5 }),
    ).toBeUndefined();
    expect(history.save).not.toHaveBeenCalled();
    const next = setup();
    await next.database.deleteClassStudentsExcept('class', []);
    expect(next.observations()).toEqual([
      expect.objectContaining({ pet: null, studentId: 'teacher:one' }),
    ]);
    expect(next.state()).toBeUndefined();
    expect(next.students.find).toHaveBeenCalledWith({
      where: { teacherId: 'teacher', classId: 'class' },
    });
    expect(next.students.findOne).toHaveBeenCalledWith({
      where: { teacherId: 'teacher', classId: 'class', id: 'teacher:one' },
      lock: { mode: 'pessimistic_write' },
    });
  });
});
