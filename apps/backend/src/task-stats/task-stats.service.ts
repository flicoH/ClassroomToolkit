import { Injectable, NotFoundException } from '@nestjs/common';
import { createEntityId } from '../common/id';
import {
  CreateTaskDto,
  UpdateTaskDto,
  UpdateTaskStudentStatusDto,
} from './task-stats.dto';
import { TaskStatsDatabase } from './task-stats.database';
import { StudentStatus, TaskItem } from './task-stats.types';

const statusOrder: StudentStatus[] = ['未完成', '已完成', '需订正'];

@Injectable()
export class TaskStatsService {
  constructor(private readonly database: TaskStatsDatabase) {}

  async findAll() {
    const tasks = await this.database.findAll();
    return tasks.map((task) => this.withSummary(task));
  }

  async findById(taskId: string) {
    return this.withSummary(await this.getTaskOrThrow(taskId));
  }

  async create(dto: CreateTaskDto) {
    const task: TaskItem = {
      id: createEntityId('task'),
      title: dto.title.trim(),
      className: dto.className,
      type: dto.type,
      statusCount: dto.statusCount ?? 3,
      createdAt: new Date().toISOString().slice(0, 10),
      students: dto.students ?? [],
    };
    return this.withSummary(await this.database.save(task));
  }

  async update(taskId: string, dto: UpdateTaskDto) {
    const task = await this.getTaskOrThrow(taskId);
    return this.withSummary(
      await this.database.save({ ...task, ...dto, id: taskId }),
    );
  }

  async updateStudentStatus(
    taskId: string,
    studentId: string,
    dto: UpdateTaskStudentStatusDto,
  ) {
    const task = await this.getTaskOrThrow(taskId);
    const students = task.students.map((student) =>
      student.id === studentId ? { ...student, ...dto } : student,
    );
    if (!students.some((student) => student.id === studentId))
      throw new NotFoundException('任务学生不存在');
    return this.withSummary(await this.database.save({ ...task, students }));
  }

  async cycleStudentStatus(taskId: string, studentId: string) {
    const task = await this.getTaskOrThrow(taskId);
    const students = task.students.map((student) => {
      if (student.id !== studentId) return student;
      const nextIndex =
        (statusOrder.indexOf(student.status) + 1) % statusOrder.length;
      return { ...student, status: statusOrder[nextIndex] ?? '未完成' };
    });
    return this.withSummary(await this.database.save({ ...task, students }));
  }

  async delete(taskId: string) {
    await this.getTaskOrThrow(taskId);
    await this.database.delete(taskId);
    return { deleted: true };
  }

  private async getTaskOrThrow(taskId: string) {
    const task = await this.database.findById(taskId);
    if (!task) throw new NotFoundException('任务不存在');
    return task;
  }

  /** 任务列表和详情都需要相同统计，统一在服务层计算。 */
  private withSummary(task: TaskItem) {
    const total = task.students.length;
    const done = task.students.filter(
      (student) => student.status === '已完成',
    ).length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    const statusPercents = statusOrder.map((status) => {
      const count = task.students.filter(
        (student) => student.status === status,
      ).length;
      return {
        status,
        count,
        percent: total > 0 ? Math.round((count / total) * 100) : 0,
      };
    });
    return { ...task, summary: { total, done, percent, statusPercents } };
  }
}
