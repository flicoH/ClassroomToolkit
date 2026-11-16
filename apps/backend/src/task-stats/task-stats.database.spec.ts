import { TaskStatsDatabase } from './task-stats.database';

describe('TaskStatsDatabase checklist review', () => {
  it('keeps the correction flag and checklist atomic across review, retry and clearing', async () => {
    let row = { id: 'row', checkedItemIds: ['a'], needsCorrection: false };
    const manager = {
      findOne: jest.fn(async () => row),
      update: jest.fn(async (_entity, _where, patch: Partial<typeof row>) => {
        row = { ...row, ...patch };
      }),
    };
    const repository = {
      manager: {
        transaction: (run: (value: typeof manager) => unknown) => run(manager),
      },
    };
    const database = new TaskStatsDatabase(
      {} as never,
      repository as never,
      { teacherId: 'teacher' } as never,
    );
    const review = (action: 'requestCorrection' | 'complete') =>
      database.review('task', 'student', ['a', 'b'], action);

    await expect(review('complete')).rejects.toMatchObject({ status: 409 });
    await expect(review('requestCorrection')).resolves.toEqual({
      checkedItemIds: ['a'],
      needsCorrection: true,
    });
    expect(manager.findOne).toHaveBeenCalledWith(expect.anything(), {
      where: { taskId: 'task', teacherId: 'teacher', studentId: 'student' },
      lock: { mode: 'pessimistic_write' },
    });
    await expect(review('complete')).resolves.toEqual({
      checkedItemIds: ['a', 'b'],
      needsCorrection: false,
    });
    await expect(review('complete')).resolves.toEqual({
      checkedItemIds: ['a', 'b'],
      needsCorrection: false,
    });
    await review('requestCorrection');
    await expect(
      database.setChecked('task', 'student', 'b', false),
    ).resolves.toMatchObject({ needsCorrection: true });
    await expect(
      database.setChecked('task', 'student', 'a', false),
    ).resolves.toEqual({ checkedItemIds: [], needsCorrection: false });
    await expect(review('requestCorrection')).rejects.toMatchObject({
      status: 409,
    });
  });
});
