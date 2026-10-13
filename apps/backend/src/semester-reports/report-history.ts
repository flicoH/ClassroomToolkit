import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type {
  ReportEventEntity,
  SemesterReportEntity,
} from './semester-report.entity';

export type ReportVersion = {
  content: Record<string, unknown> | null;
  snapshot: Record<string, unknown>;
  courseScope: string | null;
};
export type ReportRevision = {
  schema: 1;
  before?: ReportVersion;
  after: ReportVersion;
};

const labels: Record<string, string> = {
  'report-queued': '报告已加入生成队列',
  'generation-started': '开始生成报告',
  'generation-succeeded': '报告生成成功',
  'generation-failed': '报告生成失败',
  'report-retried': '重试生成报告',
  'draft-edited': '编辑报告草稿',
  'draft-subjects-added': '添加报告学科',
  'draft-subject-removed': '删除报告学科',
  'classroom-photo-uploaded': '上传或更换课堂照片',
  'classroom-photo-removed': '移除课堂照片',
  'report-published': '发布报告',
  'share-created': '创建家长分享链接',
  'share-revoked': '撤销家长分享链接',
  'report-unpublished': '撤销发布并转为草稿',
  'report-deleted': '删除报告',
  'report-restored': '恢复报告历史版本',
};

/** Freeze only editable report state; sharing credentials and publication status
 * never belong to a restorable version. Snapshot-derived visuals are stored once. */
export function captureReportVersion(row: SemesterReportEntity): ReportVersion {
  const content = row.content ? structuredClone(row.content) : null;
  if (content)
    for (const field of [
      'classroomPhoto',
      'pet',
      'petAsOf',
      'petHistoryStatus',
      'scoreDetails',
    ])
      delete content[field];
  return JSON.parse(
    JSON.stringify({
      content,
      snapshot: row.snapshot ?? {},
      courseScope: row.courseScope ?? null,
    }),
  );
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
/** Include publication state so a newly published report requires a fresh
 * review/confirmation before restoration withdraws its public links. */
export function reportVersionToken(row: SemesterReportEntity) {
  return createHash('sha256')
    .update(
      JSON.stringify(
        canonical({
          version: captureReportVersion(row),
          status: row.status,
          publishedAt: row.publishedAt?.toISOString() ?? null,
        }),
      ),
    )
    .digest('hex');
}
function version(value: unknown): value is ReportVersion {
  if (!value || typeof value !== 'object') return false;
  const item = value as ReportVersion;
  return Boolean(
    item.snapshot &&
    typeof item.snapshot === 'object' &&
    !Array.isArray(item.snapshot) &&
    (item.content === null ||
      (item.content &&
        typeof item.content === 'object' &&
        !Array.isArray(item.content))) &&
    (item.courseScope === null || typeof item.courseScope === 'string'),
  );
}
export function readReportRevision(
  details: Record<string, unknown> | null,
): ReportRevision | null {
  const revision = details?.revision as ReportRevision | undefined;
  return revision?.schema === 1 &&
    version(revision.after) &&
    (!revision.before || version(revision.before))
    ? revision
    : null;
}
const text = (value: unknown) =>
  typeof value === 'string' && value ? value : '未填写';
const entries = (value: unknown) =>
  Array.isArray(value) && value.length
    ? value
        .map((item) => (typeof item === 'string' ? item : text(item?.text)))
        .join('\n')
    : '无';
const mastery: Record<string, string> = {
  unassessed: '待评价',
  mastered: '已掌握',
  practicing: '练习中',
  needs_support: '需加强',
};

function changesFor(revision: ReportRevision | null) {
  if (!revision) return [];
  const before = revision.before;
  const after = revision.after;
  const changes: Array<{ field: string; before: string; after: string }> = [];
  const add = (
    field: string,
    old: unknown,
    next: unknown,
    format: (value: unknown) => string = text,
  ) => {
    if (!isDeepStrictEqual(old, next)) {
      const a = format(old);
      const b = format(next);
      changes.push({
        field,
        before: a,
        after: a === b ? `${b}（引用依据或记录已调整）` : b,
      });
    }
  };
  for (const [key, label] of Object.entries({
    summary: '老师寄语',
    courseOverview: '课程概述',
    strengths: '课堂亮点',
    areasToImprove: '下一步重点',
    homeSuggestions: '家庭练习',
    limitations: '报告说明',
  })) {
    add(
      label,
      before?.content?.[key],
      after.content?.[key],
      ['summary', 'courseOverview'].includes(key) ? text : entries,
    );
  }
  for (const [key, label] of Object.entries({
    learningReadiness: '学习准备与课堂能力',
    communicationCooperation: '表达沟通与同伴合作',
    independenceRules: '生活自理与规则意识',
    overallUnderstanding: '综合画像理解',
  })) {
    add(
      label,
      (
        before?.content?.growthAssessment as Record<string, unknown> | undefined
      )?.[key],
      (
        after.content?.growthAssessment as Record<string, unknown> | undefined
      )?.[key],
    );
  }
  const performance = (state?: ReportVersion) => {
    const subjects = (state?.snapshot.reportSubjects ?? []) as Array<{
      subjectId: string;
      name: string;
    }>;
    const selections = (state?.snapshot.courseSelections ?? []) as Array<{
      subjectId: string;
    }>;
    const names = String(state?.snapshot.subjectName ?? '').split('、');
    return (
      (state?.content?.classroomPerformance ?? []) as Array<
        Record<string, unknown>
      >
    ).map((item) => ({
      ...item,
      text: item.subjectId
        ? `${subjects.find((subject) => subject.subjectId === item.subjectId)?.name ?? names[selections.findIndex((subject) => subject.subjectId === item.subjectId)] ?? '已选学科'}：${text(item.text)}`
        : text(item.text),
    }));
  };
  add('课堂表现', performance(before), performance(after), entries);
  const goals = (state?: ReportVersion) =>
    new Map(
      (
        (state?.content?.learningContents ?? []) as Array<
          Record<string, unknown>
        >
      ).map((item) => [String(item.id), item]),
    );
  const oldGoals = goals(before);
  const newGoals = goals(after);
  const manualGoal = (item?: Record<string, unknown>) =>
    Boolean(
      item &&
      (String(item.id).startsWith('manual-') ||
        (Array.isArray(item.sourceRefs) &&
          item.sourceRefs.some(
            (ref) =>
              typeof ref === 'string' && ref.startsWith('teacher-course:'),
          ))),
    );
  const goalText = (value: unknown) => {
    if (!value) return '未包含此学习内容';
    const item = value as Record<string, unknown>;
    return `${text(item.section)}\n${text(item.text)}${manualGoal(item) ? '' : `\n掌握情况：${mastery[String(item.mastery)] ?? '待评价'}`}`;
  };
  for (const id of new Set([...oldGoals.keys(), ...newGoals.keys()]))
    add(
      manualGoal(newGoals.get(id) ?? oldGoals.get(id))
        ? '学习内容'
        : '学习内容与掌握评价',
      oldGoals.get(id),
      newGoals.get(id),
      goalText,
    );
  add('报告学科', before?.snapshot.subjectName, after.snapshot.subjectName);
  add('授课范围', before?.courseScope, after.courseScope);
  if (
    before?.snapshot.classroomPhoto &&
    after.snapshot.classroomPhoto &&
    before.snapshot.classroomPhoto !== after.snapshot.classroomPhoto
  ) {
    changes.push({
      field: '课堂照片',
      before: '修改前的课堂照片',
      after: '替换后的课堂照片',
    });
  } else
    add(
      '课堂照片',
      before?.snapshot.classroomPhoto,
      after.snapshot.classroomPhoto,
      (value) => (value ? '已保存课堂照片' : '无课堂照片'),
    );
  for (const [key, label] of Object.entries({
    institutionName: '报告抬头',
    courseTheme: '课程主题',
    lessonNumber: '课次',
    lessonDate: '授课日期',
  })) {
    const old = before?.content?.reportDetails as
      | Record<string, unknown>
      | undefined;
    const next = after.content?.reportDetails as
      | Record<string, unknown>
      | undefined;
    add(label, old?.[key], next?.[key], (value) =>
      value == null || value === '' ? '未填写' : String(value),
    );
  }
  return changes;
}

const stateChanges: Record<
  string,
  { field: string; before: string; after: string }
> = {
  'generation-started': {
    field: '报告状态',
    before: '等待生成',
    after: '生成中',
  },
  'generation-failed': {
    field: '报告状态',
    before: '生成中',
    after: '生成失败',
  },
  'report-retried': {
    field: '报告状态',
    before: '生成失败',
    after: '等待重新生成',
  },
  'report-published': {
    field: '报告状态',
    before: '待审核草稿',
    after: '已发布',
  },
  'report-unpublished': {
    field: '报告状态',
    before: '已发布',
    after: '待审核草稿',
  },
  'share-created': {
    field: '家长分享链接',
    before: '尚未创建此链接',
    after: '已创建可用链接',
  },
  'share-revoked': { field: '家长分享链接', before: '可用', after: '已撤销' },
};

/** Expose Chinese comparisons without raw snapshots, source IDs, photo bytes
 * or sharing credentials. */
export function historyEventDto(
  event: ReportEventEntity,
  includeChanges = true,
) {
  const revision = readReportRevision(event.details);
  const changes = includeChanges ? changesFor(revision) : [];
  if (includeChanges && stateChanges[event.action])
    changes.push(stateChanges[event.action]!);
  return {
    actor: {
      id: event.actorAccountId ?? null,
      name:
        event.actorNameSnapshot ||
        (event.actorType === 'system'
          ? '系统生成'
          : '历史记录（未记录操作人）'),
      type: event.actorType || 'unknown',
    },
    id: event.id,
    action: event.action,
    label: labels[event.action] ?? '其他报告操作',
    createdAt: event.createdAt,
    description: revision
      ? '已保存报告版本，可查看修改内容。'
      : '此记录未保存历史版本，无法从该记录恢复。',
    changes,
    canRestoreBefore: Boolean(revision?.before?.content),
    canRestoreAfter: Boolean(revision?.after.content),
  };
}
