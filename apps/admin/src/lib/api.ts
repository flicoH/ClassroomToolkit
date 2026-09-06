import { ref } from 'vue'
/** 仅缓存用于展示的管理员资料；凭据保存在 HttpOnly Cookie 中，不写入浏览器存储。 */
export const profile = ref<{ id: string; username: string } | null>(null)
/** 管理请求统一走同源代理；有 body 时使用 POST，并附带后端要求的 CSRF 防护请求头。 */
export async function api<T>(
  path: string,
  query: Record<string, string | number | undefined> = {},
  body?: unknown,
): Promise<T> {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== '') params.set(k, String(v))
  })
  const response = await fetch(`/admin/${path}${params.size ? '?' + params : ''}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Request': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({ message: '服务响应异常，请稍后重试' }))
  if (!response.ok) {
    // 登录表单的 401 就地展示；其他接口的 401 清理身份并通知路由返回登录页。
    if (response.status === 401 && path !== 'auth/login') {
      profile.value = null
      window.dispatchEvent(new Event('admin-session-expired'))
    }
    throw new Error(data.message || '请求失败')
  }
  return data as T
}
export function formatTime(value?: string | null) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '暂无记录'
}
export const today = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
export const daysAgo = (n: number) =>
  new Date(Date.now() + 8 * 3600000 - n * 86400000).toISOString().slice(0, 10)
export interface Meta {
  startedAt: string | null
  updatedAt: string
  timezone: string
}
export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
export interface Feature {
  key: string
  name: string
  teachers: number
  uses: number
  openTeachers: number
  usageRate: number
  change: string
}
/** 数值为 null 表示尚未采集，0 表示已采集但没有事件；图表必须保留这个区别。 */
export type SeriesRow = { date: string; [key: string]: string | number | null }
export interface Trend extends Meta {
  hasCoverage?: boolean
  series: SeriesRow[]
  totals?: Record<string, number>
  total?: number
}
export interface Ranking extends Meta {
  hasCoverage?: boolean
  items: Feature[]
  activeTeachers: number
}
export interface Person {
  id: string
  name: string
  username?: string
  email?: string
  createdAt?: string
  lastLoginAt?: string
  classrooms?: number
  students?: number
  teacherId?: string
  teacherName?: string
  classroomId?: string
  classroomName?: string
  studentNo?: string
  gender?: string
  kind?: string
}
