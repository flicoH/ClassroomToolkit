import { SeatingStudent } from './seating-chart.types';

export class ResizeSeatingChartDto {
  rows!: number;
  cols!: number;
}

export class AssignSeatDto {
  studentId!: string | null;
}

export class CreateSeatingChartDto {
  className!: string;
  rows!: number;
  cols!: number;
  students?: SeatingStudent[];
}
