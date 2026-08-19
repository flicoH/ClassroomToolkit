import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { TeacherAuthService } from '../teacher-auth/teacher-auth.service';
import type { TeacherProfile } from '../teacher-auth/teacher-auth.types';
import { IS_PUBLIC_ROUTE } from './public.decorator';

export type AuthenticatedRequest = Request & {
  teacher?: TeacherProfile;
  authToken?: string;
};

@Injectable()
export class TeacherAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly teacherAuthService: TeacherAuthService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_ROUTE,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization ?? '';
    const token = authorization.startsWith('Bearer ')
      ? authorization.slice(7).trim()
      : '';
    if (!token) throw new UnauthorizedException('未登录');

    request.teacher = await this.teacherAuthService.authenticate(token);
    request.authToken = token;
    return true;
  }
}
