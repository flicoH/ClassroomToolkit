import { SeatingStudent } from './seating-chart.types';

export class ResizeSeatingChartDto {
  rows!: number;
  cols!: number;
}

export class AssignSeatDto {
  studentId!: string | null;
}

export class CreateSeatingChartDto {
  classId?: string;
  className!: string;
  rows!: number;
  cols!: number;
  students?: SeatingStudent[];
}

export class SyncSeatingChartClassroomDto {
  classId?: string;
  className!: string;
  students?: SeatingStudent[];
}
