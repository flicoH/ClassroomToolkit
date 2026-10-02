import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PetEvaluationRecordEntity } from '../pet-points/entities/pet-evaluation-record.entity';
import { PetStudentEntity } from '../pet-points/entities/pet-student.entity';
import {
  ReportDocumentEntity,
  ReportEventEntity,
  ReportShareEntity,
  ReportSubjectEntity,
  ReportTermEntity,
  SemesterReportEntity,
} from './semester-report.entity';
import { SemesterReportsController } from './semester-reports.controller';
import { SemesterReportsService } from './semester-reports.service';
import { SemesterReportWorker } from './semester-report.worker';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReportTermEntity,
      ReportSubjectEntity,
      ReportDocumentEntity,
      SemesterReportEntity,
      ReportShareEntity,
      ReportEventEntity,
      PetStudentEntity,
      PetEvaluationRecordEntity,
    ]),
  ],
  controllers: [SemesterReportsController],
  providers: [SemesterReportsService, SemesterReportWorker],
})
export class SemesterReportsModule {}
