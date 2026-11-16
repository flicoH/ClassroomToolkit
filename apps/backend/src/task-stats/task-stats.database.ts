import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskStudentEntity } from './entities/task-student.entity';
import { TaskEntity } from './entities/task.entity';
import { StudentStatus, TaskItem } from './task-stats.types';
import { createEntityId } from '../common/id';
import { ClassroomEntity } from '../students/entities/classroom.entity';
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

  async findClass(id: string) {
    const teacherId = this.teacherContext.teacherId;
    const classroom = await this.tasks.manager.findOne(ClassroomEntity, {
      where: { id, teacherId },
      relations: { students: true },
    });
    if (!classroom) return undefined;
    return {
      name: classroom.name,
      students: classroom.students
        .filter((student) => student.teacherId === teacherId)
        .map((student) => ({
          id: student.id,
          name: student.name,
          studentNo: student.studentNo,
          status: '未完成' as const,
        })),
    };
  }

  /** 任务与名单一起创建，避免只写入其中一部分。 */
  async save(task: TaskItem) {
    const teacherId = this.teacherContext.teacherId;
    const students = this.normalizeStudents(task);
    await this.tasks.manager.transaction(async (manager) => {
      await manager.insert(TaskEntity, {
        id: task.id,
        teacherId,
        title: task.title,
        className: task.className,
        type: task.type,
        statusCount: task.statusCount,
        items: task.items,
        createdAt: task.createdAt,
      });
      if (students.length) {
        await manager.insert(
          TaskStudentEntity,
          students.map((student) => ({
            id: createEntityId('task-student'),
            teacherId,
            taskId: task.id,
            studentId: student.id,
            name: student.name,
            studentNo: student.studentNo,
            status: student.status === '待改正' ? '需订正' : student.status,
            score: student.score === undefined ? null : String(student.score),
          })),
        );
      }
    });
    return (await this.findById(task.id))!;
  }

  /** 编辑配置时只写任务行，避免覆盖同时保存的勾选。 */
  async updateConfiguration(task: TaskItem) {
    const { id, title, className, type, statusCount } = task;
    await this.tasks.update(
      { id, teacherId: this.teacherContext.teacherId },
      {
        title,
        className,
        type,
        statusCount,
      },
    );
  }

  /** 锁定单个任务学生的记录，使同时勾选不同子项也能合并。 */
  async setChecked(
    taskId: string,
    studentId: string,
    itemId: string,
    checked: boolean,
  ) {
    const where = {
      taskId,
      teacherId: this.teacherContext.teacherId,
      studentId,
    };
    return this.students.manager.transaction(async (manager) => {
      const row = await manager.findOne(TaskStudentEntity, {
        where,
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) return undefined;
      const ids = new Set(row.checkedItemIds ?? []);
      if (checked) ids.add(itemId);
      else ids.delete(itemId);
      const checkedItemIds = [...ids];
      await manager.update(
        TaskStudentEntity,
        { ...where, id: row.id },
        { checkedItemIds },
      );
      return checkedItemIds;
    });
  }

  async reset(taskId: string) {
    await this.students.update(
      { taskId, teacherId: this.teacherContext.teacherId },
      {
        checkedItemIds: null,
        status: '未完成',
      },
    );
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
        status: status === '待改正' ? '需订正' : status,
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
      items: entity.items ?? [],
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
          checkedItemIds: student.checkedItemIds ?? [],
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
