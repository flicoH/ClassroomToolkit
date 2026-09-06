import { Body, Controller, Post, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/teacher-auth.guard';
import { AnalyticsService } from './analytics.service';
import { RecordFeatureOpenDto } from './analytics.dto';
@Controller('analytics')
export class AnalyticsController {
  /** 注入统计服务，控制器不自行写入事件或信任客户端教师 ID。 */
  constructor(private readonly analytics: AnalyticsService) {}
  /** 使用教师守卫提供的身份上报功能打开事件，具体校验由统计服务执行。 */
  @Post('events')
  record(@Body() dto: RecordFeatureOpenDto, @Req() req: AuthenticatedRequest) {
    return this.analytics.recordOpen(req.teacher!.id, dto);
  }
}
