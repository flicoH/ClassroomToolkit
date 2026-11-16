export type TaskType = 'status' | 'score';
export type StudentStatus = '未完成' | '已完成' | '待改正' | '需订正';

export interface TaskSubItem {
  id: string;
  title: string;
}

export interface TaskStudent {
  id: string;
  name: string;
  studentNo: string;
  status: StudentStatus;
  score?: number;
  checkedItemIds?: string[];
}

export interface TaskItem {
  id: string;
  title: string;
  className: string;
  type: TaskType;
  statusCount: number;
  createdAt: string;
  items?: TaskSubItem[];
  students: TaskStudent[];
}
