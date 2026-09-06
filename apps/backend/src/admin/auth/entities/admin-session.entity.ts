import {
  Column,
  Entity,
  PrimaryColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AdminAccountEntity } from './admin-account.entity';
@Entity('admin_sessions')
export class AdminSessionEntity {
  @PrimaryColumn({ name: 'token_hash', length: 64 }) tokenHash!: string;
  @Column({ name: 'admin_id', length: 64 }) adminId!: string;
  @Index('idx_admin_session_expiry')
  @Column({ name: 'expires_at', type: 'datetime', precision: 3 })
  expiresAt!: Date;
  @ManyToOne(() => AdminAccountEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'admin_id' })
  admin!: AdminAccountEntity;
}
