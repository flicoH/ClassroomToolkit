import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/teacher-auth.guard';
import { Public } from '../auth/public.decorator';
import {
  LoginTeacherDto,
  LogoutTeacherDto,
  RegisterTeacherDto,
} from './teacher-auth.dto';
import { TeacherAuthService } from './teacher-auth.service';

@Controller('auth/teacher')
export class TeacherAuthController {
  constructor(private readonly teacherAuthService: TeacherAuthService) {}

  /** 注册教师账号并返回登录态。 */
  @Post('register')
  @Public()
  register(@Body() dto: RegisterTeacherDto) {
    return this.teacherAuthService.register(dto);
  }

  /** 教师账号登录。 */
  @Post('login')
  @Public()
  login(@Body() dto: LoginTeacherDto) {
    return this.teacherAuthService.login(dto);
  }

  /** 返回当前教师登录资料。 */
  @Get('me')
  me(@Req() request: AuthenticatedRequest) {
    return request.teacher;
  }

  /** 注销当前教师会话。 */
  @Post('logout')
  logout(@Body() dto: LogoutTeacherDto, @Req() request: AuthenticatedRequest) {
    return this.teacherAuthService.logout({
      token: request.authToken || dto.token,
    });
  }
}
