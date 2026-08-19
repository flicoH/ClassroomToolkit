import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SeatingChartSeatEntity } from './entities/seating-chart-seat.entity';
import { SeatingChartStudentEntity } from './entities/seating-chart-student.entity';
import { SeatingChartEntity } from './entities/seating-chart.entity';
import { SeatingChart } from './seating-chart.types';
import { TeacherContext } from '../auth/teacher-context';

@Injectable()
export class SeatingChartDatabase {
  constructor(
    @InjectRepository(SeatingChartEntity)
    private readonly charts: Repository<SeatingChartEntity>,
    @InjectRepository(SeatingChartStudentEntity)
    private readonly students: Repository<SeatingChartStudentEntity>,
    @InjectRepository(SeatingChartSeatEntity)
    private readonly seats: Repository<SeatingChartSeatEntity>,
    private readonly teacherContext: TeacherContext,
  ) {}

  async findAll() {
    const rows = await this.charts.find({
      where: { teacherId: this.teacherContext.teacherId },
      relations: { students: true, seats: true },
      order: { createdAt: 'ASC' },
    });
    return rows.map((row) => this.toChart(row));
  }

  async findById(id: string) {
    const row = await this.charts.findOne({
      where: { id, teacherId: this.teacherContext.teacherId },
      relations: { students: true, seats: true },
    });
    return row ? this.toChart(row) : undefined;
  }

  async save(chart: SeatingChart) {
    const teacherId = this.teacherContext.teacherId;
    await this.charts.save(
      this.charts.create({
        id: chart.id,
        teacherId,
        className: chart.className,
        rows: chart.rows,
        cols: chart.cols,
      }),
    );
    await Promise.all([
      this.students.delete({ chartId: chart.id, teacherId }),
      this.seats.delete({ chartId: chart.id, teacherId }),
    ]);
    await this.students.save(
      chart.students.map((student) =>
        this.students.create({
          id: `${chart.id}:${student.id}`.slice(0, 64),
          teacherId,
          chartId: chart.id,
          name: student.name,
          studentNo: student.studentNo,
        }),
      ),
    );
    await this.seats.save(
      chart.seats.map((seat) =>
        this.seats.create({
          id: `${chart.id}:${seat.id}`.slice(0, 64),
          teacherId,
          chartId: chart.id,
          row: seat.row,
          col: seat.col,
          studentId: seat.studentId,
        }),
      ),
    );
    return (await this.findById(chart.id))!;
  }

  private toChart(entity: SeatingChartEntity): SeatingChart {
    return {
      id: entity.id,
      className: entity.className,
      rows: entity.rows,
      cols: entity.cols,
      students: [...(entity.students ?? [])]
        .filter((item) => item.teacherId === this.teacherContext.teacherId)
        .sort((a, b) => a.studentNo.localeCompare(b.studentNo))
        .map((student) => ({
          id: student.studentNo,
          name: student.name,
          studentNo: student.studentNo,
        })),
      seats: [...(entity.seats ?? [])]
        .filter((item) => item.teacherId === this.teacherContext.teacherId)
        .sort((a, b) => a.row - b.row || a.col - b.col)
        .map((seat) => ({
          id: `seat-${seat.row}-${seat.col}`,
          row: seat.row,
          col: seat.col,
          studentId: seat.studentId,
        })),
    };
  }
}
