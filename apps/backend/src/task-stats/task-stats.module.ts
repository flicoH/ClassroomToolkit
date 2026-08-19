import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskStudentEntity } from './entities/task-student.entity';
import { TaskEntity } from './entities/task.entity';
import { TaskStatsController } from './task-stats.controller';
import { TaskStatsDatabase } from './task-stats.database';
import { TaskStatsService } from './task-stats.service';

@Module({
  imports: [TypeOrmModule.forFeature([TaskEntity, TaskStudentEntity])],
  controllers: [TaskStatsController],
  providers: [TaskStatsDatabase, TaskStatsService],
})
export class TaskStatsModule {}
