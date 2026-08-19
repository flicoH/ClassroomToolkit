export interface SeatingStudent {
  id: string;
  name: string;
  studentNo: string;
}

export interface Seat {
  id: string;
  row: number;
  col: number;
  studentId: string | null;
}

export interface SeatingChart {
  id: string;
  className: string;
  rows: number;
  cols: number;
  students: SeatingStudent[];
  seats: Seat[];
}
