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
    const database = {
      findById: jest.fn().mockResolvedValue(task),
      save: jest.fn().mockImplementation(async (nextTask) => nextTask),
    };
    const service = new TaskStatsService(database as never);

    const nextTask = await service.cycleStudentStatus('task-1', '2026001');

    expect(database.save).toHaveBeenCalledWith(
      expect.objectContaining({
        students: [
          {
            id: '2026001',
            name: '周杰伦',
            studentNo: '2026001',
            status: '已完成',
          },
          {
            id: '2026002',
            name: '林俊杰',
            studentNo: '2026002',
            status: '已完成',
          },
        ],
      }),
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
