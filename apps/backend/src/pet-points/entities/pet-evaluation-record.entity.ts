import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('pet_points_evaluation_records')
export class PetEvaluationRecordEntity {
  @Column({ name: 'teacher_id', length: 64 })
  teacherId!: string;

  @PrimaryColumn({ length: 64 })
  id!: string;

  @Column({ name: 'student_id', length: 64 })
  studentId!: string;

  @Column({ length: 32 })
  category!: string;

  @Column({ length: 64 })
  label!: string;

  @Column({ name: 'delta_score', type: 'int' })
  delta!: number;

  @Column({ name: 'pet_delta', type: 'int', nullable: true })
  petDelta!: number | null;

  @Column({ length: 255, default: '' })
  note!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
