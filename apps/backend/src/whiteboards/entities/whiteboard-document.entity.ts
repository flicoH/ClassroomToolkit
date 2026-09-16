import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('whiteboard_documents')
export class WhiteboardDocumentEntity {
  @Column({ name: 'teacher_id', length: 64 })
  teacherId!: string;

  @PrimaryColumn({ length: 64 })
  id!: string;

  @Column({ length: 128 })
  title!: string;

  @Column({ type: 'longtext' })
  pages!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
