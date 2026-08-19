import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StudentGroupEntity } from './student-group.entity';
import { StudentEntity } from './student.entity';

@Entity('student_classrooms')
export class ClassroomEntity {
  @Column({ name: 'teacher_id', length: 64 })
  teacherId!: string;

  @PrimaryColumn({ length: 64 })
  id!: string;

  @Column({ length: 64 })
  name!: string;

  @OneToMany(() => StudentGroupEntity, (group) => group.classroom, {
    cascade: true,
  })
  groups!: StudentGroupEntity[];

  @OneToMany(() => StudentEntity, (student) => student.classroom, {
    cascade: true,
  })
  students!: StudentEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
