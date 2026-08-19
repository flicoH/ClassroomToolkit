export interface PickerStudent {
  id: string;
  name: string;
  studentNo: string;
}

export interface PickerClass {
  id: string;
  name: string;
  students: PickerStudent[];
}

export interface PickHistory {
  id: string;
  classId: string;
  selectedCount: number;
  students: PickerStudent[];
  createdAt: string;
}
