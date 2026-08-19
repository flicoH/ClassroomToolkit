import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('pet_points_redemptions')
export class PetRedemptionEntity {
  @Column({ name: 'teacher_id', length: 64 })
  teacherId!: string;

  @PrimaryColumn({ length: 64 })
  id!: string;

  @Column({ name: 'student_id', length: 64 })
  studentId!: string;

  @Column({ name: 'reward_name', length: 64 })
  rewardName!: string;

  @Column({ type: 'int' })
  cost!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
