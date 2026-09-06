import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentEntity } from '../students/entities/student.entity';
import { ClassroomEntity } from '../students/entities/classroom.entity';
import { AnalyticsEventEntity } from '../analytics/entities/analytics-event.entity';
import { AnalyticsSettingEntity } from '../analytics/entities/analytics-setting.entity';
import { TeacherEntity } from '../teacher-auth/entities/teacher.entity';
import { AdminAuthModule } from './auth/admin-auth.module';
import { AdminDatabase } from './admin.database';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
/** 管理接口遵循 Controller / Service / Database 分层，认证模块独立注册。 */
@Module({
  imports: [
    AdminAuthModule,
    TypeOrmModule.forFeature([
      TeacherEntity,
      StudentEntity,
      ClassroomEntity,
      AnalyticsEventEntity,
      AnalyticsSettingEntity,
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminDatabase, AdminService],
})
export class AdminModule {}
