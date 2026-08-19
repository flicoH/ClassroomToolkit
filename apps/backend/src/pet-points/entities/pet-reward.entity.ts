import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('pet_points_rewards')
export class PetRewardEntity {
  @Column({ name: 'teacher_id', length: 64 })
  teacherId!: string;

  @PrimaryColumn({ length: 64 })
  id!: string;

  @Column({ length: 64 })
  name!: string;

  @Column({ type: 'int' })
  cost!: number;

  @Column({ type: 'int' })
  stock!: number;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;
}
