import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('sticky_notes_notes')
export class StickyNoteEntity {
  @Column({ name: 'teacher_id', length: 64 })
  teacherId!: string;

  @PrimaryColumn({ length: 64 })
  id!: string;

  @Column({ length: 128 })
  title!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'enum', enum: ['yellow', 'blue', 'green', 'pink', 'purple'] })
  color!: 'yellow' | 'blue' | 'green' | 'pink' | 'purple';

  @Column({ type: 'boolean', default: false })
  pinned!: boolean;

  @Column({ name: 'updated_at', length: 16 })
  updatedAt!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
