import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { PickerStudentEntity } from './picker-student.entity';

@Entity('random_picker_classes')
export class PickerClassEntity {
  @Column({ name: 'teacher_id', length: 64 })
  teacherId!: string;

  @PrimaryColumn({ length: 64 })
  id!: string;

  @Column({ length: 64 })
  name!: string;

  @OneToMany(() => PickerStudentEntity, (student) => student.classGroup)
  students!: PickerStudentEntity[];
}
