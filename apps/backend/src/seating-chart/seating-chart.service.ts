import { Injectable, NotFoundException } from '@nestjs/common';
import { createEntityId } from '../common/id';
import {
  AssignSeatDto,
  CreateSeatingChartDto,
  ResizeSeatingChartDto,
  SyncSeatingChartClassroomDto,
} from './seating-chart.dto';
import { SeatingChartDatabase } from './seating-chart.database';
import type { Seat, SeatingChart } from './seating-chart.types';

@Injectable()
export class SeatingChartService {
  constructor(private readonly database: SeatingChartDatabase) {}

  findAll() {
    return this.database.findAll();
  }

  findById(chartId: string) {
    return this.getChartOrThrow(chartId);
  }

  create(dto: CreateSeatingChartDto) {
    const chart = {
      id: createEntityId('seating'),
      classId: dto.classId,
      className: dto.className,
      rows: dto.rows,
      cols: dto.cols,
      students: dto.students ?? [],
      seats: this.buildSeats(
        dto.rows,
        dto.cols,
        dto.students?.map((student) => student.id) ?? [],
      ),
    };
    return this.database.save(chart);
  }

  async syncClassroom(chartId: string, dto: SyncSeatingChartClassroomDto) {
    const chart = await this.getChartOrThrow(chartId);
    const students = dto.students ?? [];
    const validStudentIds = new Set(students.map((student) => student.id));
    const currentSeats = this.ensureSeats(chart);
    const seats = currentSeats.map((seat) => ({
      ...seat,
      studentId:
        seat.studentId && validStudentIds.has(seat.studentId)
          ? seat.studentId
          : null,
    }));
    return this.database.save({
      ...chart,
      classId: dto.classId,
      className: dto.className,
      students,
      seats,
    });
  }

  async resize(chartId: string, dto: ResizeSeatingChartDto) {
    const chart = await this.getChartOrThrow(chartId);
    const assignedIds = this.ensureSeats(chart)
      .map((seat) => seat.studentId)
      .filter(Boolean) as string[];
    const seats = this.buildSeats(dto.rows, dto.cols, assignedIds);
    return this.database.save({
      ...chart,
      rows: dto.rows,
      cols: dto.cols,
      seats,
    });
  }

  async assign(chartId: string, seatId: string, dto: AssignSeatDto) {
    const chart = await this.getChartOrThrow(chartId);
    const seats = this.ensureSeats(chart).map((seat) => {
      if (seat.id === seatId) return { ...seat, studentId: dto.studentId };
      if (dto.studentId && seat.studentId === dto.studentId)
        return { ...seat, studentId: null };
      return seat;
    });
    return this.database.save({ ...chart, seats });
  }

  clear(chartId: string, seatId: string) {
    return this.assign(chartId, seatId, { studentId: null });
  }

  async shuffle(chartId: string) {
    const chart = await this.getChartOrThrow(chartId);
    const ids = this.shuffleArray(chart.students.map((student) => student.id));
    const seats = this.ensureSeats(chart).map((seat, index) => ({
      ...seat,
      studentId: ids[index] ?? null,
    }));
    return this.database.save({ ...chart, seats });
  }

  private async getChartOrThrow(chartId: string) {
    const chart = await this.database.findById(chartId);
    if (!chart) throw new NotFoundException('座位表不存在');
    return {
      ...chart,
      seats: this.ensureSeats(chart),
    };
  }

  /** 重建座位时按原顺序保留已安排学生。 */
  private buildSeats(rows: number, cols: number, studentIds: string[]) {
    return Array.from({ length: rows * cols }, (_, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      return {
        id: `seat-${row}-${col}`,
        row,
        col,
        studentId: studentIds[index] ?? null,
      };
    });
  }

  private ensureSeats(
    chart: Pick<SeatingChart, 'rows' | 'cols' | 'seats'>,
  ): Seat[] {
    return chart.seats.length
      ? chart.seats
      : this.buildSeats(chart.rows || 4, chart.cols || 4, []);
  }

  private shuffleArray<T>(source: T[]) {
    const result = [...source];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [result[index], result[target]] = [result[target]!, result[index]!];
    }
    return result;
  }
}
