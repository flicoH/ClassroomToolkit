import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TeacherAuthModule } from '../teacher-auth/teacher-auth.module';
import { TeacherAuthGuard } from './teacher-auth.guard';
import { TeacherContext } from './teacher-context';

@Global()
@Module({
  imports: [TeacherAuthModule],
  providers: [
    TeacherContext,
    { provide: APP_GUARD, useClass: TeacherAuthGuard },
  ],
  exports: [TeacherContext],
})
export class AuthModule {}
