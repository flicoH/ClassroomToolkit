export type TaskType = 'status' | 'score';
export type StudentStatus = '未完成' | '已完成' | '需订正';

export interface TaskStudent {
  id: string;
  name: string;
  studentNo: string;
  status: StudentStatus;
  score?: number;
}

export interface TaskItem {
  id: string;
  title: string;
  className: string;
  type: TaskType;
  statusCount: number;
  createdAt: string;
  students: TaskStudent[];
}
