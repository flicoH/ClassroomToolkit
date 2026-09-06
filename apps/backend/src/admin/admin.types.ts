/** MySQL 聚合值可能以字符串返回；Database 保留驱动值，Service 明确转换展示指标。 */
export type AdminDatabaseRow = Record<string, string | number | null>;
export type AdminDirectory = 'teachers' | 'students' | 'classrooms';
export interface AdminMetadata {
  startedAt: string | null;
  timezone: string;
  updatedAt: string;
}
export interface AdminPagination {
  page: number;
  pageSize: number;
  offset: number;
}
export interface AdminDateRange {
  from: string;
  to: string;
}
