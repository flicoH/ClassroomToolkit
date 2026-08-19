import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { TaskEntity } from './task.entity';

@Entity('task_stats_students')
export class TaskStudentEntity {
  @Column({ name: 'teacher_id', length: 64 })
  teacherId!: string;

  @PrimaryColumn({ length: 64 })
  id!: string;

  @Column({ name: 'task_id', length: 64 })
  taskId!: string;

  @Column({ name: 'student_id', length: 64 })
  studentId!: string;

  @Column({ length: 64 })
  name!: string;

  @Column({ name: 'student_no', length: 64 })
  studentNo!: string;

  @Column({
    type: 'enum',
    enum: ['未完成', '已完成', '需订正'],
    default: '未完成',
  })
  status!: '未完成' | '已完成' | '需订正';

  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  score!: string | null;

  @ManyToOne(() => TaskEntity, (task) => task.students, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task!: TaskEntity;
}
