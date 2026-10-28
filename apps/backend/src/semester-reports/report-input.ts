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
export type GrowthAssessment = {
  learningReadiness: string;
  communicationCooperation: string;
  independenceRules: string;
  overallUnderstanding: string;
};
/** Fixed teacher-authored dimensions keep student feedback and generated prose distinct. */
export function parseGrowthAssessment(
  value: unknown,
): GrowthAssessment | undefined {
  if (value === undefined) return undefined;
  const row = object(value, '成长评价');
  if (
    Object.keys(row).some(
      (key) =>
        ![
          'learningReadiness',
          'communicationCooperation',
          'independenceRules',
          'overallUnderstanding',
        ].includes(key),
    )
  )
    throw new Error('成长评价含未知项目');
  return {
    learningReadiness: text(row.learningReadiness, 800, '学习准备与课堂能力'),
    communicationCooperation: text(
      row.communicationCooperation,
      800,
      '表达沟通与同伴合作',
    ),
    independenceRules: text(row.independenceRules, 800, '生活自理与规则意识'),
    overallUnderstanding: text(row.overallUnderstanding, 800, '综合画像理解'),
  };
}
export type StudentFeedback = {
  studentId: string;
  learningMastery: Record<string, Mastery>;
  classroomPerformance: Array<{
    subjectId?: string;
    label: string;
    value: string;
  }>;
  teacherMessage: string;
  highlight: string;
  nextFocus: string;
  homePractice: string;
  growthAssessment?: GrowthAssessment;
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
  subjectIds?: string[],
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
    if (
      !Array.isArray(performance) ||
      performance.length >
        (subjectIds ? 12 * Math.max(1, subjectIds.length) : 12)
    )
      throw new Error('课堂表现最多每门学科填写 12 项');
    // Category uniqueness is scoped to a subject, so English and maths may differ.
    const labels = new Set<string>();
    const classroomPerformance = performance.map((rawItem) => {
      const item = object(rawItem, '课堂表现');
      const label = text(item.label, 30, '课堂表现项目');
      const value = text(item.value, 100, '课堂表现评价');
      const subjectId = text(item.subjectId, 64, '课堂表现学科') || undefined;
      if (subjectId && !subjectIds?.includes(subjectId))
        throw new Error('课堂表现必须对应已选学科');
      const key = `${subjectId ?? ''}:${label}`;
      if (!label || !value || labels.has(key))
        throw new Error('课堂表现项目不能为空或重复');
      labels.add(key);
      if (
        [...labels].filter((entry) => entry.startsWith(`${subjectId ?? ''}:`))
          .length > 12
      )
        throw new Error('每门学科课堂表现最多填写 12 项');
      return { ...(subjectId ? { subjectId } : {}), label, value };
    });
    result.set(studentId, {
      studentId,
      ...(row.growthAssessment === undefined
        ? {}
        : { growthAssessment: parseGrowthAssessment(row.growthAssessment) }),
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

export type CourseSelection = {
  subjectId: string;
  courseScope: string;
  manualContent?: string;
};
/** v2 requires explicit per-subject choices; an omitted subject never means all courses. */
export function parseCourseSelections(
  value: unknown,
  period: string,
): CourseSelection[] {
  if (!Array.isArray(value) || !value.length || value.length > 20)
    throw new Error('请按学科选择至少一门课程，最多 20 门');
  const ids = new Set<string>();
  return value.map((raw) => {
    const row = object(raw, '学科课程选择');
    const subjectId = text(row.subjectId, 64, '学科 ID');
    const courseScope = text(row.courseScope, 1000, '学科授课范围');
    if (!subjectId || subjectId === '*' || ids.has(subjectId))
      throw new Error('学科课程选择不能为空或重复');
    // Explicit sources preserve saved teacher content across later PDF uploads and regeneration.
    const manualContent =
      row.manualContent === undefined
        ? undefined
        : text(row.manualContent, 1000, '教师填写的教学内容');
    if (
      manualContent !== undefined &&
      manualContent.length > 0 &&
      manualContent.length < 2
    )
      throw new Error('请填写至少 2 个字符的教学内容');
    if (
      manualContent === undefined &&
      period !== 'term' &&
      courseScope.length < 2
    )
      throw new Error('周报和月报请分别填写每门已选学科的授课范围');
    ids.add(subjectId);
    return {
      subjectId,
      courseScope,
      ...(manualContent !== undefined ? { manualContent } : {}),
    };
  });
}
