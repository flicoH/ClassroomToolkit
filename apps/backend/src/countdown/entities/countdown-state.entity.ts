import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('countdown_states')
export class CountdownStateEntity {
  @Column({ name: 'teacher_id', length: 64 })
  teacherId!: string;

  @PrimaryColumn({ length: 64 })
  id!: string;

  @Column({ name: 'total_seconds', type: 'int' })
  totalSeconds!: number;

  @Column({ name: 'remaining_seconds', type: 'int' })
  remainingSeconds!: number;

  @Column({ name: 'is_running', type: 'boolean', default: false })
  isRunning!: boolean;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
