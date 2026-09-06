import type { AdminProfile } from './admin-auth.types';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ADMIN_ACCESS } from './admin-access';
import { IS_PUBLIC_ROUTE } from '../../auth/public.decorator';
import { AdminAuthService } from './admin-auth.service';
export type AdminRequest = Request & {
  admin?: AdminProfile;
  adminToken?: string;
};
/** 仅读取管理端专用 Cookie，不复用教师端 Bearer 令牌。 */
export function adminToken(request: Request): string {
  return (
    (request.headers.cookie ?? '')
      .split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith('classroom_admin='))
      ?.slice('classroom_admin='.length) ?? ''
  );
}
@Injectable()
export class AdminAuthGuard implements CanActivate {
  /** 注入路由元数据读取器与管理员认证服务，执行身份域内的访问控制。 */
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AdminAuthService,
  ) {}
  // 只处理带 AdminAccess 标记的路由；其余路由继续由教师守卫负责。
  /** 校验管理身份域、写请求防护头和会话；非管理路由交由教师守卫处理。 */
  async canActivate(context: ExecutionContext) {
    if (
      !this.reflector.getAllAndOverride(ADMIN_ACCESS, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const req = context.switchToHttp().getRequest<AdminRequest>();
    // SameSite Cookie 与自定义请求头共同防护 CSRF；公开的管理员登录接口也必须经过此检查。
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers['x-admin-request'] !== '1'
    )
      throw new ForbiddenException('无效的管理请求');
    if (
      this.reflector.getAllAndOverride(IS_PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    req.adminToken = adminToken(req);
    req.admin = await this.auth.authenticate(req.adminToken);
    return true;
  }
}
