import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsEventEntity } from './entities/analytics-event.entity';
import type { AnalyticsEvent } from './analytics.types';
@Injectable()
export class AnalyticsDatabase {
  /** 注入统计事件仓库，统一处理事件的持久化与数据库级去重。 */
  constructor(
    @InjectRepository(AnalyticsEventEntity)
    private readonly events: Repository<AnalyticsEventEntity>,
  ) {}
  /** 唯一约束处理并发重试；冲突时仅更新相同去重键，保留第一次事件的时间和内容。 */
  async saveEvent(event: AnalyticsEvent): Promise<void> {
    await this.events
      .createQueryBuilder()
      .insert()
      .values({ ...event, createdAt: () => 'UTC_TIMESTAMP(3)' })
      .orUpdate(['dedupe_key'], ['dedupe_key'])
      .execute();
  }
}
