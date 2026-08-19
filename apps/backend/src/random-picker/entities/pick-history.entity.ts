import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import { PickHistoryStudentEntity } from './pick-history-student.entity';

@Entity('random_picker_histories')
export class PickHistoryEntity {
  @Column({ name: 'teacher_id', length: 64 })
  teacherId!: string;

  @PrimaryColumn({ length: 64 })
  id!: string;

  @Column({ name: 'class_id', length: 64 })
  classId!: string;

  @Column({ name: 'selected_count', type: 'int' })
  selectedCount!: number;

  @OneToMany(() => PickHistoryStudentEntity, (student) => student.history, {
    cascade: true,
  })
  students!: PickHistoryStudentEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
