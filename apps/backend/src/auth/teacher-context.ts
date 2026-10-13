import {
  ForbiddenException,
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
  /** 业务表继续使用主账号 ID，避免迁移既有学生和报告归属。 */
  get teacherId() {
    const id = this.request.teacher?.ownerAccountId || this.request.teacher?.id;
    if (!id) throw new UnauthorizedException('未登录');
    return id;
  }
  get actorAccountId() {
    return this.request.teacher?.id || this.teacherId;
  }
  get actorDisplayName() {
    return this.request.teacher?.name || '教师';
  }
  get accountType() {
    return this.request.teacher?.accountType || 'main';
  }
  /** 基础配置共享，但仅主账号可维护。 */
  requireMainAccount() {
    if (this.accountType === 'sub')
      throw new ForbiddenException('此操作仅限主账号');
  }
}
