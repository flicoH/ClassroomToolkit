import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** 根路径健康检查，公开访问不需要教师登录。 */
  @Get()
  @Public()
  getHello(): string {
    return this.appService.getHello();
  }
}
