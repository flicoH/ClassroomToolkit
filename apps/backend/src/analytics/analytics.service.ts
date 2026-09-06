import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AnalyticsDatabase } from './analytics.database';
import { RecordFeatureOpenDto } from './analytics.dto';
import { FEATURES } from './features';
import type { EventKind } from './analytics.types';
import { createHash, randomUUID } from 'node:crypto';
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  /** 注入事件持久层，将客户端校验、去重键生成与数据库写入分离。 */
  constructor(private readonly database: AnalyticsDatabase) {}
  /** 校验客户端上报边界；有效使用只能从后端业务成功点采集。 */
  async recordOpen(teacherId: string, body: RecordFeatureOpenDto) {
    if (
      !body ||
      typeof body.feature !== 'string' ||
      !Object.hasOwn(FEATURES, body.feature) ||
      body.kind !== 'open' ||
      typeof body.eventId !== 'string' ||
      !/^[a-f0-9-]{36}$/i.test(body.eventId)
    ) {
      throw new BadRequestException('无效的功能事件');
    }
    return {
      accepted: await this.record(
        teacherId,
        'open',
        body.feature,
        'open',
        body.eventId,
      ),
    };
  }
  /** 尽力持久化统计事件；调用方复用 eventId 时保持幂等，写入失败不抛给课堂业务。 */
  async record(
    teacherId: string | null,
    kind: EventKind,
    feature?: string,
    action?: string,
    eventId: string = randomUUID(),
  ) {
    // 将身份和动作纳入唯一键：同一请求重试不重复计数，不同教师的事件互不覆盖。
    const key = createHash('sha256')
      .update(JSON.stringify([teacherId, kind, feature, action, eventId]))
      .digest('hex');
    try {
      await this.database.saveEvent({
        id: randomUUID(),
        teacherId,
        kind,
        feature: feature ?? null,
        action: action ?? null,
        dedupeKey: key,
      });
      return true;
    } catch {
      this.logger.error('统计事件写入失败');
      return false;
    }
  }
}
