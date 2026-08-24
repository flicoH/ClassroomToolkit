import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { SeatingChartEntity } from './seating-chart.entity';

@Entity('seating_chart_students')
export class SeatingChartStudentEntity {
  @Column({ name: 'teacher_id', length: 64 })
  teacherId!: string;

  @PrimaryColumn({ length: 64 })
  id!: string;

  @Column({ name: 'chart_id', length: 64 })
  chartId!: string;

  @Column({ length: 64 })
  name!: string;

  @Column({
    name: 'source_student_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  sourceStudentId!: string | null;

  @Column({ name: 'student_no', length: 64 })
  studentNo!: string;

  @ManyToOne(() => SeatingChartEntity, (chart) => chart.students, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'chart_id' })
  chart!: SeatingChartEntity;
}
