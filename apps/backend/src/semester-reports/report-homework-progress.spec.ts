import type { DataSource } from 'typeorm';
import { readReportHomeworkProgress } from './report-homework-progress';

it('counts only confirmed complete and untouched tasks for this student and inclusive report dates', async () => {
  const rows = [
    {
      studentId: 'roster-id',
      status: '已完成',
      task: { id: 'a', items: null },
    },
    {
      studentId: 'roster-id',
      status: '未完成',
      task: { id: 'b', items: [{ id: 'x' }] },
      checkedItemIds: [],
    },
    {
      studentId: 'roster-id',
      status: '未完成',
      task: { id: 'c', items: [{ id: 'x' }] },
      checkedItemIds: ['x'],
    },
    {
      studentId: 'roster-id',
      status: '未完成',
      task: { id: 'd', items: [{ id: 'x' }] },
      checkedItemIds: ['x'],
      needsCorrection: true,
    },
    {
      studentId: 'roster-id',
      status: '未完成',
      task: { id: 'e', items: [{ id: 'x' }, { id: 'y' }] },
      checkedItemIds: ['x'],
    },
    {
      studentId: 'roster-id',
      status: '需订正',
      task: { id: 'f', items: null },
    },
  ];
  const query = {
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(rows),
  };
  const dataSource = {
    manager: {
      findOne: jest.fn().mockResolvedValue({ logicalId: 'roster-id' }),
    },
    getRepository: jest
      .fn()
      .mockReturnValue({ createQueryBuilder: () => query }),
  } as unknown as DataSource;
  const report = {
    teacherId: 'teacher',
    studentId: 'teacher:storage-id',
    periodStart: new Date('2026-09-01T00:00:00+08:00'),
    periodEnd: new Date('2026-11-17T00:00:00+08:00'),
  };
  await expect(readReportHomeworkProgress(dataSource, report)).resolves.toEqual(
    { completed: 2, unfinished: 1 },
  );
  expect(query.innerJoinAndSelect).toHaveBeenCalledWith(
    'entry.task',
    'task',
    'task.teacherId = :teacherId',
    { teacherId: 'teacher' },
  );
  expect(query.where).toHaveBeenCalledWith('entry.teacherId = :teacherId', {
    teacherId: 'teacher',
  });
  expect(query.andWhere).toHaveBeenCalledWith(
    'task.createdAt BETWEEN :start AND :end',
    { start: '2026-09-01', end: '2026-11-16' },
  );
  expect(query.andWhere).toHaveBeenCalledWith('entry.studentId IN (:...ids)', {
    ids: expect.arrayContaining(['roster-id', 'storage-id']),
  });
  query.getMany.mockResolvedValueOnce([]);
  await expect(readReportHomeworkProgress(dataSource, report)).resolves.toEqual(
    { completed: 0, unfinished: 0 },
  );
});
