import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { mergeMap } from 'rxjs/operators';
import { randomUUID } from 'node:crypto';
import { AnalyticsService } from './analytics.service';
import { TRACK_FEATURE } from './track-feature';
import type { AuthenticatedRequest } from '../auth/teacher-auth.guard';
@Injectable()
export class AnalyticsInterceptor implements NestInterceptor {
  /** 注入操作元数据读取器和统计服务，为显式标记的业务方法采集事件。 */
  constructor(
    private readonly reflector: Reflector,
    private readonly analytics: AnalyticsService,
  ) {}
  /** 仅采集显式标记的业务接口；读取、后台同步及未标记写入不会自动计入热度。 */
  intercept(context: ExecutionContext, next: CallHandler) {
    const meta = this.reflector.get<{
      feature: string;
      action: string;
      mode?: string;
    }>(TRACK_FEATURE, context.getHandler());
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!meta || !req.teacher) return next.handle();
    // 倒计时会频繁保存剩余秒数，只接受教师端在启动切换时附带的标识。
    if (
      meta.mode === 'countdown' &&
      (req.headers['x-countdown-start'] !== '1' || req.body?.isRunning !== true)
    )
      return next.handle();
    if (
      meta.mode === 'note' &&
      req.body?.title === undefined &&
      req.body?.content === undefined
    )
      return next.handle();
    const header = req.headers['x-analytics-event-id'];
    let eventId =
      typeof header === 'string' && /^[a-f0-9-]{36}$/i.test(header)
        ? header
        : randomUUID();
    // 同一便签在固定 30 秒时间桶内的内容自动保存合并计数；跨桶仍会记录新使用。
    if (meta.mode === 'note')
      eventId = `${req.params.noteId}:${Math.floor(Date.now() / 30000)}`;
    // 只在业务成功产生结果后写入；异常流不会进入此回调，也就不会产生成功使用事件。
    return next.handle().pipe(
      mergeMap(async (result) => {
        await this.analytics.record(
          req.teacher!.id,
          'use',
          meta.feature,
          meta.action,
          eventId,
        );
        return result;
      }),
    );
  }
}
