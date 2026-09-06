import { AdminQueryDto } from '../admin.dto';
import { BadRequestException } from '@nestjs/common';
export const DAY = 86400000;
/** 将时间点转换为北京时间日期标签，用于统一默认日期和图表横轴。 */
export const shanghaiDay = (date = new Date()) =>
  new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10);
/** 将包含首尾日期的北京时间范围转换为 UTC SQL 边界，并生成等长对比周期。 */
export function dateRange(query: AdminQueryDto = {}) {
  const end = query.end || shanghaiDay();
  const start = query.start || shanghaiDay(new Date(Date.now() - 29 * DAY));
  // ISO 回转校验可拒绝 2 月 30 日这类被 Date 自动归一化的无效日期。
  for (const date of [start, end]) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date
    )
      throw new BadRequestException('日期格式应为 YYYY-MM-DD');
  }
  const from = new Date(`${start}T00:00:00+08:00`).getTime();
  // 查询使用 [from, to)，结束日取次日零点，避免遗漏毫秒或重复计算边界事件。
  const to = new Date(`${end}T00:00:00+08:00`).getTime() + DAY;
  if (to <= from || to - from > 366 * DAY || end > shanghaiDay())
    throw new BadRequestException('请选择不超过 366 天且不晚于今天的日期范围');
  /** 将毫秒时间戳转换为不含时区后缀的 UTC SQL 日期边界。 */
  const sql = (ms: number) =>
    new Date(ms).toISOString().slice(0, 23).replace('T', ' ');
  return {
    start,
    end,
    from: sql(from),
    to: sql(to),
    previousFrom: sql(from - (to - from)),
    previousTo: sql(from),
    days: Array.from({ length: (to - from) / DAY }, (_, i) =>
      shanghaiDay(new Date(from + i * DAY)),
    ),
  };
}
/** 限制单页大小与页码范围，避免客户端请求无界列表。 */
export function pageQuery(query: AdminQueryDto) {
  const page = Number(query.page || 1),
    pageSize = Number(query.pageSize || 20);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 100000 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  )
    throw new BadRequestException('无效的分页参数');
  return { page, pageSize, offset: (page - 1) * pageSize };
}
