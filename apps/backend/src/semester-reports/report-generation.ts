import { isDeepStrictEqual } from 'node:util';
import type { SemesterReportEntity } from './semester-report.entity';
import { extractLearningContents, type LearningContent } from './course-scope';
import {
  parseReportDetails,
  type ReportDetails,
  type StudentFeedback,
} from './report-input';

export type ReportGenerationMode = 'template' | 'ai';
type Entry = { text: string; sourceRefs: string[] };
type Snapshot = {
  subjectName?: string;
  student?: { name?: string };
  courseScope?: string;
  allowedReferences?: string[];
  scoreSummary?: {
    positive?: number;
    negative?: number;
    net?: number;
    count?: number;
    records?: Array<{
      id: string;
      label: string;
      delta: number;
      createdAt?: Date | string;
    }>;
  };
  courseDocuments?: Array<{
    id: string;
    fileName: string;
    pages: Array<{ page: number; text: string }>;
  }>;
  learningContents?: LearningContent[];
  teacherInput?: StudentFeedback;
  reportDetails?: ReportDetails;
};

/** Point figures are copied from the saved period snapshot, never from editable prose. */
export function scoreDetailsForSnapshot(snapshot: Snapshot) {
  const summary = snapshot.scoreSummary;
  if (!summary) return undefined;
  const allowed = new Set(snapshot.allowedReferences ?? []);
  return {
    positive: summary.positive ?? 0,
    negative: summary.negative ?? 0,
    net: summary.net ?? 0,
    count: summary.count ?? 0,
    records: (summary.records ?? [])
      .filter(
        (record) =>
          Number.isFinite(record.delta) && allowed.has(`score:${record.id}`),
      )
      .slice(0, 80)
      .map((record) => {
        const date = record.createdAt ? new Date(record.createdAt) : null;
        return {
          label: record.label.slice(0, 160),
          delta: record.delta,
          createdAt:
            date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
        };
      }),
  };
}

export function learningContentsForReport(report: SemesterReportEntity) {
  const snapshot = (report.snapshot ?? {}) as Snapshot;
  const allowed = new Set(snapshot.allowedReferences ?? []);
  const items =
    snapshot.learningContents ??
    extractLearningContents(
      (snapshot.courseDocuments ?? []).map((document) => ({
        ...document,
        sourcePages: document.pages,
        confirmedUnits: [],
      })),
      report.courseScope || snapshot.courseScope || '',
      report.periodType,
    );
  return items
    .filter(
      (item) =>
        item.sourceRefs.length &&
        item.sourceRefs.every((ref) => allowed.has(ref)),
    )
    .map((item) => ({
      ...item,
      mastery:
        snapshot.teacherInput?.learningMastery[item.id] ??
        ('unassessed' as const),
    }));
}

/** Curriculum and teacher ratings stay deterministic even when prose is drafted by AI. */
export function addLearningReportSections<T extends Record<string, unknown>>(
  content: T,
  report: SemesterReportEntity,
) {
  const snapshot = (report.snapshot ?? {}) as Snapshot;
  const feedback = snapshot.teacherInput;
  const teacherEntry = (text: string) => [
    { text, sourceRefs: ['teacher-input'] },
  ];
  return {
    ...content,
    ...(feedback?.teacherMessage ? { summary: feedback.teacherMessage } : {}),
    ...(feedback?.highlight
      ? { strengths: teacherEntry(feedback.highlight) }
      : {}),
    ...(feedback?.nextFocus
      ? { areasToImprove: teacherEntry(feedback.nextFocus) }
      : {}),
    ...(feedback?.homePractice
      ? { homeSuggestions: teacherEntry(feedback.homePractice) }
      : {}),
    reportDetails: snapshot.reportDetails,
    scoreDetails: scoreDetailsForSnapshot(snapshot),
    learningContents: learningContentsForReport(report),
    classroomPerformance: (feedback?.classroomPerformance ?? []).map(
      (item) => ({
        text: `${item.label} · ${item.value}`,
        sourceRefs: ['teacher-input'],
      }),
    ),
  };
}

export function resolveReportGenerationMode(
  requested?: unknown,
): ReportGenerationMode {
  const mode = requested ?? process.env.REPORT_GENERATION_MODE ?? 'auto';
  if (typeof mode !== 'string' || !['auto', 'template', 'ai'].includes(mode))
    throw new Error('报告生成方式必须是 auto、template 或 ai');
  if (mode === 'template') return 'template';
  const settings = [
    process.env.REPORT_AI_BASE_URL,
    process.env.REPORT_AI_API_KEY,
    process.env.REPORT_AI_MODEL,
  ];
  if (settings.every((value) => value?.trim())) return 'ai';
  if (mode === 'auto' && settings.every((value) => !value?.trim()))
    return 'template';
  throw new Error(
    'AI 生成需要配置 REPORT_AI_BASE_URL、REPORT_AI_API_KEY、REPORT_AI_MODEL；也可选择本地模板生成',
  );
}

/** Deterministic report drafting: records are facts; curriculum and keywords are context. */
export function generateTemplateReport(report: SemesterReportEntity) {
  const snapshot = (report.snapshot ?? {}) as Snapshot;
  const allowed = new Set(snapshot.allowedReferences ?? []);
  const courses = (snapshot.courseDocuments ?? []).filter(
    (document) => document.pages?.length,
  );
  const courseReferences = courses
    .flatMap((document) =>
      document.pages.map((page) => `course:${document.id}:p${page.page}`),
    )
    .filter((reference) => allowed.has(reference));
  if (!courseReferences.length)
    throw new Error('报告缺少可追溯的课程页码依据，请重新选择课程资料生成');
  const scores = snapshot.scoreSummary ?? {};
  const records = (scores.records ?? []).filter(
    (record) =>
      Number.isFinite(record.delta) && allowed.has(`score:${record.id}`),
  );
  const count = scores.count ?? records.length;
  const positive =
    scores.positive ??
    records
      .filter((record) => record.delta > 0)
      .reduce((sum, record) => sum + record.delta, 0);
  const negative =
    scores.negative ??
    records
      .filter((record) => record.delta < 0)
      .reduce((sum, record) => sum + record.delta, 0);
  const net = scores.net ?? positive + negative;
  const scope = (
    report.courseScope ||
    snapshot.courseScope ||
    '本学期已确认课程资料'
  ).slice(0, 900);
  const student = (snapshot.student?.name || report.studentName).slice(0, 100);
  const subject = (snapshot.subjectName || '本学科').slice(0, 100);
  const period = { week: '本周', month: '本月', term: '本学期' }[
    report.periodType
  ];
  const observation = report.teacherObservation?.trim();
  const hasObservation = Boolean(
    observation && allowed.has('teacher-observation'),
  );
  let summary = `${student}${period}的${subject}学习报告。`;
  summary +=
    count > 0
      ? `本周期共有 ${count} 次综合课堂评价，加分 ${positive} 分、扣分 ${Math.abs(negative)} 分，净积分 ${net} 分。这些记录反映综合课堂表现，不代表${subject}知识掌握程度。`
      : '本周期暂无综合课堂评价记录，暂不能据此评价课堂表现或知识掌握程度。';
  if (hasObservation)
    summary += `教师观察（原文节选）：${observation!.slice(0, 500)}`;
  if (report.keywords?.trim())
    summary += `教师希望关注的主题：${report.keywords.trim().slice(0, 300)}。该主题不作为已达成成果。`;
  const sourceNames = courses.slice(0, 3).map((document) => {
    const pages = document.pages.map((page) => page.page);
    return `${document.fileName.slice(0, 80)}（PDF 第 ${pages.slice(0, 10).join('、')} 页${pages.length > 10 ? '等' : ''}）`;
  });
  const courseOverview = `${period}授课范围：${scope}。参考课程资料：${sourceNames.join('；')}${courses.length > 3 ? '等' : ''}。课程计划中的目标仅作为教学背景，不能据此认定学生已达成目标。具体课堂学习情况请由老师核对并补充。`;

  const grouped = new Map<
    string,
    { label: string; delta: number; count: number; references: string[] }
  >();
  for (const record of records) {
    if (record.delta === 0) continue;
    const label = record.label.trim().slice(0, 160) || '课堂评价';
    const key = `${record.delta > 0 ? '+' : '-'}:${label}`;
    const group = grouped.get(key) ?? {
      label,
      delta: 0,
      count: 0,
      references: [],
    };
    group.delta += record.delta;
    group.count++;
    group.references.push(`score:${record.id}`);
    grouped.set(key, group);
  }
  const groups = [...grouped.values()].sort(
    (a, b) => Math.abs(b.delta) - Math.abs(a.delta),
  );
  const strengths: Entry[] = groups
    .filter((group) => group.delta > 0)
    .slice(0, 3)
    .map((group) => ({
      text: `综合课堂评价中，“${group.label}”有 ${group.count} 次加分记录，合计 ${group.delta} 分。可继续保持相关课堂习惯。`,
      sourceRefs: group.references,
    }));
  const areasToImprove: Entry[] = groups
    .filter((group) => group.delta < 0)
    .slice(0, 3)
    .map((group) => ({
      text: `综合课堂评价中，“${group.label}”有 ${group.count} 次扣分记录，合计 ${Math.abs(group.delta)} 分。建议核对发生情境，并和孩子共同确定一项改进目标。`,
      sourceRefs: group.references,
    }));
  const homeSuggestions: Entry[] = [
    {
      text: `可围绕老师确认的“${scope.slice(0, 150)}”，按老师安排选择课程活动进行复习，并将实际完成情况反馈给老师。`,
      sourceRefs: courseReferences.slice(0, 3),
    },
  ];
  if (records.length)
    homeSuggestions.push({
      text: '和孩子一起回顾本期综合课堂评价，肯定有记录支持的努力，并选一项课堂习惯作为接下来的关注目标。',
      sourceRefs: records.slice(0, 3).map((record) => `score:${record.id}`),
    });
  if (hasObservation)
    homeSuggestions.push({
      text: '可围绕老师记录的观察与孩子交流，并将家庭练习中的实际情况反馈给老师。',
      sourceRefs: ['teacher-observation'],
    });
  const limitations = [
    '本报告使用本地模板整理课程资料与评价记录，未使用 AI 分析；请由老师核对、补充后发布。',
    '课程资料描述教学计划，积分反映综合课堂表现，均不能单独证明本学科知识掌握程度。',
  ];
  const teacherInput = snapshot.teacherInput;
  const hasTeacherFeedback = Boolean(
    teacherInput?.teacherMessage ||
    teacherInput?.classroomPerformance.length ||
    teacherInput?.highlight ||
    teacherInput?.nextFocus ||
    Object.values(teacherInput?.learningMastery ?? {}).some(
      (value) => value !== 'unassessed',
    ),
  );
  if (!count)
    limitations.push(
      hasTeacherFeedback
        ? '本周期没有综合积分评价记录，具体表现依据教师填写的评价。'
        : '本周期没有综合评价记录，未生成表现亮点或改进结论。',
    );
  if (!hasObservation && !hasTeacherFeedback)
    limitations.push('未提供可引用的教师观察，具体学习表现需由老师补充。');
  if (count > records.length)
    limitations.push(
      '积分汇总覆盖全部周期记录，条目依据为报告中保留的评价明细。',
    );
  return addLearningReportSections(
    {
      summary,
      courseOverview,
      strengths,
      areasToImprove,
      homeSuggestions,
      limitations,
    },
    report,
  );
}

export function validateGeneratedReportContent(
  content: Record<string, unknown>,
  snapshot: Record<string, unknown>,
) {
  if (
    content.scoreDetails !== undefined &&
    !isDeepStrictEqual(
      content.scoreDetails,
      scoreDetailsForSnapshot(snapshot as Snapshot),
    )
  )
    throw new Error('积分明细必须与报告生成时的周期记录一致');
  if (content.reportDetails !== undefined)
    parseReportDetails(content.reportDetails);
  const allowed = new Set(
    Array.isArray(snapshot.allowedReferences)
      ? (snapshot.allowedReferences as string[])
      : [],
  );
  for (const key of ['summary', 'courseOverview']) {
    if (typeof content[key] !== 'string' || content[key].length > 2500)
      throw new Error('报告正文格式无效');
  }
  for (const key of ['strengths', 'areasToImprove', 'homeSuggestions']) {
    if (!Array.isArray(content[key]) || content[key].length > 8)
      throw new Error('报告条目格式无效');
    for (const item of content[key] as Array<Record<string, unknown>>) {
      if (
        !item ||
        typeof item.text !== 'string' ||
        item.text.length > 800 ||
        !Array.isArray(item.sourceRefs) ||
        !item.sourceRefs.length ||
        item.sourceRefs.some(
          (reference) =>
            typeof reference !== 'string' || !allowed.has(reference),
        )
      ) {
        throw new Error('报告引用格式无效或缺少依据');
      }
    }
  }
  if (
    !Array.isArray(content.limitations) ||
    content.limitations.length > 8 ||
    content.limitations.some(
      (item) => typeof item !== 'string' || item.length > 800,
    )
  )
    throw new Error('报告说明格式无效');
  if (content.learningContents !== undefined) {
    if (
      !Array.isArray(content.learningContents) ||
      content.learningContents.length > 500
    )
      throw new Error('学习内容格式无效');
    const ids = new Set<string>();
    for (const item of content.learningContents as Array<
      Record<string, unknown>
    >) {
      if (
        !item ||
        typeof item.id !== 'string' ||
        item.id.length > 200 ||
        ids.has(item.id) ||
        typeof item.section !== 'string' ||
        item.section.length > 100 ||
        typeof item.text !== 'string' ||
        !item.text.trim() ||
        item.text.length > 1500 ||
        !['unassessed', 'mastered', 'practicing', 'needs_support'].includes(
          String(item.mastery),
        ) ||
        !Array.isArray(item.sourceRefs) ||
        !item.sourceRefs.length ||
        item.sourceRefs.some(
          (ref) => typeof ref !== 'string' || !allowed.has(ref),
        )
      )
        throw new Error('学习内容或掌握评价格式无效');
      ids.add(item.id);
    }
  }
  if (content.classroomPerformance !== undefined) {
    if (
      !Array.isArray(content.classroomPerformance) ||
      content.classroomPerformance.length > 12
    )
      throw new Error('课堂表现格式无效');
    for (const item of content.classroomPerformance as Array<
      Record<string, unknown>
    >) {
      if (
        !item ||
        typeof item.text !== 'string' ||
        !item.text.trim() ||
        item.text.length > 200 ||
        !Array.isArray(item.sourceRefs) ||
        !item.sourceRefs.length ||
        item.sourceRefs.some(
          (ref) => typeof ref !== 'string' || !allowed.has(ref),
        )
      )
        throw new Error('课堂表现缺少有效的教师评价依据');
    }
  }
}
