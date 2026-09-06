import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskStudentEntity } from './entities/task-student.entity';
import { TaskEntity } from './entities/task.entity';
import { StudentStatus, TaskItem } from './task-stats.types';
import { TeacherContext } from '../auth/teacher-context';

@Injectable()
export class TaskStatsDatabase {
  constructor(
    @InjectRepository(TaskEntity)
    private readonly tasks: Repository<TaskEntity>,
    @InjectRepository(TaskStudentEntity)
    private readonly students: Repository<TaskStudentEntity>,
    private readonly teacherContext: TeacherContext,
  ) {}

  /** 查询当前教师的全部任务统计。 */
  async findAll() {
    const rows = await this.tasks.find({
      where: { teacherId: this.teacherContext.teacherId },
      relations: { students: true },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => this.toTask(row));
  }

  /** 查询当前教师名下的单个任务统计。 */
  async findById(id: string) {
    const row = await this.tasks.findOne({
      where: { id, teacherId: this.teacherContext.teacherId },
      relations: { students: true },
    });
    return row ? this.toTask(row) : undefined;
  }

  /** 保存任务聚合数据，重写任务下的学生状态列表。 */
  async save(task: TaskItem) {
    const teacherId = this.teacherContext.teacherId;
    const students = this.normalizeStudents(task);
    await this.tasks.save(
      this.tasks.create({
        id: task.id,
        teacherId,
        title: task.title,
        className: task.className,
        type: task.type,
        statusCount: task.statusCount,
        createdAt: task.createdAt,
      }),
    );
    await this.students
      .createQueryBuilder()
      .delete()
      .from(TaskStudentEntity)
      .where('task_id = :taskId', { taskId: task.id })
      .execute();
    const entities = students.map((student) =>
      this.students.create({
        id: `${task.id}-${student.id}`,
        teacherId,
        taskId: task.id,
        studentId: student.id,
        name: student.name,
        studentNo: student.studentNo,
        status: student.status,
        score: student.score === undefined ? null : String(student.score),
      }),
    );
    if (entities.length) await this.students.upsert(entities, ['id']);
    return (await this.findById(task.id))!;
  }

  /** 直接更新任务中单个学生的状态和可选分数。 */
  async updateStudentStatus(
    taskId: string,
    studentId: string,
    status: StudentStatus,
    score?: number,
  ) {
    const result = await this.students.update(
      {
        taskId,
        teacherId: this.teacherContext.teacherId,
        studentId,
      },
      {
        status,
        score: score === undefined ? undefined : String(score),
      },
    );
    return Boolean(result.affected);
  }

  /** 在数据库层按固定顺序轮转学生状态，减少并发覆盖。 */
  async cycleStudentStatus(taskId: string, studentId: string) {
    const result = await this.students.query(
      `
        UPDATE task_stats_students
        SET status = CASE status
          WHEN '未完成' THEN '已完成'
          WHEN '已完成' THEN '需订正'
          ELSE '未完成'
        END
        WHERE task_id = ? AND teacher_id = ? AND student_id = ?
      `,
      [taskId, this.teacherContext.teacherId, studentId],
    );
    const affectedRows = Array.isArray(result)
      ? result[0]?.affectedRows
      : result?.affectedRows;
    return Number(affectedRows ?? 0) > 0;
  }

  /** 删除当前教师名下的任务统计。 */
  async delete(id: string) {
    const result = await this.tasks.delete({
      id,
      teacherId: this.teacherContext.teacherId,
    });
    return Boolean(result.affected);
  }

  /** 将任务实体和学生实体组装为接口模型。 */
  private toTask(entity: TaskEntity): TaskItem {
    return {
      id: entity.id,
      title: entity.title,
      className: entity.className,
      type: entity.type,
      statusCount: entity.statusCount,
      createdAt: entity.createdAt,
      students: [...(entity.students ?? [])]
        .filter(
          (student) => student.teacherId === this.teacherContext.teacherId,
        )
        .sort((a, b) => a.studentNo.localeCompare(b.studentNo))
        .map((student) => ({
          id: student.studentId,
          name: student.name,
          studentNo: student.studentNo,
          status: student.status,
          score: student.score === null ? undefined : Number(student.score),
        })),
    };
  }

  /** 去重任务学生列表，避免重复学生写入同一任务。 */
  private normalizeStudents(task: TaskItem) {
    const seen = new Set<string>();
    return task.students.filter((student) => {
      if (seen.has(student.id)) return false;
      seen.add(student.id);
      return true;
    });
  }
}
