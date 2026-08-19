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

  @Post('register')
  @Public()
  register(@Body() dto: RegisterTeacherDto) {
    return this.teacherAuthService.register(dto);
  }

  @Post('login')
  @Public()
  login(@Body() dto: LoginTeacherDto) {
    return this.teacherAuthService.login(dto);
  }

  @Get('me')
  me(@Req() request: AuthenticatedRequest) {
    return request.teacher;
  }

  @Post('logout')
  logout(@Body() dto: LogoutTeacherDto, @Req() request: AuthenticatedRequest) {
    return this.teacherAuthService.logout({
      token: request.authToken || dto.token,
    });
  }
}
