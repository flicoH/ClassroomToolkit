import {
  Column,
  Entity,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TaskStudentEntity } from './task-student.entity';

@Entity('task_stats_tasks')
export class TaskEntity {
  @Column({ name: 'teacher_id', length: 64 })
  teacherId!: string;

  @PrimaryColumn({ length: 64 })
  id!: string;

  @Column({ length: 128 })
  title!: string;

  @Column({ name: 'class_name', length: 64 })
  className!: string;

  @Column({ name: 'task_type', type: 'enum', enum: ['status', 'score'] })
  type!: 'status' | 'score';

  @Column({ name: 'status_count', type: 'int', default: 3 })
  statusCount!: number;

  @Column({ name: 'created_at', type: 'date' })
  createdAt!: string;

  @OneToMany(() => TaskStudentEntity, (student) => student.task, {
    cascade: true,
  })
  students!: TaskStudentEntity[];

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
