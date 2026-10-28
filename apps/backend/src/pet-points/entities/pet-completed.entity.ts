import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { CompletedPet } from '../pet-points.types';
@Entity('pet_points_completed')
@Index('uq_pet_completed_cycle', ['teacherId', 'studentId', 'cycleId'], {
  unique: true,
})
export class PetCompletedEntity {
  @PrimaryColumn({ length: 64 }) id!: string;
  @Column({ name: 'teacher_id', length: 64 }) teacherId!: string;
  @Column({ name: 'student_id', length: 64 }) studentId!: string;
  @Column({ name: 'cycle_id', length: 64 }) cycleId!: string;
  @Column({ type: 'json' }) snapshot!: CompletedPet;
}
