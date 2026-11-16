export type TaskType = 'status' | 'score';
export type StudentStatus =
  | '未完成'
  | '已完成'
  | '待改正'
  | '需订正'
  | '待提交';
export type ReviewAction = 'requestCorrection' | 'complete';
export interface Checklist {
  checkedItemIds: string[];
  needsCorrection: boolean;
}

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
  needsCorrection?: boolean;
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
