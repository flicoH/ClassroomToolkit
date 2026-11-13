import type { LearningReportContent } from "@/components/semester-reports/LearningReportView";
import type { PerformanceField } from "@/components/semester-reports/performance-config";

/** 学期定义：用于约束报告周期在有效学期起止区间内 */
export type Term = {
  /** 服务端稳定标识，用于请求和列表身份匹配。 */
  id: string;
  /** 面向教师展示的名称。 */
  name: string;
  /** 展示或填写的开始日（YYYY-MM-DD）。 */
  startDate: string;
  /** 展示或填写的包含式结束日（YYYY-MM-DD）。 */
  endDate: string;
  /** 当前学期提示，用于首次选择，不替代服务端归属校验。 */
  isCurrent?: boolean;
};

/** 学科定义：关联学科自定义课堂表现评价指标（最多 8 项，每项最多 4 个预设标签） */
export type Subject = {
  /** 服务端稳定标识，用于请求和列表身份匹配。 */
  id: string;
  /** 所属学期 ID，未绑定时为 null/undefined（兼容历史数据）。 */
  termId?: string | null;
  /** 面向教师展示的名称。 */
  name: string;
  /** 历史停用标识，兼容旧前端数据。 */
  isArchived?: boolean;
  /** 学科课堂评价预设；未配置时采用兼容默认值。 */
  performanceConfig?: PerformanceField[] | null;
  /** null/省略沿用四项默认标题；空数组表示不显示课程标题字段。 */
  courseContentTitles?: string[] | null;
};

/** 学生档案：包含基础班级积分与周期内领养的星灵宠成长形态信息 */
export type Student = {
  /** 服务端稳定标识，用于请求和列表身份匹配。 */
  id: string;
  /** 面向教师展示的名称。 */
  name: string;
  /** 班级标识；旧记录可能只有班级名称。 */
  classId?: string;
  /** 报告展示用班级名称。 */
  className: string;
  /** 当前积分，仅用于预览，不代表学科掌握度。 */
  score: number;
  /** 学生头像展示地址。 */
  avatar?: string;
  /** 领养宠物标识，未领养时可为空。 */
  petId?: string | null;
  /** 学生自定义宠物名称。 */
  petName?: string | null;
  /** 宠物展示形态。 */
  stage?: string;
  /** 宠物展示等级。 */
  level?: number;
  /** 是否已完成孵化。 */
  petHatched?: boolean;
  /** 兼容旧结构的宠物展示资料。 */
  pet?: {
    name: string;
    level: number;
    stage: string;
    icon?: string;
  };
};

/** 公开分享链接凭据：公开链接可带失效时间，家长端无需教师登录 */
export type ReportShare = {
  /** 服务端稳定标识，用于请求和列表身份匹配。 */
  id: string;
  /** 可直接打开的分享地址。 */
  url: string;
  /** 失效时间；缺省或 null 由服务端分享策略决定。 */
  expiresAt?: string | null;
};

/** 报告摘要条目：统一支持 V1 单科模式与 V2 多科综合模式，状态涵盖草稿生命周期 */
export type ReportSummaryItem = {
  /** 服务端稳定标识，用于请求和列表身份匹配。 */
  id: string;
  /** 旧版单科与新版多科报告的兼容标记。 */
  reportVersion?: "v1" | "v2";
  /** 学生逻辑标识，旧摘要可能缺失。 */
  studentId?: string;
  /** 报告展示用学生姓名。 */
  studentName: string;
  /** 班级标识；旧记录可能只有班级名称。 */
  classId?: string;
  /** 报告展示用班级名称。 */
  className: string;
  /** 旧接口的学科展示名称。 */
  subject?: string;
  /** 服务端快照中的学科展示名称。 */
  subjectName?: string;
  /** 报告归属学科标识。 */
  subjectId?: string;
  /** 冻结的学期展示名，停用学期后仍可展示。 */
  termName?: string;
  /** 报告归属学期标识。 */
  termId?: string;
  /** 本次报告引用的各学科教学范围。 */
  courseSelections?: Array<{ subjectId: string; courseScope?: string }>;
  /** 单科报告的教学范围；旧摘要可能缺失，服务端未设置时返回 null。 */
  courseScope?: string | null;
  /** 报告周期种类，stage 为阶段汇总。 */
  period: "week" | "month" | "term" | "stage";
  /** 兼容由学期周期承载的阶段汇总报告。 */
  isStageReport?: boolean;
  /** 阶段汇总替换“本阶段”的教师自定义称谓。 */
  stageCustomName?: string;
  /** 摘要展示用已汇总周报数。 */
  weeklyCount?: number;
  /** 摘要展示用资料覆盖率文案。 */
  coverageRate?: string;
  /** queued / generating 属于后台异步生成阶段，在前端归入待发布草稿范畴 */
  status: "queued" | "generating" | "draft" | "published" | "failed";
  /** 服务端创建时间。 */
  createdAt: string;
  /** 服务端最近更新时间。 */
  updatedAt: string;
  /** 兼容服务端统计区间的开始时间。 */
  start?: string;
  /** 兼容服务端统计区间的排除式结束时间。 */
  end?: string;
  /** 展示或填写的开始日（YYYY-MM-DD）。 */
  startDate?: string;
  /** 展示或填写的包含式结束日（YYYY-MM-DD）。 */
  endDate?: string;
  /** 当前有效分享摘要，无链接时为空。 */
  share?: {
    id: string;
    url: string;
    expiresAt?: string | null;
  } | null;
  /** 报告正文快照；仅有列表元数据时可省略。 */
  content?: LearningReportContent | null;
};

/** 课程教材文件记录：用于追溯教纲依据，支持 PDF 页面解析与关键词沉淀 */
export type CourseDocument = {
  /** 服务端稳定标识，用于请求和列表身份匹配。 */
  id: string;
  /** 报告归属学期标识。 */
  termId: string;
  /** 报告归属学科标识。 */
  subjectId: string;
  /** 教师可见的原始教材文件名。 */
  fileName: string;
  /** 资源当前处理状态，取值由各类型限定。 */
  status: "uploading" | "queued" | "parsing" | "needs_review" | "ready" | "failed";
  /** 已解析或确认的章节名称。 */
  units?: string[];
  /** 解析失败时供教师处理的错误说明。 */
  errorMessage?: string | null;
  /** 已解析 PDF 总页数。 */
  pageCount?: number;
  /** 教材提取的词汇线索。 */
  extractedKeywords?: string[];
  /** 教材提取的句型或语法线索。 */
  extractedGrammar?: string[];
  /** 教材提取的能力目标线索。 */
  extractedCompetencies?: string[];
  /** 服务端创建时间。 */
  createdAt: string;
};

/** AI 阶段汇总定时任务：由云端守护进程独立调度，支持多任务、修改、立即执行与离线执行 */
export type StageScheduledTask = {
  /** 服务端稳定标识，用于请求和列表身份匹配。 */
  id: string;
  /** 面向教师展示的名称。 */
  name: string;
  /** 班级标识；旧记录可能只有班级名称。 */
  classId?: string;
  /** 报告展示用班级名称。 */
  className: string;
  /** 当前任务明确选定的学生 ID。 */
  studentIds: string[];
  /** 任务列表展示的学生姓名摘要。 */
  studentNames: string;
  /** 展示或填写的开始日（YYYY-MM-DD）。 */
  startDate: string;
  /** 展示或填写的包含式结束日（YYYY-MM-DD）。 */
  endDate: string;
  /** 教师选择的计划执行日期。 */
  schedDate: string;
  /** 教师选择的计划执行时间。 */
  schedTime: string;
  /** 用于前端时间比较的毫秒时间戳。 */
  executeTimestamp: number;
  /** 资源当前处理状态，取值由各类型限定。 */
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  /** 任务重复周期，省略时由现有调度逻辑处理。 */
  repeatType?: "none" | "weekly" | "monthly";
  /** 阶段汇总替换“本阶段”的教师自定义称谓。 */
  stageCustomName?: string;
  /** 是否由服务端调度并支持前端离线执行。 */
  isCloudDaemon: boolean;
  /** 服务端创建时间。 */
  createdAt?: string;
  /** 已创建报告数量。 */
  generatedCount?: number;
  /** 本次任务计划处理的报告总数。 */
  totalCount?: number;
  /** 已完成的报告数量。 */
  completedCount?: number;
  /** 正在生成的报告数量。 */
  processingCount?: number;
  /** 生成失败的报告数量。 */
  failedCount?: number;
  /** 服务端提供的任务进度百分比。 */
  progressPercent?: number;
};
