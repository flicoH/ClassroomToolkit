export type Gender = '男' | '女' | '';

export interface Student {
  id: string;
  name: string;
  studentNo: string;
  gender: Gender;
  group?: string;
}

export interface Classroom {
  id: string;
  name: string;
  students: Student[];
  groups: string[];
}
