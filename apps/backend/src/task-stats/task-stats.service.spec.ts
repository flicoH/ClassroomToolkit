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
