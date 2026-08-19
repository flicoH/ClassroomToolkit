import {
  Inject,
  Injectable,
  Scope,
  UnauthorizedException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { AuthenticatedRequest } from './teacher-auth.guard';

@Injectable({ scope: Scope.REQUEST })
export class TeacherContext {
  constructor(
    @Inject(REQUEST) private readonly request: AuthenticatedRequest,
  ) {}

  get teacherId() {
    const teacherId = this.request.teacher?.id;
    if (!teacherId) throw new UnauthorizedException('未登录');
    return teacherId;
  }
}
