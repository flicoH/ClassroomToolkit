import { TrackFeature } from '../analytics/track-feature';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  CreateTaskDto,
  UpdateTaskDto,
  UpdateTaskStudentStatusDto,
} from './task-stats.dto';
import { TaskStatsService } from './task-stats.service';

@Controller('task-stats')
export class TaskStatsController {
  constructor(private readonly taskStatsService: TaskStatsService) {}

  /** 获取任务统计列表。 */
  @Get()
  findAll() {
    return this.taskStatsService.findAll();
  }

  /** 获取单个任务及其统计汇总。 */
  @Get(':taskId')
  findById(@Param('taskId') taskId: string) {
    return this.taskStatsService.findById(taskId);
  }

  /** 创建任务统计。 */
  @Post()
  @TrackFeature('task-stats', 'create')
  create(@Body() dto: CreateTaskDto) {
    return this.taskStatsService.create(dto);
  }

  /** 更新任务基础配置。 */
  @Patch(':taskId')
  update(@Param('taskId') taskId: string, @Body() dto: UpdateTaskDto) {
    return this.taskStatsService.update(taskId, dto);
  }

  /** 设置指定学生的任务状态和可选分数。 */
  @Patch(':taskId/students/:studentId/status')
  @TrackFeature('task-stats', 'status')
  updateStudentStatus(
    @Param('taskId') taskId: string,
    @Param('studentId') studentId: string,
    @Body() dto: UpdateTaskStudentStatusDto,
  ) {
    return this.taskStatsService.updateStudentStatus(taskId, studentId, dto);
  }

  /** 按固定状态顺序切换学生任务状态。 */
  @Post(':taskId/students/:studentId/cycle-status')
  @TrackFeature('task-stats', 'status')
  cycleStudentStatus(
    @Param('taskId') taskId: string,
    @Param('studentId') studentId: string,
  ) {
    return this.taskStatsService.cycleStudentStatus(taskId, studentId);
  }

  /** 删除任务统计。 */
  @Delete(':taskId')
  delete(@Param('taskId') taskId: string) {
    return this.taskStatsService.delete(taskId);
  }
}
