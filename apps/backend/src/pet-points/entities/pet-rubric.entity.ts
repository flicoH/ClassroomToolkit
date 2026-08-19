import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('pet_points_rubrics')
export class PetRubricEntity {
  @Column({ name: 'teacher_id', length: 64 })
  teacherId!: string;

  @PrimaryColumn({ length: 64 })
  id!: string;

  @Column({
    type: 'enum',
    enum: ['课堂表现', '作业情况', '品德修养', '纪律常规'],
  })
  category!: '课堂表现' | '作业情况' | '品德修养' | '纪律常规';

  @Column({ length: 64 })
  label!: string;

  @Column({ type: 'int' })
  score!: number;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;
}
