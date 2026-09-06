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

  /** 查询任务列表，并为每项附加统计摘要。 */
  async findAll() {
    const tasks = await this.database.findAll();
    return tasks.map((task) => this.withSummary(task));
  }

  /** 查询单个任务，不存在时抛出异常。 */
  async findById(taskId: string) {
    return this.withSummary(await this.getTaskOrThrow(taskId));
  }

  /** 创建任务并写入初始学生状态。 */
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

  /** 更新任务配置后重新计算统计摘要。 */
  async update(taskId: string, dto: UpdateTaskDto) {
    const task = await this.getTaskOrThrow(taskId);
    return this.withSummary(
      await this.database.save({ ...task, ...dto, id: taskId }),
    );
  }

  /** 更新单个学生状态或分数，并返回最新任务摘要。 */
  async updateStudentStatus(
    taskId: string,
    studentId: string,
    dto: UpdateTaskStudentStatusDto,
  ) {
    await this.getTaskOrThrow(taskId);
    const updated = await this.database.updateStudentStatus(
      taskId,
      studentId,
      dto.status,
      dto.score,
    );
    if (!updated) throw new NotFoundException('任务学生不存在');
    return this.withSummary(await this.getTaskOrThrow(taskId));
  }

  /** 将学生状态切换到下一个状态，并返回最新任务摘要。 */
  async cycleStudentStatus(taskId: string, studentId: string) {
    await this.getTaskOrThrow(taskId);
    const updated = await this.database.cycleStudentStatus(taskId, studentId);
    if (!updated) throw new NotFoundException('任务学生不存在');
    return this.withSummary(await this.getTaskOrThrow(taskId));
  }

  /** 删除任务并返回统一删除结果。 */
  async delete(taskId: string) {
    await this.getTaskOrThrow(taskId);
    await this.database.delete(taskId);
    return { deleted: true };
  }

  /** 查询任务，不存在时抛出业务异常。 */
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
