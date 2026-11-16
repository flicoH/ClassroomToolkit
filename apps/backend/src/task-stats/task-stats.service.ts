import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createEntityId } from '../common/id';
import {
  CreateTaskDto,
  UpdateTaskDto,
  UpdateTaskStudentStatusDto,
} from './task-stats.dto';
import { TaskStatsDatabase } from './task-stats.database';
import { StudentStatus, TaskItem } from './task-stats.types';

const statusOrder: StudentStatus[] = ['已完成', '待改正', '未完成'];

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
    if (
      typeof dto.title !== 'string' ||
      !dto.title.trim() ||
      dto.title.trim().length > 128 ||
      (dto.type !== 'status' && dto.type !== 'score')
    ) {
      throw new BadRequestException('任务标题或类型无效');
    }
    if (dto.items !== undefined && !Array.isArray(dto.items))
      throw new BadRequestException('子项格式无效');
    const titles = (dto.items ?? []).map((item) =>
      typeof item?.title === 'string' ? item.title.trim() : '',
    );
    if (
      titles.some((title) => !title || title.length > 128) ||
      new Set(titles).size !== titles.length ||
      (titles.length && dto.type !== 'status')
    ) {
      throw new BadRequestException(
        '子项名称须为 1–128 字符且不能重复，只有状态任务支持子项',
      );
    }
    if (titles.length && !dto.classId)
      throw new BadRequestException('请选择班级');
    const classroom = dto.classId
      ? await this.database.findClass(dto.classId)
      : undefined;
    if (dto.classId && !classroom) throw new NotFoundException('班级不存在');
    const task: TaskItem = {
      id: createEntityId('task'),
      title: dto.title.trim(),
      className: classroom?.name ?? dto.className,
      type: dto.type,
      statusCount: 3,
      createdAt: new Date().toISOString().slice(0, 10),
      items: titles.map((title) => ({ id: createEntityId('item'), title })),
      students: classroom?.students ?? dto.students ?? [],
    };
    return this.withSummary(await this.database.save(task));
  }

  /** 更新任务配置后重新计算统计摘要。 */
  async update(taskId: string, dto: UpdateTaskDto) {
    const task = await this.getTaskOrThrow(taskId);
    const title =
      dto.title === undefined
        ? task.title
        : typeof dto.title === 'string'
          ? dto.title.trim()
          : '';
    if (!title || title.length > 128)
      throw new BadRequestException('任务标题无效');
    await this.database.updateConfiguration({
      ...task,
      title,
      className: task.items?.length
        ? task.className
        : (dto.className ?? task.className),
      type: task.items?.length ? task.type : (dto.type ?? task.type),
      statusCount: 3,
    });
    return this.findById(taskId);
  }

  async setChecked(
    taskId: string,
    studentId: string,
    itemId: string,
    checked: boolean,
  ) {
    if (typeof checked !== 'boolean')
      throw new BadRequestException('checked 必须是布尔值');
    const task = await this.getTaskOrThrow(taskId);
    if (!task.items?.some((item) => item.id === itemId))
      throw new NotFoundException('任务子项不存在');
    const checkedItemIds = await this.database.setChecked(
      taskId,
      studentId,
      itemId,
      checked,
    );
    if (!checkedItemIds) throw new NotFoundException('任务学生不存在');
    // 只返回被修改的学生，避免并行请求把其他学生的状态覆盖回旧值。
    return {
      id: studentId,
      checkedItemIds,
      status: this.deriveStatus(task, checkedItemIds),
    };
  }

  async reset(taskId: string) {
    await this.getTaskOrThrow(taskId);
    await this.database.reset(taskId);
    return this.findById(taskId);
  }

  /** 更新单个学生状态或分数，并返回最新任务摘要。 */
  async updateStudentStatus(
    taskId: string,
    studentId: string,
    dto: UpdateTaskStudentStatusDto,
  ) {
    const task = await this.getTaskOrThrow(taskId);
    if (task.items?.length)
      throw new ConflictException('带子项任务由勾选决定状态');
    if (dto.status !== '需订正' && !statusOrder.includes(dto.status))
      throw new BadRequestException('任务状态无效');
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
    const task = await this.getTaskOrThrow(taskId);
    if (task.items?.length)
      throw new ConflictException('带子项任务由勾选决定状态');
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

  private deriveStatus(
    task: TaskItem,
    checkedItemIds: string[],
  ): StudentStatus {
    const items = task.items ?? [];
    const count = items.filter((item) =>
      checkedItemIds.includes(item.id),
    ).length;
    return count === 0
      ? '未完成'
      : count === items.length
        ? '已完成'
        : '待改正';
  }

  /** 任务列表和详情都需要相同统计，统一在服务层计算。 */
  private withSummary(task: TaskItem) {
    const students = task.students.map((student) => ({
      ...student,
      status: task.items?.length
        ? this.deriveStatus(task, student.checkedItemIds ?? [])
        : student.status === '需订正'
          ? '待改正'
          : student.status,
    }));
    const total = students.length;
    const done = students.filter(
      (student) => student.status === '已完成',
    ).length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    const statusPercents = statusOrder.map((status) => {
      const count = students.filter(
        (student) => student.status === status,
      ).length;
      return {
        status,
        count,
        percent: total > 0 ? Math.round((count / total) * 100) : 0,
      };
    });
    return {
      ...task,
      statusCount: 3,
      students,
      summary: { total, done, percent, statusPercents },
    };
  }
}
