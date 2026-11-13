/** 注册、自动登录、主动登录与功能操作使用不同类型，避免混淆统计口径。 */
export type EventKind =
  | 'register'
  | 'auto_login'
  | 'login'
  | 'login_failed'
  | 'open'
  | 'use';
export interface AnalyticsEvent {
  loginIp?: string | null;
  ipLocation?: string | null;
  id: string;
  teacherId: string | null;
  kind: EventKind;
  feature: string | null;
  action: string | null;
  dedupeKey: string;
}
