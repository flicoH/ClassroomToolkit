import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('pet_points_students')
export class PetStudentEntity {
  @Column({ name: 'teacher_id', length: 64 })
  teacherId!: string;

  @PrimaryColumn({ length: 64 })
  id!: string;

  @Column({ length: 64 })
  name!: string;

  @Column({ name: 'student_no', length: 64 })
  studentNo!: string;

  @Column({ name: 'class_id', length: 64, default: 'grade-1' })
  classId!: string;

  @Column({ name: 'class_name', length: 64, default: '一年级' })
  className!: string;

  @Column({ name: 'group_name', length: 64 })
  group!: string;

  @Column({ type: 'int', default: 0 })
  score!: number;

  @Column({ name: 'max_score', type: 'int', default: 30 })
  maxScore!: number;

  @Column({ type: 'int', default: 0 })
  trophies!: number;

  @Column({ name: 'level_num', type: 'int', default: 1 })
  level!: number;

  @Column({
    type: 'enum',
    enum: ['初始形态', '成长形态', '进阶形态', '终极形态'],
    default: '初始形态',
  })
  stage!: '初始形态' | '成长形态' | '进阶形态' | '终极形态';

  @Column({ name: 'pet_id', type: 'varchar', length: 64, nullable: true })
  petId!: string | null;

  @Column({ name: 'pet_name', type: 'varchar', length: 64, nullable: true })
  petName!: string | null;

  @Column({ name: 'pet_progress', type: 'int', default: 0 })
  petProgress!: number;

  @Column({ name: 'pet_hatched', type: 'boolean', default: false })
  petHatched!: boolean;

  @Column({ type: 'boolean', default: false })
  absent!: boolean;

  @Column({ name: 'completed_pets', type: 'int', default: 0 })
  completedPets!: number;
}
