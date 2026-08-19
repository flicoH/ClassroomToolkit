import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeacherSessionEntity } from './entities/teacher-session.entity';
import { TeacherEntity } from './entities/teacher.entity';
import { TeacherAuthController } from './teacher-auth.controller';
import { TeacherAuthDatabase } from './teacher-auth.database';
import { TeacherAuthService } from './teacher-auth.service';

@Module({
  imports: [TypeOrmModule.forFeature([TeacherEntity, TeacherSessionEntity])],
  controllers: [TeacherAuthController],
  providers: [TeacherAuthDatabase, TeacherAuthService],
  exports: [TeacherAuthService],
})
export class TeacherAuthModule {}
