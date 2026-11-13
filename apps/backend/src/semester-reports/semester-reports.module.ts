import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassroomEntity } from '../students/entities/classroom.entity';
import { PetEvaluationRecordEntity } from '../pet-points/entities/pet-evaluation-record.entity';
import { PetStudentEntity } from '../pet-points/entities/pet-student.entity';
import { StudentEntity } from '../students/entities/student.entity';
import { ReportAiTeacherPermissionEntity } from '../admin/entities/report-ai-teacher-permission.entity';
import {
  ReportDocumentEntity,
  ReportEventEntity,
  ReportShareEntity,
  ReportSubjectEntity,
  ReportTermEntity,
  SemesterReportEntity,
  SemesterReportTokenCallEntity,
} from './semester-report.entity';
import { SemesterReportsController } from './semester-reports.controller';
import { SemesterReportsService } from './semester-reports.service';
import { SemesterReportWorker } from './semester-report.worker';
import { ScheduledTasksEventsService } from './scheduled-tasks-events.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClassroomEntity,
      ReportTermEntity,
      ReportSubjectEntity,
      ReportDocumentEntity,
      SemesterReportEntity,
      ReportShareEntity,
      ReportEventEntity,
      SemesterReportTokenCallEntity,
      PetStudentEntity,
      StudentEntity,
      PetEvaluationRecordEntity,
      ReportAiTeacherPermissionEntity,
    ]),
  ],
  controllers: [SemesterReportsController],
  providers: [
    SemesterReportsService,
    SemesterReportWorker,
    ScheduledTasksEventsService,
  ],
  exports: [SemesterReportsService, ScheduledTasksEventsService],
})
export class SemesterReportsModule {}
