import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { ClassroomEntity } from './classroom.entity';

@Entity('student_groups')
export class StudentGroupEntity {
  @Column({ name: 'teacher_id', length: 64 })
  teacherId!: string;

  @PrimaryColumn({ length: 64 })
  id!: string;

  @Column({ name: 'classroom_id', length: 64 })
  classroomId!: string;

  @Column({ length: 64 })
  name!: string;

  @ManyToOne(() => ClassroomEntity, (classroom) => classroom.groups, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'classroom_id' })
  classroom!: ClassroomEntity;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
