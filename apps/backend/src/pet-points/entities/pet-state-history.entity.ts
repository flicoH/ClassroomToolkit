import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type PetAppearance = {
  petId: string | null;
  petName: string | null;
  stage: string;
  level: number;
  petHatched: boolean;
};

/** Immutable observations, independent of deletable score records and live settings. */
@Entity('pet_points_state_history')
@Index('idx_pet_history_as_of', ['teacherId', 'studentId', 'recordedAt', 'id'])
export class PetStateHistoryEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true }) id!: string;
  @Column({ name: 'teacher_id', length: 64 }) teacherId!: string;
  @Column({ name: 'student_id', length: 64 }) studentId!: string;
  @Column({ name: 'recorded_at', type: 'datetime', precision: 3 })
  recordedAt!: Date;
  // A null observation ends tracking when a student leaves the class roster.
  @Column({ type: 'json', nullable: true }) pet!: PetAppearance | null;
}
