import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsDatabase } from './analytics.database';
import { AnalyticsEventEntity } from './entities/analytics-event.entity';
import { AnalyticsSettingEntity } from './entities/analytics-setting.entity';
import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsInterceptor } from './analytics.interceptor';
/** 全局提供事件写入能力，供教师认证与业务拦截器共用，不依赖管理员身份。 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([AnalyticsEventEntity, AnalyticsSettingEntity]),
  ],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsDatabase,
    AnalyticsService,
    { provide: APP_INTERCEPTOR, useClass: AnalyticsInterceptor },
  ],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
