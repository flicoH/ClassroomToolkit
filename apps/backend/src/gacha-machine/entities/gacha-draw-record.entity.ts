import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import type { GachaRarity } from '../gacha-machine.types';

@Entity('gacha_machine_draw_records')
export class GachaDrawRecordEntity {
  @Column({ name: 'teacher_id', length: 64 })
  teacherId!: string;

  @PrimaryColumn({ length: 64 })
  id!: string;

  @Column({ name: 'reward_id', length: 64 })
  rewardId!: string;

  @Column({ name: 'reward_name', length: 80 })
  rewardName!: string;

  @Column({ type: 'enum', enum: ['普通', '稀有', '史诗', '传说'] })
  rarity!: GachaRarity;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
