import { StudentsService } from './students.service';
import { Classroom } from './students.types';

describe('StudentsService', () => {
  it('creates default classrooms when a teacher has no classroom data', async () => {
    const database = {
      findClassrooms: jest.fn().mockResolvedValue([]),
      saveClassroom: jest.fn(async (classroom) => classroom),
    };
    const service = new StudentsService(database as never);

    const classrooms = await service.findClassrooms();

    expect(database.saveClassroom).toHaveBeenCalledTimes(3);
    expect(classrooms.map((classroom) => classroom.name)).toEqual([
      '一年级',
      '二年级',
      '三年级',
    ]);
    expect(
      classrooms.every((classroom) => classroom.id.startsWith('class-')),
    ).toBe(true);
    expect(
      classrooms.every((classroom) => classroom.students.length === 0),
    ).toBe(true);
  });

  it('filters classroom students by group and query, then sorts by name', async () => {
    const database = {
      findClassroom: jest.fn().mockResolvedValue({
        id: 'grade-1',
        name: '一年级',
        groups: ['一组', '二组'],
        students: [
          {
            id: '2026002',
            name: '林俊杰',
            studentNo: '2026002',
            gender: '男',
            group: '二组',
          },
          {
            id: '2026001',
            name: '周杰伦',
            studentNo: '2026001',
            gender: '男',
            group: '一组',
          },
          {
            id: '2026003',
            name: '孙燕姿',
            studentNo: '2026003',
            gender: '女',
            group: '二组',
          },
        ],
      }),
    };
    const service = new StudentsService(database as never);

    const classroom = await service.findClassroom('grade-1', {
      group: '二组',
      query: '林',
      sort: '姓名排序',
    });

    expect(database.findClassroom).toHaveBeenCalledWith('grade-1');
    expect(classroom.students).toEqual([
      {
        id: '2026002',
        name: '林俊杰',
        studentNo: '2026002',
        gender: '男',
        group: '二组',
      },
    ]);
  });

  it('updates classroom name without changing students or groups', async () => {
    const classroom = {
      id: 'grade-1',
      name: '一年级',
      groups: ['一组'],
      students: [
        {
          id: '2026001',
          name: '周杰伦',
          studentNo: '2026001',
          gender: '男',
          group: '一组',
        },
      ],
    };
    const database = {
      findClassroom: jest.fn().mockResolvedValue(classroom),
      saveClassroom: jest.fn(async (nextClassroom) => nextClassroom),
    };
    const service = new StudentsService(database as never);

    const updated = await service.updateClassroom('grade-1', {
      name: '一年级 1 班',
    });

    expect(database.saveClassroom).toHaveBeenCalledWith({
      ...classroom,
      name: '一年级 1 班',
    });
    expect(updated.students).toHaveLength(1);
  });

  it('saves added students through the backend store so they can be read after relogin', async () => {
    const classrooms = new Map<string, Classroom>([
      [
        'class-1',
        {
          id: 'class-1',
          name: '一年级',
          groups: ['一组'],
          students: [],
        },
      ],
    ]);
    const database = {
      findClassroom: jest
        .fn()
        .mockImplementation(async (classroomId) => classrooms.get(classroomId)),
      saveClassroom: jest.fn(async (classroom) => {
        classrooms.set(classroom.id, {
          ...classroom,
          students: [...classroom.students],
        });
        return classrooms.get(classroom.id);
      }),
    };
    const service = new StudentsService(database as never);

    await service.addStudent('class-1', {
      name: '张三',
      studentNo: '1001',
      gender: '男',
    });

    const classroom = await service.findClassroom('class-1');
    expect(classroom.students).toEqual([
      {
        id: '1001',
        name: '张三',
        studentNo: '1001',
        gender: '男',
        group: undefined,
      },
    ]);
    expect(database.saveClassroom).toHaveBeenCalledTimes(1);
  });
});
