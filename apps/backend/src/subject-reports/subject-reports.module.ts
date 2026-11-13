import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassroomEntity } from '../students/entities/classroom.entity';
import { PetEvaluationRecordEntity } from '../pet-points/entities/pet-evaluation-record.entity';
import { PetStudentEntity } from '../pet-points/entities/pet-student.entity';
import { StudentEntity } from '../students/entities/student.entity';
import {
  ReportDocumentEntity,
  ReportSubjectEntity,
  ReportTermEntity,
} from '../semester-reports/semester-report.entity';
import {
  SubjectReportEntity,
  SubjectReportShareEntity,
  SubjectReportEventEntity,
  SubjectReportTokenCallEntity,
  SubjectReportSubjectEntity,
} from './subject-report.entity';
import { SemesterReportsModule } from '../semester-reports/semester-reports.module';
import { SubjectReportsController } from './subject-reports.controller';
import { SubjectReportsService } from './subject-reports.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClassroomEntity,
      ReportTermEntity,
      ReportSubjectEntity,
      SubjectReportSubjectEntity,
      ReportDocumentEntity,
      SubjectReportEntity,
      SubjectReportShareEntity,
      SubjectReportEventEntity,
      SubjectReportTokenCallEntity,
      PetStudentEntity,
      StudentEntity,
      PetEvaluationRecordEntity,
    ]),
    SemesterReportsModule,
  ],
  controllers: [SubjectReportsController],
  providers: [SubjectReportsService],
  exports: [SubjectReportsService],
})
export class SubjectReportsModule {}
