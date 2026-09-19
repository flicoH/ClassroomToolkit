import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('pet_points_settings')
export class PetSettingEntity {
  @PrimaryColumn({ name: 'teacher_id', length: 64 })
  teacherId!: string;

  @Column({ name: 'max_level', type: 'int', default: 10 })
  maxLevel!: number;

  @Column({ name: 'final_energy', type: 'int', default: 200 })
  finalEnergy!: number;
}
