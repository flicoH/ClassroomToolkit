import { AddStudentPhoto20261013000000 } from './20261013000000-add-student-photo';

it('adds a nullable photo column once and keeps uploaded data when reverting application code', async () => {
  const runner = {
    hasColumn: jest.fn().mockResolvedValue(false),
    query: jest.fn(),
  };
  const migration = new AddStudentPhoto20261013000000();
  await migration.up(runner as never);
  expect(runner.query).toHaveBeenCalledWith(
    'ALTER TABLE `student_students` ADD COLUMN `photo` MEDIUMTEXT NULL',
  );
  runner.hasColumn.mockResolvedValue(true);
  await migration.up(runner as never);
  await migration.down();
  expect(runner.query).toHaveBeenCalledTimes(1);
});
