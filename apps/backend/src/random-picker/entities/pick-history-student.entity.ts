import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PickHistoryEntity } from './pick-history.entity';

@Entity('random_picker_history_students')
export class PickHistoryStudentEntity {
  @Column({ name: 'teacher_id', length: 64 })
  teacherId!: string;

  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'history_id', length: 64 })
  historyId!: string;

  @Column({ name: 'student_id', length: 64 })
  studentId!: string;

  @Column({ length: 64 })
  name!: string;

  @Column({ name: 'student_no', length: 64 })
  studentNo!: string;

  @ManyToOne(() => PickHistoryEntity, (history) => history.students, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'history_id' })
  history!: PickHistoryEntity;
}
