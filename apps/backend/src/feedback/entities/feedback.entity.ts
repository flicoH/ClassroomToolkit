import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('teacher_feedback')
export class FeedbackEntity {
  @PrimaryColumn({ length: 64 })
  id!: string;

  @Column({ name: 'teacher_id', length: 64 })
  teacherId!: string;

  @Column({ type: 'text' })
  content!: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt!: Date;
}
