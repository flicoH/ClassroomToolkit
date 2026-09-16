import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('whiteboard_teaching_sessions')
export class WhiteboardSessionEntity {
  @Column({ name: 'teacher_id', length: 64 })
  teacherId!: string;

  @PrimaryColumn({ length: 64 })
  id!: string;

  @Column({ name: 'document_id', length: 64 })
  documentId!: string;

  @Column({ type: 'longtext' })
  pages!: string;

  @CreateDateColumn({ name: 'started_at' })
  startedAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ name: 'ended_at', type: 'datetime', precision: 3, nullable: true })
  endedAt!: Date | null;
}
