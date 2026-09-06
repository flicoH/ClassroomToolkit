/**
 * 历史教师 DATETIME 按后端本地时区写入；更换服务器时区后应显式配置原始偏移。
 * 新增统计事件始终使用 UTC，此配置仅用于教师历史字段的读取与筛选。
 */
export function teacherUtcOffset(): string {
  const minutes = -new Date().getTimezoneOffset();
  const fallback = `${minutes >= 0 ? '+' : '-'}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, '0')}:${String(Math.abs(minutes) % 60).padStart(2, '0')}`;
  const value = process.env.TEACHER_DATA_UTC_OFFSET || fallback;
  if (
    !/^[+-](0\d|1[0-4]):[0-5]\d$/.test(value) ||
    (value.slice(1, 3) === '14' && value.slice(4) !== '00')
  )
    throw new Error(
      'TEACHER_DATA_UTC_OFFSET 必须是有效的 UTC 偏移，例如 +08:00 或 +00:00',
    );
  return value;
}
/** 将统一的 UTC 查询边界换算到历史字段时区，保留直接比较 created_at 的查询方式。 */
export function teacherSqlTime(utc: string) {
  const offset = teacherUtcOffset();
  const minutes =
    (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4))) *
    (offset[0] === '-' ? -1 : 1);
  return new Date(Date.parse(utc.replace(' ', 'T') + 'Z') + minutes * 60000)
    .toISOString()
    .slice(0, 23)
    .replace('T', ' ');
}
