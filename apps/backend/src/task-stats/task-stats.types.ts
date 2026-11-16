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

/** 子项与待改正标记是派生状态的唯一来源，报告和任务统计共用此口径。 */
export function checklistStatus(
  items: TaskSubItem[],
  checkedItemIds: string[],
  needsCorrection = false,
): StudentStatus {
  const count = items.filter((item) => checkedItemIds.includes(item.id)).length;
  if (!count) return '未完成';
  if (needsCorrection) return '待改正';
  return count === items.length ? '已完成' : '待提交';
}
