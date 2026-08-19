import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import type { GachaRarity } from '../gacha-machine.types';

@Entity('gacha_machine_rewards')
export class GachaRewardEntity {
  @Column({ name: 'teacher_id', length: 64 })
  teacherId!: string;

  @PrimaryColumn({ length: 64 })
  id!: string;

  @Column({ length: 80 })
  name!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'enum', enum: ['普通', '稀有', '史诗', '传说'] })
  rarity!: GachaRarity;

  @Column({ type: 'int', default: 10 })
  weight!: number;

  @Column({ type: 'int', default: 0 })
  stock!: number;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
