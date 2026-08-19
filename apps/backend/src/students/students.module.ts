import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassroomEntity } from './entities/classroom.entity';
import { StudentGroupEntity } from './entities/student-group.entity';
import { StudentEntity } from './entities/student.entity';
import { StudentsController } from './students.controller';
import { StudentsDatabase } from './students.database';
import { StudentsService } from './students.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClassroomEntity,
      StudentGroupEntity,
      StudentEntity,
    ]),
  ],
  controllers: [StudentsController],
  providers: [StudentsDatabase, StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
