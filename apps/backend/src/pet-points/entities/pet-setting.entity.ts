import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('pet_points_settings')
export class PetSettingEntity {
  @PrimaryColumn({ name: 'teacher_id', length: 64 })
  teacherId!: string;

  @Column({ name: 'max_level', type: 'int', default: 10 })
  maxLevel!: number;

  @Column({ name: 'final_energy', type: 'int', default: 200 })
  finalEnergy!: number;
  @Column({ name: 'completion_badges', type: 'double', default: 1 })
  completionBadges!: number;

  @Column({ type: 'int', default: 1 })
  version!: number;
}
