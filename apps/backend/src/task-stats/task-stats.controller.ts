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

  @Get()
  findAll() {
    return this.taskStatsService.findAll();
  }

  @Get(':taskId')
  findById(@Param('taskId') taskId: string) {
    return this.taskStatsService.findById(taskId);
  }

  @Post()
  create(@Body() dto: CreateTaskDto) {
    return this.taskStatsService.create(dto);
  }

  @Patch(':taskId')
  update(@Param('taskId') taskId: string, @Body() dto: UpdateTaskDto) {
    return this.taskStatsService.update(taskId, dto);
  }

  @Patch(':taskId/students/:studentId/status')
  updateStudentStatus(
    @Param('taskId') taskId: string,
    @Param('studentId') studentId: string,
    @Body() dto: UpdateTaskStudentStatusDto,
  ) {
    return this.taskStatsService.updateStudentStatus(taskId, studentId, dto);
  }

  @Post(':taskId/students/:studentId/cycle-status')
  cycleStudentStatus(
    @Param('taskId') taskId: string,
    @Param('studentId') studentId: string,
  ) {
    return this.taskStatsService.cycleStudentStatus(taskId, studentId);
  }

  @Delete(':taskId')
  delete(@Param('taskId') taskId: string) {
    return this.taskStatsService.delete(taskId);
  }
}
