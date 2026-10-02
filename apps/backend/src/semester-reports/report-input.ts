export const masteryValues = [
  'unassessed',
  'mastered',
  'practicing',
  'needs_support',
] as const;
export type Mastery = (typeof masteryValues)[number];
export type ReportDetails = {
  institutionName: string;
  courseTheme: string;
  lessonNumber: number | null;
  lessonDate: string | null;
};
export type StudentFeedback = {
  studentId: string;
  learningMastery: Record<string, Mastery>;
  classroomPerformance: Array<{ label: string; value: string }>;
  teacherMessage: string;
  highlight: string;
  nextFocus: string;
  homePractice: string;
};
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label}格式无效`);
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, label: string) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.length > max)
    throw new Error(`${label}最多 ${max} 个字符`);
  return value.trim();
}
export function parseReportDetails(
  value: unknown,
  start?: Date,
  end?: Date,
): ReportDetails | undefined {
  if (value === undefined) return undefined;
  const row = object(value, '报告基础信息');
  const institutionName = text(row.institutionName, 60, '报告抬头');
  const courseTheme = text(row.courseTheme, 100, '课程主题');
  const lessonNumber =
    row.lessonNumber === undefined ||
    row.lessonNumber === null ||
    row.lessonNumber === ''
      ? null
      : row.lessonNumber;
  if (
    lessonNumber !== null &&
    (typeof lessonNumber !== 'number' ||
      !Number.isInteger(lessonNumber) ||
      lessonNumber < 1 ||
      lessonNumber > 999)
  )
    throw new Error('课次需填写 1 至 999 的整数');
  const lessonDate = text(row.lessonDate, 10, '授课日期') || null;
  if (lessonDate) {
    const date = new Date(`${lessonDate}T00:00:00+08:00`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(lessonDate) ||
      Number.isNaN(date.getTime()) ||
      new Date(`${lessonDate}T00:00:00Z`).toISOString().slice(0, 10) !==
        lessonDate
    )
      throw new Error('授课日期无效');
    if ((start && date < start) || (end && date >= end))
      throw new Error('授课日期必须在报告周期内');
  }
  return {
    institutionName,
    courseTheme,
    lessonNumber: lessonNumber as number | null,
    lessonDate,
  };
}
export function parseStudentFeedback(
  value: unknown,
  selected: string[],
  learningIds: string[],
) {
  const result = new Map<string, StudentFeedback>();
  if (value === undefined) return result;
  if (!Array.isArray(value) || value.length > 30)
    throw new Error('学生评价格式无效');
  const allowedLearning = new Set(learningIds);
  for (const raw of value) {
    const row = object(raw, '学生评价');
    const studentId = text(row.studentId, 64, '学生 ID');
    if (!selected.includes(studentId) || result.has(studentId))
      throw new Error('学生评价必须对应已选学生，且不能重复');
    const ratings =
      row.learningMastery === undefined
        ? {}
        : object(row.learningMastery, '掌握评价');
    const learningMastery: Record<string, Mastery> = {};
    for (const [id, rating] of Object.entries(ratings)) {
      if (
        !allowedLearning.has(id) ||
        !masteryValues.includes(rating as Mastery)
      )
        throw new Error('掌握评价必须对应当前所选学习内容');
      learningMastery[id] = rating as Mastery;
    }
    const performance = row.classroomPerformance ?? [];
    if (!Array.isArray(performance) || performance.length > 12)
      throw new Error('课堂表现最多填写 12 项');
    const labels = new Set<string>();
    const classroomPerformance = performance.map((rawItem) => {
      const item = object(rawItem, '课堂表现');
      const label = text(item.label, 30, '课堂表现项目');
      const value = text(item.value, 100, '课堂表现评价');
      if (!label || !value || labels.has(label))
        throw new Error('课堂表现项目不能为空或重复');
      labels.add(label);
      return { label, value };
    });
    result.set(studentId, {
      studentId,
      learningMastery,
      classroomPerformance,
      teacherMessage: text(row.teacherMessage, 2500, '老师寄语'),
      highlight: text(row.highlight, 800, '值得肯定的表现'),
      nextFocus: text(row.nextFocus, 800, '下一步重点'),
      homePractice: text(row.homePractice, 800, '家庭练习'),
    });
  }
  return result;
}
