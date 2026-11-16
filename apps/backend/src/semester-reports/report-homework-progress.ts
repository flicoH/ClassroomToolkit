import type { DataSource } from 'typeorm';
import { PetStudentEntity } from '../pet-points/entities/pet-student.entity';
import { TaskStudentEntity } from '../task-stats/entities/task-student.entity';
import { checklistStatus } from '../task-stats/task-stats.types';
import { formatShanghaiDate } from './report-generation';
import type { SemesterReportEntity } from './semester-report.entity';

export type HomeworkProgress = { completed: number; unfinished: number };

export async function readReportHomeworkProgress(
  dataSource: DataSource,
  report: Pick<
    SemesterReportEntity,
    'teacherId' | 'studentId' | 'periodStart' | 'periodEnd'
  >,
): Promise<HomeworkProgress> {
  const { teacherId, studentId, periodStart, periodEnd } = report;
  const student = await dataSource.manager.findOne(PetStudentEntity, {
    where: { teacherId, id: studentId },
    select: { logicalId: true },
  });
  // Task rosters keep the profile ID while report jobs can use the teacher-prefixed points ID.
  const prefix = `${teacherId}:`;
  const ids = [
    ...new Set(
      [student?.logicalId, studentId]
        .filter((id): id is string => Boolean(id))
        .flatMap((id) =>
          id.startsWith(prefix)
            ? [id, id.slice(prefix.length)]
            : [id, prefix + id],
        ),
    ),
  ];
  if (!ids.length) return { completed: 0, unfinished: 0 };

  const entries = await dataSource
    .getRepository(TaskStudentEntity)
    .createQueryBuilder('entry')
    .innerJoinAndSelect('entry.task', 'task', 'task.teacherId = :teacherId', {
      teacherId,
    })
    .select([
      'entry.id',
      'entry.studentId',
      'entry.status',
      'entry.checkedItemIds',
      'entry.needsCorrection',
      'task.id',
      'task.items',
    ])
    .where('entry.teacherId = :teacherId', { teacherId })
    .andWhere('entry.studentId IN (:...ids)', { ids })
    .andWhere('task.createdAt BETWEEN :start AND :end', {
      start: formatShanghaiDate(periodStart),
      end: formatShanghaiDate(new Date(periodEnd.getTime() - 1)),
    })
    .getMany();

  // Prefer the logical profile ID if legacy rows contain more than one alias for the same task.
  const byTask = new Map<string, TaskStudentEntity>();
  for (const entry of entries) {
    const existing = byTask.get(entry.task.id);
    if (
      !existing ||
      ids.indexOf(entry.studentId) < ids.indexOf(existing.studentId)
    ) {
      byTask.set(entry.task.id, entry);
    }
  }
  const totals = { completed: 0, unfinished: 0 };
  for (const entry of byTask.values()) {
    const items = entry.task.items;
    const status = items?.length
      ? checklistStatus(
          items,
          entry.checkedItemIds ?? [],
          Boolean(entry.needsCorrection),
        )
      : entry.status;
    if (status === '已完成') totals.completed++;
    if (status === '未完成') totals.unfinished++;
  }
  return totals;
}
