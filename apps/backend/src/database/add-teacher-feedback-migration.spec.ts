import { AddTeacherFeedback20260918000000 } from './migrations/20260918000000-add-teacher-feedback';

describe('AddTeacherFeedback20260918000000', () => {
  it('skips table creation when schema.sql already created it', async () => {
    const queryRunner = {
      hasTable: jest.fn().mockResolvedValue(true),
      query: jest.fn(),
    };

    await new AddTeacherFeedback20260918000000().up(queryRunner as never);

    expect(queryRunner.hasTable).toHaveBeenCalledWith('teacher_feedback');
    expect(queryRunner.query).not.toHaveBeenCalled();
  });

  it('creates the table for migration-only deployments', async () => {
    const queryRunner = {
      hasTable: jest.fn().mockResolvedValue(false),
      query: jest.fn().mockResolvedValue(undefined),
    };

    await new AddTeacherFeedback20260918000000().up(queryRunner as never);

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE teacher_feedback'),
    );
  });

  it('never deletes collected feedback during a revert', async () => {
    const queryRunner = { query: jest.fn() };

    await new AddTeacherFeedback20260918000000().down();

    expect(queryRunner.query).not.toHaveBeenCalled();
  });
});
