import { StudentsDatabase } from './students.database';
import { ClassroomEntity } from './entities/classroom.entity';
import { StudentEntity } from './entities/student.entity';
import { PetStudentEntity } from '../pet-points/entities/pet-student.entity';

describe('student photo persistence', () => {
  function setup() {
    let stored = {
      id: 'class:one',
      teacherId: 'teacher',
      classroomId: 'class',
      name: '小明',
      studentNo: '1',
      gender: '',
      groupName: null,
      photo: 'latest-photo',
    };
    const classrooms = {
      findOne: jest.fn(async () => ({
        id: 'class',
        teacherId: 'teacher',
        name: '一班',
        students: [stored],
        groups: [],
      })),
      create: jest.fn((row) => row),
      save: jest.fn(),
      delete: jest.fn(async () => ({ affected: 1 })),
      manager: {} as Record<string, unknown>,
    };
    const students = {
      find: jest.fn(async () => [stored]),
      findOne: jest.fn(async () => stored),
      create: jest.fn((row) => row),
      delete: jest.fn(),
      save: jest.fn(async (rows) => {
        stored = rows[0];
      }),
      update: jest.fn(async (_where, patch) => {
        stored = { ...stored, ...patch };
      }),
    };
    const groups = {
      delete: jest.fn(),
      create: jest.fn((row) => row),
      save: jest.fn(),
    };
    const manager = {
      getRepository: (entity) =>
        entity === ClassroomEntity
          ? classrooms
          : entity === StudentEntity
            ? students
            : groups,
    };
    // Serialize transactions like a database row lock, including concurrent photo and aggregate writes.
    let tail: Promise<unknown> = Promise.resolve();
    classrooms.manager.transaction = jest.fn((callback) => {
      const next = tail.then(() => callback(manager));
      tail = next.catch(() => {});
      return next;
    });
    const database = new StudentsDatabase(
      classrooms as never,
      groups as never,
      students as never,
      { teacherId: 'teacher' } as never,
    );
    return { database, classrooms, students, stored: () => stored };
  }
  it('retains a concurrent upload when an older class form rewrites student details', async () => {
    const { database, stored } = setup();
    const oldForm = {
      id: 'class',
      name: '一班',
      groups: [],
      students: [
        {
          id: 'class:one',
          name: '新姓名',
          studentNo: '1',
          gender: '' as const,
          photo: 'stale-photo',
        },
      ],
    };
    await Promise.all([
      database.setStudentPhoto('class', 'class:one', 'new-photo'),
      database.saveClassroom(oldForm),
    ]);
    expect(stored()).toMatchObject({ name: '新姓名', photo: 'new-photo' });
    const classroom = await database.findClassroom('class');
    expect(classroom?.students[0]?.photo).toBe('new-photo');
    await Promise.all([
      database.saveClassroom(oldForm),
      database.setStudentPhoto('class', 'class:one', null),
    ]);
    expect(stored()).toMatchObject({ name: '新姓名', photo: null });
  });
  it('updates only photo and scopes writes to teacher, classroom and student', async () => {
    const { database, classrooms, students } = setup();
    await database.setStudentPhoto('class', 'class:one', null);
    expect(classrooms.findOne).toHaveBeenCalledWith({
      where: { id: 'class', teacherId: 'teacher' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(students.update).toHaveBeenCalledWith(
      { id: 'class:one', classroomId: 'class', teacherId: 'teacher' },
      { photo: null },
    );
    classrooms.findOne.mockResolvedValueOnce(null as never);
    await expect(
      database.setStudentPhoto('foreign', 'class:one', 'photo'),
    ).rejects.toThrow('班级不存在');
    students.findOne.mockResolvedValueOnce(null as never);
    await expect(
      database.setStudentPhoto('class', 'missing', 'photo'),
    ).rejects.toThrow('学生不存在');
    expect(students.update).toHaveBeenCalledTimes(1);
  });

  it('deletes classroom along with its groups and students in a transaction', async () => {
    const { database, classrooms, students } = setup();
    const result = await database.deleteClassroom('class');
    expect(result).toBe(true);
    expect(students.delete).toHaveBeenCalledWith({
      classroomId: 'class',
      teacherId: 'teacher',
    });
    expect(classrooms.delete).toHaveBeenCalledWith({
      id: 'class',
      teacherId: 'teacher',
    });
  });

  it('preserves pet points and completed pets when saveClassroom syncs student list', async () => {
    let petState = {
      id: 'teacher:class:stu-1',
      logicalId: 'class:stu-1',
      teacherId: 'teacher',
      classId: 'class',
      className: '一班',
      name: '小明',
      studentNo: '2026018',
      score: 297,
      petExperience: 97,
      completedPets: 1,
      trophies: 1,
      level: 5,
      stage: '第5形态',
      petId: 'fox',
      petName: '小狐狸',
      rosterActive: true,
    };
    const petStudents = {
      find: jest.fn(async () => [petState]),
      findOne: jest.fn(async () => petState),
      create: jest.fn((row) => row),
      save: jest.fn(async (row) => {
        petState = { ...petState, ...row };
        return petState;
      }),
    };
    const classrooms = {
      findOne: jest.fn(async () => null),
      create: jest.fn((row) => row),
      save: jest.fn(async (row) => row),
      manager: {} as Record<string, unknown>,
    };
    const students = {
      find: jest.fn(async () => []),
      create: jest.fn((row) => row),
      save: jest.fn(async (rows) => rows),
      delete: jest.fn(),
    };
    const groups = {
      delete: jest.fn(),
      create: jest.fn((row) => row),
      save: jest.fn(),
    };
    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === ClassroomEntity) return classrooms;
        if (entity === StudentEntity) return students;
        if (entity === PetStudentEntity) return petStudents;
        return groups;
      },
    };
    classrooms.manager.transaction = jest.fn((callback) => callback(manager));

    const database = new StudentsDatabase(
      classrooms as never,
      groups as never,
      students as never,
      { teacherId: 'teacher' } as never,
    );

    await database.saveClassroom({
      id: 'class',
      name: '一班',
      groups: [],
      students: [
        {
          id: 'stu-1',
          name: '小明',
          studentNo: '2026016', // studentNo updated in classroom
          gender: '',
        },
      ],
    });

    expect(petState.score).toBe(297);
    expect(petState.petExperience).toBe(97);
    expect(petState.completedPets).toBe(1);
    expect(petState.trophies).toBe(1);
    expect(petState.level).toBe(5);
    expect(petState.stage).toBe('第5形态');
    expect(petState.studentNo).toBe('2026016');
  });
});
