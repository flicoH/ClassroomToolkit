import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  Index,
} from 'typeorm';
import type { EventKind } from '../analytics.types';
/** 不对教师建立级联删除关联，保留账号删除后的历史统计。 */
@Entity('analytics_events')
@Index('idx_analytics_time', ['createdAt', 'kind'])
@Index('idx_analytics_teacher', ['teacherId', 'createdAt'])
@Index('idx_analytics_feature', ['feature', 'kind', 'createdAt'])
export class AnalyticsEventEntity {
  @PrimaryColumn({ length: 64 }) id!: string;
  @Column({ name: 'teacher_id', type: 'varchar', length: 64, nullable: true })
  teacherId!: string | null;
  @Column({ type: 'varchar', length: 32 }) kind!: EventKind;
  @Column({ type: 'varchar', length: 32, nullable: true }) feature!:
    | string
    | null;
  @Column({ type: 'varchar', length: 64, nullable: true }) action!:
    | string
    | null;
  @Column({ name: 'dedupe_key', length: 64, unique: true }) dedupeKey!: string;
  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt!: Date;
}
