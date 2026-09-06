import { Column, Entity, PrimaryColumn } from 'typeorm';
/** 迁移写入唯一一行采集起点，不能以第一条业务事件代替。 */
@Entity('analytics_settings')
export class AnalyticsSettingEntity {
  @PrimaryColumn({ type: 'tinyint' }) id!: number;
  @Column({ name: 'started_at', type: 'datetime', precision: 3 })
  startedAt!: Date;
}
