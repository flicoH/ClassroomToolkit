import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ClassroomEntity } from './classroom.entity';

@Entity('student_students')
export class StudentEntity {
  @Column({ name: 'teacher_id', length: 64 })
  teacherId!: string;

  @PrimaryColumn({ length: 64 })
  id!: string;

  @Column({ name: 'classroom_id', length: 64 })
  classroomId!: string;

  @Column({ length: 64 })
  name!: string;

  @Column({ name: 'student_no', length: 64 })
  studentNo!: string;

  @Column({ type: 'enum', enum: ['男', '女', ''], default: '' })
  gender!: '男' | '女' | '';

  @Column({ name: 'group_name', type: 'varchar', length: 64, nullable: true })
  groupName!: string | null;

  @ManyToOne(() => ClassroomEntity, (classroom) => classroom.students, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'classroom_id' })
  classroom!: ClassroomEntity;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
