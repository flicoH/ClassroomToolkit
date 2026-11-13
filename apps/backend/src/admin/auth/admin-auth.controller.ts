import { LoginAdminDto } from './admin-auth.dto';
import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../auth/public.decorator';
import { AdminAccess } from './admin-access';
import { AdminAuthService } from './admin-auth.service';
import type { AdminRequest } from './admin-auth.guard';
@Controller('admin/auth')
@AdminAccess()
export class AdminAuthController {
  /** 注入管理员认证服务，控制器负责 Cookie 的设置与清除。 */
  constructor(private readonly auth: AdminAuthService) {}
  /** 令牌通过 HttpOnly Cookie 传递，作用域仅为 /admin；生产环境 HTTPS 默认启用 Secure。 */
  private cookieOptions(req?: AdminRequest) {
    const isExplicitFalse = process.env.ADMIN_COOKIE_SECURE === 'false';
    const isExplicitTrue = process.env.ADMIN_COOKIE_SECURE === 'true';
    const isProduction = process.env.NODE_ENV === 'production';

    const isHttps =
      Boolean(req?.secure) ||
      req?.headers?.['x-forwarded-proto'] === 'https' ||
      req?.headers?.['x-forwarded-protocol'] === 'https';

    let secure = false;
    if (isExplicitFalse) {
      secure = false;
    } else if (isExplicitTrue) {
      secure = true;
    } else if (isProduction) {
      // 生产环境未显式配置时，若客户端经由 HTTP 访问，自动避免使用 Secure，防止浏览器因安全策略丢弃 Cookie
      secure = req ? isHttps : true;
    }

    return {
      httpOnly: true,
      sameSite: 'strict' as const,
      secure,
      path: '/admin',
    };
  }
  /** 验证管理员凭据，将会话写入 HttpOnly Cookie，仅向页面返回身份资料。 */
  @Post('login')
  @Public()
  async login(
    @Body() body: LoginAdminDto,
    @Req() req: AdminRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(body, req.ip ?? 'unknown');
    res.cookie('classroom_admin', result.token, {
      ...this.cookieOptions(req),
      maxAge: 8 * 3600_000,
    });
    res.setHeader('Cache-Control', 'no-store');
    return result.profile;
  }
  /** 返回守卫已验证并附加到请求上的管理员资料。 */
  @Get('me') me(@Req() req: AdminRequest) {
    return req.admin;
  }
  /** 撤销服务端会话并清除管理 Cookie，使当前登录立即失效。 */
  @Post('logout') async logout(
    @Req() req: AdminRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(req.adminToken!);
    res.clearCookie('classroom_admin', this.cookieOptions(req));
    return { loggedOut: true };
  }
}
