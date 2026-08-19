import { Injectable, NotFoundException } from '@nestjs/common';
import { createEntityId } from '../common/id';
import {
  AssignSeatDto,
  CreateSeatingChartDto,
  ResizeSeatingChartDto,
} from './seating-chart.dto';
import { SeatingChartDatabase } from './seating-chart.database';

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

  async resize(chartId: string, dto: ResizeSeatingChartDto) {
    const chart = await this.getChartOrThrow(chartId);
    const assignedIds = chart.seats
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
    const seats = chart.seats.map((seat) => {
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
    const seats = chart.seats.map((seat, index) => ({
      ...seat,
      studentId: ids[index] ?? null,
    }));
    return this.database.save({ ...chart, seats });
  }

  private async getChartOrThrow(chartId: string) {
    const chart = await this.database.findById(chartId);
    if (!chart) throw new NotFoundException('座位表不存在');
    return chart;
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

  private shuffleArray<T>(source: T[]) {
    const result = [...source];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [result[index], result[target]] = [result[target]!, result[index]!];
    }
    return result;
  }
}
