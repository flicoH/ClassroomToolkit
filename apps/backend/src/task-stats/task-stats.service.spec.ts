import { TaskStatsService } from './task-stats.service';

describe('TaskStatsService', () => {
  it('cycles a student status and returns the recalculated summary', async () => {
    const task = {
      id: 'task-1',
      title: '作业统计',
      className: '一年级',
      type: 'status' as const,
      statusCount: 3,
      createdAt: '2026-06-04',
      students: [
        {
          id: '2026001',
          name: '周杰伦',
          studentNo: '2026001',
          status: '未完成' as const,
        },
        {
          id: '2026002',
          name: '林俊杰',
          studentNo: '2026002',
          status: '已完成' as const,
        },
      ],
    };
    const updatedTask = {
      ...task,
      students: task.students.map((student) =>
        student.id === '2026001'
          ? { ...student, status: '已完成' as const }
          : student,
      ),
    };
    const database = {
      findById: jest
        .fn()
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce(updatedTask),
      cycleStudentStatus: jest.fn().mockResolvedValue(true),
    };
    const service = new TaskStatsService(database as never);

    const nextTask = await service.cycleStudentStatus('task-1', '2026001');

    expect(database.cycleStudentStatus).toHaveBeenCalledWith(
      'task-1',
      '2026001',
    );
    expect(nextTask.summary).toEqual(
      expect.objectContaining({
        total: 2,
        done: 2,
        percent: 100,
      }),
    );
  });
});

describe('任务子项', () => {
  const task = {
    id: 'task-1',
    title: '随堂练习',
    className: '一年级',
    type: 'status' as const,
    statusCount: 4,
    createdAt: '2026-11-16',
    items: [
      { id: 'a', title: '订正' },
      { id: 'b', title: '复核' },
    ],
    students: [
      {
        id: 'student-1',
        name: '小王',
        studentNo: '01',
        status: '未完成' as const,
      },
    ],
  };

  it('uses the teacher class roster and server-generated items on create', async () => {
    const database = {
      findClass: jest
        .fn()
        .mockResolvedValue({ name: task.className, students: task.students }),
      save: jest.fn().mockImplementation(async (value: typeof task) => value),
    };
    const service = new TaskStatsService(database as never);
    const result = await service.create({
      title: task.title,
      classId: 'class-1',
      className: '客户端班名',
      type: 'status',
      statusCount: 4,
      students: [],
      items: [{ title: ' 订正 ' }, { title: '复核' }],
    });
    expect(database.findClass).toHaveBeenCalledWith('class-1');
    expect(result.statusCount).toBe(4);
    expect(result.className).toBe(task.className);
    expect(result.students).toEqual(task.students);
    expect(result.items?.map(({ title }) => title)).toEqual(['订正', '复核']);
    expect(new Set(result.items?.map(({ id }) => id)).size).toBe(2);
  });

  it('derives and summarizes partial, complete and cleared work', async () => {
    const database = {
      findById: jest.fn().mockResolvedValue({
        ...task,
        students: [{ ...task.students[0], checkedItemIds: ['a'] }],
      }),
      setChecked: jest
        .fn()
        .mockResolvedValueOnce({
          checkedItemIds: ['a'],
          needsCorrection: false,
        })
        .mockResolvedValueOnce({
          checkedItemIds: ['a', 'b'],
          needsCorrection: false,
        })
        .mockResolvedValueOnce({ checkedItemIds: [], needsCorrection: false }),
    };
    const service = new TaskStatsService(database as never);
    expect((await service.findById('task-1')).summary.statusPercents).toEqual([
      { status: '已完成', count: 0, percent: 0 },
      { status: '待改正', count: 0, percent: 0 },
      { status: '未完成', count: 0, percent: 0 },
      { status: '待提交', count: 1, percent: 100 },
    ]);
    await expect(
      service.setChecked('task-1', 'student-1', 'a', true),
    ).resolves.toMatchObject({ status: '待提交' });
    await expect(
      service.setChecked('task-1', 'student-1', 'b', true),
    ).resolves.toMatchObject({ status: '已完成' });
    await expect(
      service.setChecked('task-1', 'student-1', 'a', false),
    ).resolves.toMatchObject({ status: '未完成' });
  });

  it('reports reviewed students as red even when all subitems are checked', async () => {
    const review = jest.fn().mockResolvedValue({
      checkedItemIds: ['a', 'b'],
      needsCorrection: true,
    });
    const service = new TaskStatsService({
      review,
      findById: jest.fn().mockResolvedValue({
        ...task,
        students: [
          {
            ...task.students[0],
            checkedItemIds: ['a', 'b'],
            needsCorrection: true,
          },
        ],
      }),
    } as never);
    await expect(
      service.review('task-1', 'student-1', 'requestCorrection'),
    ).resolves.toMatchObject({
      status: '待改正',
      needsCorrection: true,
    });
    expect(review).toHaveBeenCalledWith(
      'task-1',
      'student-1',
      ['a', 'b'],
      'requestCorrection',
    );
    expect((await service.findById('task-1')).summary.done).toBe(0);
  });

  it('rejects inaccessible tasks and unrelated items or students', async () => {
    const database = {
      findById: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValue(task),
      setChecked: jest.fn().mockResolvedValue(undefined),
    };
    const service = new TaskStatsService(database as never);
    await expect(
      service.setChecked('other-task', 'student-1', 'a', true),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.setChecked('task-1', 'student-1', 'other-item', true),
    ).rejects.toMatchObject({ status: 404 });
    expect(database.setChecked).not.toHaveBeenCalled();
    await expect(
      service.setChecked('task-1', 'other-student', 'a', true),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.cycleStudentStatus('task-1', 'student-1'),
    ).rejects.toMatchObject({ status: 409 });
  });
});
