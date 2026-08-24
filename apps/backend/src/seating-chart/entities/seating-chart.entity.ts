import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SeatingChartSeatEntity } from './seating-chart-seat.entity';
import { SeatingChartStudentEntity } from './seating-chart-student.entity';

@Entity('seating_chart_charts')
export class SeatingChartEntity {
  @Column({ name: 'teacher_id', length: 64 })
  teacherId!: string;

  @PrimaryColumn({ length: 64 })
  id!: string;

  @Column({ name: 'class_name', length: 64 })
  className!: string;

  @Column({ name: 'rows_count', type: 'int' })
  rows!: number;

  @Column({ name: 'cols_count', type: 'int' })
  cols!: number;

  @OneToMany(() => SeatingChartStudentEntity, (student) => student.chart, {
    cascade: true,
  })
  students!: SeatingChartStudentEntity[];

  @OneToMany(() => SeatingChartSeatEntity, (seat) => seat.chart, {
    cascade: true,
  })
  seats!: SeatingChartSeatEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
