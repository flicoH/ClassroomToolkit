import type { LearningReportContent } from "@/components/semester-reports/LearningReportView";
import type { PerformanceField } from "@/components/semester-reports/performance-config";

/** 学期定义：用于约束报告周期在有效学期起止区间内 */
export type Term = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent?: boolean;
};

/** 学科定义：关联学科自定义课堂表现评价指标（最多 8 项，每项最多 4 个预设标签） */
export type Subject = {
  id: string;
  name: string;
  isArchived?: boolean;
  performanceConfig?: PerformanceField[] | null;
};

/** 学生档案：包含基础班级积分与周期内领养的星灵宠成长形态信息 */
export type Student = {
  id: string;
  name: string;
  classId?: string;
  className: string;
  score: number;
  avatar?: string;
  petId?: string | null;
  petName?: string | null;
  stage?: string;
  level?: number;
  petHatched?: boolean;
  pet?: {
    name: string;
    level: number;
    stage: string;
    icon?: string;
  };
};

/** 公开分享链接凭据：43 位安全随机 Token，提供 8 小时家长端免密安全查看 */
export type ReportShare = {
  id: string;
  url: string;
  expiresAt?: string | null;
};

/** 报告摘要条目：统一支持 V1 单科模式与 V2 多科综合模式，状态涵盖草稿生命周期 */
export type ReportSummaryItem = {
  id: string;
  reportVersion?: "v1" | "v2";
  studentId?: string;
  studentName: string;
  classId?: string;
  className: string;
  subject?: string;
  subjectName?: string;
  subjectId?: string;
  termId?: string;
  courseSelections?: Array<{ subjectId: string; courseScope?: string }>;
  period: "week" | "month" | "term" | "stage";
  isStageReport?: boolean;
  stageCustomName?: string;
  weeklyCount?: number;
  coverageRate?: string;
  /** queued / generating 属于后台异步生成阶段，在前端归入待发布草稿范畴 */
  status: "queued" | "generating" | "draft" | "published" | "failed";
  createdAt: string;
  updatedAt: string;
  start?: string;
  end?: string;
  startDate?: string;
  endDate?: string;
  share?: {
    id: string;
    url: string;
    expiresAt?: string | null;
  } | null;
  content?: LearningReportContent | null;
};

/** 课程教材文件记录：用于追溯教纲依据，支持 PDF 页面解析与关键词沉淀 */
export type CourseDocument = {
  id: string;
  termId: string;
  subjectId: string;
  fileName: string;
  status: "uploading" | "queued" | "parsing" | "needs_review" | "ready" | "failed";
  units?: string[];
  errorMessage?: string | null;
  pageCount?: number;
  extractedKeywords?: string[];
  extractedGrammar?: string[];
  extractedCompetencies?: string[];
  createdAt: string;
};

/** AI 阶段汇总定时任务：由云端守护进程独立调度，支持多任务、修改、立即执行与离线执行 */
export type StageScheduledTask = {
  id: string;
  name: string;
  classId?: string;
  className: string;
  studentIds: string[];
  studentNames: string;
  startDate: string;
  endDate: string;
  schedDate: string;
  schedTime: string;
  executeTimestamp: number;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  repeatType?: "none" | "weekly" | "monthly";
  stageCustomName?: string;
  isCloudDaemon: boolean;
  createdAt?: string;
  generatedCount?: number;
  totalCount?: number;
  completedCount?: number;
  processingCount?: number;
  failedCount?: number;
  progressPercent?: number;
};
