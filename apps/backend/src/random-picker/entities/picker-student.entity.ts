import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { PickerClassEntity } from './picker-class.entity';

@Entity('random_picker_students')
export class PickerStudentEntity {
  @Column({ name: 'teacher_id', length: 64 })
  teacherId!: string;

  @PrimaryColumn({ length: 64 })
  id!: string;

  @Column({ name: 'class_id', length: 64 })
  classId!: string;

  @Column({ length: 64 })
  name!: string;

  @Column({ name: 'student_no', length: 64 })
  studentNo!: string;

  @ManyToOne(() => PickerClassEntity, (classGroup) => classGroup.students, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'class_id' })
  classGroup!: PickerClassEntity;
}
