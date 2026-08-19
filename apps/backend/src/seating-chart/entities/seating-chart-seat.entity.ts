import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { SeatingChartEntity } from './seating-chart.entity';

@Entity('seating_chart_seats')
export class SeatingChartSeatEntity {
  @Column({ name: 'teacher_id', length: 64 })
  teacherId!: string;

  @PrimaryColumn({ length: 64 })
  id!: string;

  @Column({ name: 'chart_id', length: 64 })
  chartId!: string;

  @Column({ name: 'row_index', type: 'int' })
  row!: number;

  @Column({ name: 'col_index', type: 'int' })
  col!: number;

  @Column({ name: 'student_id', type: 'varchar', length: 64, nullable: true })
  studentId!: string | null;

  @ManyToOne(() => SeatingChartEntity, (chart) => chart.seats, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'chart_id' })
  chart!: SeatingChartEntity;
}
