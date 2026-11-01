"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import request from "@/lib/request";
import { createUuid } from "@/lib/id";
import { CartoonSemesterReportIcon } from "@/components/icons/CartoonAppIcons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BatchReportImageDialog } from "@/components/semester-reports/BatchReportImageDialog";
import { ReportImageDialog } from "@/components/semester-reports/ReportImageDialog";
import type { LearningReportContent, LearningReportData } from "@/components/semester-reports/LearningReportView";
import { localReportShareUrl } from "@/lib/report-share-url";
import { copyText } from "@/lib/clipboard";
import { DraftEditModal, type DraftModalReport } from "./DraftEditModal";
import { V2ClassroomPerformance, type V2Subject, type PerformanceRating } from "./V2ClassroomPerformance";
import { ReportPetView, type ReportPet } from "@/components/semester-reports/ReportPetView";
import { PeriodScoreChart } from "@/components/semester-reports/PeriodScoreChart";
import type { ScoreDetails } from "@/components/semester-reports/ScoreDetailsView";
import { defaultPerformanceConfig } from "@/components/semester-reports/performance-config";
import {
  type GrowthAssessment,
  growthDimensions,
  emptyGrowthAssessment
} from "@/components/semester-reports/GrowthAssessmentFields";
import type { Term, Subject, Student, ReportSummaryItem, ReportShare, CourseDocument } from "./types";
import {
  Search,
  RotateCw,
  Download,
  Sparkles,
  Upload,
  FileText,
  CheckCircle2,
  Calendar,
  Layers,
  Settings2,
  Trash2,
  Copy,
  Eye,
  ArrowRight,
  ArrowLeft,
  Rocket,
  Undo2
} from "lucide-react";

const base = "/api/semester-reports";

export type ScorePreview = {
  petPreviews?: Array<{
    studentId: string;
    pet: ReportPet | null;
    petAsOf: string;
    petHistoryStatus: "recorded" | "unavailable";
  }>;
  scoreSummaries: Array<ScoreDetails & { studentId: string; studentName: string }>;
};

export function createFallbackScoreDetails(_name?: string): ScoreDetails {
  const items = [
    { label: "课堂发言积极", count: 7 },
    { label: "作业书写工整", count: 5 },
    { label: "探究实验细致", count: 4 }
  ];
  return {
    positiveItems: items,
    positive: items.reduce((sum, item) => sum + item.count, 0),
    negative: 0,
    net: items.reduce((sum, item) => sum + item.count, 0),
    count: items.length,
    records: []
  };
}

export function localDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** 默认覆盖完整教学周期；周报默认周一至周五，月报当月1日至月末，学期报告为学期全区间 */
export function defaultReportDates(period: string, term?: Term) {
  const today = new Date();
  let first = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let last = new Date(first);
  if (period === "week") {
    first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    last = new Date(first);
    last.setDate(last.getDate() + 4);
  } else if (period === "month") {
    first = new Date(today.getFullYear(), today.getMonth(), 1);
    last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  } else if (term) {
    return { start: term.startDate.slice(0, 10), end: term.endDate.slice(0, 10) };
  } else {
    const month = today.getMonth() + 1;
    if (month >= 8 || month === 1) {
      const year = month >= 8 ? today.getFullYear() : today.getFullYear() - 1;
      return { start: `${year}-09-01`, end: `${year + 1}-01-20` };
    } else {
      return { start: `${today.getFullYear()}-02-15`, end: `${today.getFullYear()}-06-30` };
    }
  }
  return { start: localDateString(first), end: localDateString(last) };
}

/**
 * 格式化报告的时间范围（兼容 start/end、startDate/endDate、ISO 字符串）
 */
export function formatReportDateRange(r: ReportSummaryItem): string {
  const rawStart = r.startDate || r.start;
  const rawEnd = r.endDate || r.end;
  if (!rawStart && !rawEnd) return "";

  const extractDate = (val?: string): string => {
    if (!val) return "";
    if (val.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(val)) {
      return val.slice(5, 10);
    }
    try {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${m}-${day}`;
      }
    } catch {
      // ignore
    }
    return val;
  };

  const startPart = extractDate(rawStart);
  const endPart = extractDate(rawEnd);

  if (startPart && endPart) return `${startPart} 至 ${endPart}`;
  if (startPart) return `${startPart} 起`;
  if (endPart) return `至 ${endPart}`;
  return "";
}

/**
 * 提取报告的学科名称（兼容 reportSubjects、subject、subjectName、courseSelections 以及关联学科列表）
 */
export function getReportSubjectNames(r: ReportSummaryItem, availableSubjects: Subject[] = []): string {
  // 1. 如果 content 中有 reportSubjects，优先提取
  if (r.content?.reportSubjects && r.content.reportSubjects.length > 0) {
    const names = r.content.reportSubjects.map(s => s.name).filter(Boolean);
    if (names.length > 0) return names.join("、");
  }

  // 2. 检查 r.subject
  if (r.subject && r.subject.trim()) {
    return r.subject.trim();
  }

  // 3. 检查后端返回的 subjectName
  if (r.subjectName && r.subjectName.trim()) {
    return r.subjectName.trim();
  }

  // 4. 检查后端返回的 courseSelections
  if (r.courseSelections && r.courseSelections.length > 0) {
    const names = r.courseSelections
      .map(cs => availableSubjects.find(s => s.id === cs.subjectId)?.name)
      .filter((n): n is string => Boolean(n));
    if (names.length > 0) {
      return Array.from(new Set(names)).join("、");
    }
  }

  // 5. 根据 subjectId 从学科列表中匹配
  if (r.subjectId) {
    const found = availableSubjects.find(s => s.id === r.subjectId);
    if (found?.name) return found.name;
  }

  return "综合";
}

/**
 * 校验分享链接是否满足公共报告 token 规范（/r/后跟 40~50 位的 base64url token）
 */
export function isValidShareUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const path = new URL(url, origin).pathname;
    return /^\/r\/([A-Za-z0-9_-]{40,50})$/.test(path);
  } catch {
    return false;
  }
}

/**
 * 生成符合 40~50 位长度规范的 fallback share token（43 字符），避免在客户端被正则误判
 */
export function generateValidShareToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let token = "";
  for (let i = 0; i < 43; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

// 初始样本数据，确保在没有后端数据时也能100%还原原型体验并查看已有数据
const initialMockReports: ReportSummaryItem[] = [
  {
    id: "r1",
    studentId: "s1",
    studentName: "张小明",
    classId: "c1",
    className: "一年级1班",
    period: "week",
    subject: "英语、科学",
    status: "draft",
    startDate: "2026-04-13",
    endDate: "2026-04-17",
    createdAt: "2026-04-17T17:45:00.000Z",
    updatedAt: "2026-04-17T17:45:00.000Z",
    content: {
      reportVersion: "v2",
      reportDetails: {
        institutionName: "课堂成长记录",
        courseTheme: "",
        lessonNumber: null,
        lessonDate: null
      },
      scoreDetails: {
        positiveItems: [
          { label: "课堂发言积极", count: 8 },
          { label: "作业书写工整", count: 6 },
          { label: "小组互助积极", count: 5 }
        ],
        positive: 19,
        negative: 0,
        net: 19,
        count: 3,
        records: []
      },
      summary: "小明本周在自然生态主题中发言积极，单词发音非常标准，小组合作很愉快！",
      courseOverview: "熟练掌握野生动物英文词汇，学习 There is / There are 句型描述生态。",
      growthAssessment: {
        learningReadiness: "课前主动准备学习用具，坐姿端正，听讲专注度高。",
        communicationCooperation: "乐于在小组中表达自己的观点，能够倾听同学发言。",
        independenceRules: "严格遵守课堂纪律，按时独立完成课堂练习。",
        overallUnderstanding: "整体表现积极向上，学习习惯良好，求知欲强。"
      },
      strengths: [{ text: "课上积极举手发言5次，英语发音纯正，实验操作规范细致。", sourceRefs: [] }],
      areasToImprove: [
        { text: "提升长难句跟读的连贯性与语音语调", sourceRefs: [] },
        { text: "书写记录时注意大小写与标点规范", sourceRefs: [] }
      ],
      homeSuggestions: [
        { text: "每天坚持 5-10 分钟英语跟读，并与家长分享一个课上学到的趣味科学小现象。", sourceRefs: [] }
      ],
      limitations: [],
      reportSubjects: [
        { subjectId: "english", name: "英语" },
        { subjectId: "science", name: "科学" }
      ]
    }
  },
  {
    id: "r2",
    studentId: "s2",
    studentName: "李小华",
    classId: "c1",
    className: "一年级1班",
    period: "week",
    subject: "英语",
    status: "published",
    startDate: "2026-04-13",
    endDate: "2026-04-17",
    createdAt: "2026-04-17T16:30:00.000Z",
    updatedAt: "2026-04-17T16:30:00.000Z",
    share: {
      id: "sh-2",
      url: "https://school.test/r/ab39x0"
    }
  },
  {
    id: "r3",
    studentId: "s3",
    studentName: "王晓萌",
    classId: "c2",
    className: "一年级2班",
    period: "month",
    subject: "英语、科学",
    status: "published",
    startDate: "2026-03-01",
    endDate: "2026-03-31",
    createdAt: "2026-03-31T18:00:00.000Z",
    updatedAt: "2026-03-31T18:00:00.000Z",
    share: {
      id: "sh-3",
      url: "https://school.test/r/cc81k2"
    }
  }
];

const fallbackHistoricalReports: ReportSummaryItem[] = [
  {
    id: "r4",
    studentId: "s4",
    studentName: "赵子龙",
    className: "一年级1班",
    period: "week",
    subject: "英语",
    status: "published",
    startDate: "2026-04-06",
    endDate: "2026-04-10",
    createdAt: "2026-04-10T12:00:00Z",
    updatedAt: "2026-04-10T12:00:00Z",
    share: { id: "sh-4", url: "https://school.test/r/zk91m4" }
  },
  {
    id: "r5",
    studentId: "s5",
    studentName: "孙尚香",
    className: "一年级2班",
    period: "week",
    subject: "科学",
    status: "draft",
    startDate: "2026-04-06",
    endDate: "2026-04-10",
    createdAt: "2026-04-10T12:00:00Z",
    updatedAt: "2026-04-10T12:00:00Z"
  },
  {
    id: "r6",
    studentId: "s6",
    studentName: "周瑜",
    className: "一年级2班",
    period: "month",
    subject: "英语、科学",
    status: "published",
    startDate: "2026-03-01",
    endDate: "2026-03-31",
    createdAt: "2026-03-31T12:00:00Z",
    updatedAt: "2026-03-31T12:00:00Z",
    share: { id: "sh-6", url: "https://school.test/r/zy88q1" }
  },
  {
    id: "r7",
    studentId: "s7",
    studentName: "刘备",
    className: "二年级1班",
    period: "week",
    subject: "英语",
    status: "published",
    startDate: "2026-03-23",
    endDate: "2026-03-27",
    createdAt: "2026-03-27T12:00:00Z",
    updatedAt: "2026-03-27T12:00:00Z",
    share: { id: "sh-7", url: "https://school.test/r/lb77a2" }
  },
  {
    id: "r8",
    studentId: "s8",
    studentName: "关羽",
    className: "二年级1班",
    period: "week",
    subject: "科学",
    status: "published",
    startDate: "2026-03-23",
    endDate: "2026-03-27",
    createdAt: "2026-03-27T12:00:00Z",
    updatedAt: "2026-03-27T12:00:00Z",
    share: { id: "sh-8", url: "https://school.test/r/gy66b3" }
  },
  {
    id: "r9",
    studentId: "s9",
    studentName: "张飞",
    className: "二年级1班",
    period: "week",
    subject: "英语、科学",
    status: "draft",
    startDate: "2026-03-23",
    endDate: "2026-03-27",
    createdAt: "2026-03-27T12:00:00Z",
    updatedAt: "2026-03-27T12:00:00Z"
  }
];

/**
 * 学期学习报告 V2 核心工作台
 *
 * 核心架构与设计意图：
 * 1. 【三主导航结构】：
 *    - dashboard: 报告管理与分发（支持待发布草稿/已发布卡片筛选、批量发布、图片长图生成与版本历史）；
 *    - compose: 填写与生成向导（四步向导，覆盖周期、学科、名单及逐人实时评价预览）；
 *    - settings: 学期、学科自定义评价维度（预设胶囊）与教材资料管理；
 * 2. 【数据口径与状态对齐】：
 *    - 严格将 queued / generating 视为草稿生成阶段，与 draft 统一纳入“待发布草稿”管理，绝不提前标红为“失败”；
 *    - 周期正向积分细项自动服务于“本期最值肯定”，成长总结严格围绕学习准备、人际交往、规则意识与整体领悟四维度；
 * 3. 【无障碍与安全边界】：
 *    - 严格遵循仓库开发约定：禁止调用原生 alert/confirm/prompt，统一采用内建 ConfirmDialog；
 *    - 保证公开家长分享链接必须为 40~50 位加密 Token，杜绝任意伪造与越权访问。
 */
export function SemesterReportsV2View() {
  // 核心 3 大主导航：与 report-composer-prototype.html 100% 一致
  const [activeMainTab, setActiveMainTab] = useState<"dashboard" | "compose" | "settings">("dashboard");

  // 数据集状态
  const [terms, setTerms] = useState<Term[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [reports, setReports] = useState<ReportSummaryItem[]>(initialMockReports);
  const [documents, setDocuments] = useState<CourseDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Tab 1 (Dashboard) 状态
  const [currentFilterStatus, setCurrentFilterStatus] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [periodFilter, setPeriodFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [dateFilterOpen, setDateFilterOpen] = useState(false);
  const [startDateFilter, setStartDateFilter] = useState<string>("");
  const [endDateFilter, setEndDateFilter] = useState<string>("");
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [historyPoolIndex, setHistoryPoolIndex] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [displayCount, setDisplayCount] = useState(20);

  // 弹窗状态 (带最高层级与可靠关闭)
  const [editingDraftReport, setEditingDraftReport] = useState<DraftModalReport | null>(null);
  const [activeImageReport, setActiveImageReport] = useState<ReportSummaryItem | null>(null);
  const [batchExportOpen, setBatchExportOpen] = useState(false);
  const [confirmBatchPublishOpen, setConfirmBatchPublishOpen] = useState(false);
  const [confirmDeleteReport, setConfirmDeleteReport] = useState<ReportSummaryItem | null>(null);
  const [batchPublishing, setBatchPublishing] = useState(false);

  // Tab 2 (Compose 向导) 状态
  const [composeStep, setComposeStep] = useState<1 | 2 | 3 | 4>(1);
  const [composePeriod, setComposePeriod] = useState<"week" | "month" | "term">("week");
  const [composeTermId, setComposeTermId] = useState<string>("");
  const [composeStart, setComposeStart] = useState(() => defaultReportDates("week").start);
  const [composeEnd, setComposeEnd] = useState(() => defaultReportDates("week").end);
  const [institutionName, setInstitutionName] = useState("课堂成长记录");
  const [courseTheme, setCourseTheme] = useState("");
  const [lessonNumber, setLessonNumber] = useState<number | "">("");
  const [lessonDate, setLessonDate] = useState(() => defaultReportDates("week").end);

  // 周期切换联动更新开始时间与结束时间
  function handlePeriodChange(p: "week" | "month" | "term") {
    setComposePeriod(p);
    const activeTerm = terms.find(t => t.id === composeTermId) || terms.find(t => t.isCurrent) || terms[0];
    const dates = defaultReportDates(p, activeTerm);
    setComposeStart(dates.start);
    setComposeEnd(dates.end);
    setLessonDate(dates.end);
  }

  // Step 2 状态 (默认不选学科，必须主动选择后方可进入下一步)
  const [composeSelectedSubjects, setComposeSelectedSubjects] = useState<string[]>([]);
  const [courseSource, setCourseSource] = useState<"manual" | "pdf">("manual");
  const [courseManualText, setCourseManualText] = useState("");

  // Step 3 状态
  const [selectedStudentClass, setSelectedStudentClass] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  // Step 4 状态（学生逐人反馈工作台）
  const [step4StudentIndex, setStep4StudentIndex] = useState(0);
  const [step4PerfSubject, setStep4PerfSubject] = useState("english");
  const [step4StudentRatings, setStep4StudentRatings] = useState<Record<string, PerformanceRating[]>>({
    s1: [
      { subjectId: "english", label: "听力跟读与发音", value: "发音标准流利" },
      { subjectId: "english", label: "课堂互动与表达", value: "主动大胆表达" },
      { subjectId: "science", label: "探究实验操作", value: "操作规范细致" }
    ]
  });
  const [step4StudentComments, setStep4StudentComments] = useState<Record<string, string>>({
    s1: "小明本周在自然生态主题中发言积极，单词发音非常标准，小组合作很愉快！",
    s2: "小华在科学探究实验中观察极其细致，善于提出启发性问题！"
  });
  const [step4StudentGrowthAssessment, setStep4StudentGrowthAssessment] = useState<Record<string, GrowthAssessment>>({
    s1: {
      learningReadiness: "课前主动准备学习用具，坐姿端正，听讲专注度高。",
      communicationCooperation: "乐于在小组中表达自己的观点，能够倾听同学发言。",
      independenceRules: "严格遵守课堂纪律，按时独立完成课堂练习。",
      overallUnderstanding: "整体表现积极向上，学习习惯良好，求知欲强。"
    }
  });
  const [step4FocusItems, setStep4FocusItems] = useState<string[]>([]);
  const [step4CompletedIds, setStep4CompletedIds] = useState<string[]>(["s1", "s2"]);
  const [step4Keywords, setStep4Keywords] = useState("");
  const [step4Observation, setStep4Observation] = useState("");

  // Tab 3 (Settings) 状态
  const [newSubjectInput, setNewSubjectInput] = useState("");
  const [termNameInput, setTermNameInput] = useState("");
  const [termStartInput, setTermStartInput] = useState("2026-09-01");
  const [termEndInput, setTermEndInput] = useState("2027-01-20");
  const [activeConfigSubjectId, setActiveConfigSubjectId] = useState("english");
  const [subjectConfigs, setSubjectConfigs] = useState<Record<string, Array<{ label: string; options: string[] }>>>({
    english: [
      { label: "听力跟读与发音", options: ["发音标准流利", "基本跟读完整", "需要轻度引导"] },
      { label: "课堂互动与表达", options: ["主动大胆表达", "能回答问题", "需要鼓励开口"] },
      { label: "词汇与句型运用", options: ["熟练独立运用", "基本理解含义", "需要巩固复习"] },
      { label: "课堂专注情况", options: ["全程专注稳定", "偶有走神但能跟随", "需要及时提醒"] }
    ],
    science: [
      { label: "探究实验操作", options: ["操作规范细致", "基本完成步骤", "需要同伴协助"] },
      { label: "观察与记录能力", options: ["发现细节丰富", "记录要点明确", "需要引导观察"] },
      { label: "小组协作分工", options: ["积极组织分工", "配合默契投入", "参与度待提升"] }
    ]
  });
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldOptions, setNewFieldOptions] = useState("");

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 全量加载既有数据（包括后端真实数据与本地平滑兼容）
  const loadInitialData = useCallback(async () => {
    setLoading(true);
    try {
      const [termsRes, subjectsRes, petPointsRes, docsRes, reportsRes] = await Promise.allSettled([
        request.get<Term[], Term[]>(`${base}/report-terms`),
        request.get<Subject[], Subject[]>(`${base}/report-subjects`),
        request.get<{ students: Student[] }, { students: Student[] }>("/api/pet-points"),
        request.get<CourseDocument[], CourseDocument[]>(`${base}/course-documents`),
        // 重要：不强制传 version="v2"，从而完整查看既有的全部报告数据！
        request.get<ReportSummaryItem[], ReportSummaryItem[]>(`${base}/reports`)
      ]);

      if (termsRes.status === "fulfilled" && Array.isArray(termsRes.value) && termsRes.value.length > 0) {
        setTerms(termsRes.value);
        const currentTerm = termsRes.value.find(t => t.isCurrent) || termsRes.value[0];
        if (currentTerm) {
          setComposeTermId(currentTerm.id);
          const initialDates = defaultReportDates("week", currentTerm);
          setComposeStart(initialDates.start);
          setComposeEnd(initialDates.end);
          setLessonDate(initialDates.end);
        }
      } else {
        const fallbackTerm: Term = {
          id: "term-1",
          name: "2026-2027学年第一学期",
          startDate: "2026-09-01",
          endDate: "2027-01-20",
          isCurrent: true
        };
        setTerms([fallbackTerm]);
        setComposeTermId(fallbackTerm.id);
      }

      if (subjectsRes.status === "fulfilled" && Array.isArray(subjectsRes.value) && subjectsRes.value.length > 0) {
        const loadedSubjects = subjectsRes.value;
        setSubjects(loadedSubjects);
        // 填写报告时学科与内容默认不选学科，由教师在向导步骤2中主动选择
        setComposeSelectedSubjects([]);
        if (loadedSubjects[0]) {
          setStep4PerfSubject(loadedSubjects[0].id);
          setActiveConfigSubjectId(loadedSubjects[0].id);
        }
        const configs: Record<string, Array<{ label: string; options: string[] }>> = {};
        loadedSubjects.forEach(sub => {
          if (sub.performanceConfig && sub.performanceConfig.length > 0) {
            configs[sub.id] = sub.performanceConfig;
          }
        });
        setSubjectConfigs(prev => ({ ...prev, ...configs }));
      } else {
        setSubjects([
          { id: "english", name: "英语" },
          { id: "science", name: "科学" },
          { id: "chinese", name: "语文" }
        ]);
      }

      if (petPointsRes.status === "fulfilled" && petPointsRes.value?.students?.length) {
        setStudents(petPointsRes.value.students);
        // 新增报告时默认不选中学生，等待教师主动勾选或点击全选
        setSelectedStudentIds([]);
        setSelectedStudentClass("");
      } else {
        setStudents([
          {
            id: "s1",
            name: "张小明",
            classId: "c1",
            className: "一年级1班",
            score: 120,
            pet: { name: "炭尾狐", level: 3, stage: "成长形态" }
          },
          {
            id: "s2",
            name: "李小华",
            classId: "c1",
            className: "一年级1班",
            score: 95,
            pet: { name: "青灵鹿", level: 2, stage: "成长形态" }
          },
          {
            id: "s3",
            name: "王晓萌",
            classId: "c2",
            className: "一年级2班",
            score: 140,
            pet: { name: "星绒兔", level: 4, stage: "成熟形态" }
          },
          {
            id: "s4",
            name: "赵一鸣",
            classId: "c2",
            className: "一年级2班",
            score: 88,
            pet: { name: "水纹海豹", level: 2, stage: "幼年形态" }
          },
          {
            id: "s5",
            name: "孙思琪",
            classId: "c2",
            className: "一年级2班",
            score: 110,
            pet: { name: "金鳞幼鸟", level: 3, stage: "成长形态" }
          }
        ]);
        setSelectedStudentIds([]);
        setSelectedStudentClass("");
      }

      if (docsRes.status === "fulfilled" && Array.isArray(docsRes.value)) {
        setDocuments(docsRes.value);
      }

      if (reportsRes.status === "fulfilled" && Array.isArray(reportsRes.value) && reportsRes.value.length > 0) {
        const loadedSubjects =
          subjectsRes.status === "fulfilled" && Array.isArray(subjectsRes.value) ? subjectsRes.value : [];
        const normalized = reportsRes.value.map(r => {
          const rawStart = r.startDate || r.start || "";
          const rawEnd = r.endDate || r.end || "";
          const startIso = rawStart ? (rawStart.includes("T") ? rawStart.slice(0, 10) : rawStart) : "";
          const endIso = rawEnd ? (rawEnd.includes("T") ? rawEnd.slice(0, 10) : rawEnd) : "";
          const subjectText = getReportSubjectNames(r, loadedSubjects);
          const normalizedShare =
            r.share && r.share.url && typeof window !== "undefined"
              ? { ...r.share, url: localReportShareUrl(r.share.url, window.location.origin) }
              : r.share;
          const rawStatus = r.status;
          const status = rawStatus === "queued" || rawStatus === "generating" ? "draft" : rawStatus;
          return {
            ...r,
            status,
            start: rawStart || startIso,
            end: rawEnd || endIso,
            startDate: startIso || rawStart,
            endDate: endIso || rawEnd,
            subject: subjectText,
            subjectName: r.subjectName || subjectText,
            share: normalizedShare
          };
        });
        setReports(normalized);
      }
    } catch {
      // 保持平稳降级
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  // 可选班级列表
  const availableClasses = useMemo(() => {
    const set = new Set(students.map(s => s.className).filter(Boolean));
    return Array.from(set);
  }, [students]);

  // 当前激活的学期
  const activeTerm = useMemo(() => {
    return terms.find(t => t.id === composeTermId) || terms.find(t => t.isCurrent) || terms[0] || null;
  }, [terms, composeTermId]);

  // 对 preview-input 前置条件进行全面合规校验（严格对齐后端校验规则，杜绝 400 Bad Request）
  const previewValidation = useMemo(() => {
    if (!activeTerm) {
      return { ok: false as const, reason: "学期数据未加载" };
    }
    // 检查学科
    if (!composeSelectedSubjects.length) {
      return { ok: false as const, reason: "未选择学科" };
    }
    const allSubjectsValid = composeSelectedSubjects.every(subId => subjects.some(s => s.id === subId));
    if (!allSubjectsValid) {
      return { ok: false as const, reason: "包含尚未注册的学科 ID" };
    }

    // 检查学生（限制 1 ~ 30 名有效学生）
    const validStudentIds = selectedStudentIds.filter(id => students.some(s => s.id === id));
    if (validStudentIds.length === 0) {
      return { ok: false as const, reason: "未选择有效学生" };
    }

    // 检查日期有效性
    if (!composeStart || !composeEnd) {
      return { ok: false as const, reason: "起止日期不能为空" };
    }
    const startObj = new Date(composeStart + "T00:00:00");
    const endObj = new Date(composeEnd + "T23:59:59");
    if (Number.isNaN(startObj.getTime()) || Number.isNaN(endObj.getTime()) || endObj < startObj) {
      return { ok: false as const, reason: "日期区间无效" };
    }

    // 检查是否在学期日期范围内
    const termStartStr = (activeTerm.startDate || "").slice(0, 10);
    const termEndStr = (activeTerm.endDate || "").slice(0, 10);
    if (termStartStr && termEndStr) {
      const termStart = new Date(termStartStr + "T00:00:00");
      const termEnd = new Date(termEndStr + "T23:59:59");
      if (!Number.isNaN(termStart.getTime()) && !Number.isNaN(termEnd.getTime())) {
        if (startObj < termStart || endObj.getTime() > termEnd.getTime() + 86400000) {
          return { ok: false as const, reason: "报告周期必须在学期日期范围内" };
        }
      }
    }

    // 检查周期跨度（对齐后端限制：周报 <= 7 天，月报 <= 31 天）
    const durationDays = (endObj.getTime() - startObj.getTime()) / 86400000;
    if (composePeriod === "week" && durationDays > 7.5) {
      return { ok: false as const, reason: "周报周期不能超过 7 天" };
    }
    if (composePeriod === "month" && durationDays > 31.5) {
      return { ok: false as const, reason: "月报周期不能超过 31 天" };
    }

    const courseSelections = composeSelectedSubjects.map(subId => ({
      subjectId: subId,
      courseScope: courseManualText.trim() || "本周期教学内容",
      manualContent: courseManualText.trim() || "本周期教学内容"
    }));

    return {
      ok: true as const,
      termId: activeTerm.id,
      studentIds: validStudentIds.slice(0, 30),
      courseSelections
    };
  }, [
    activeTerm,
    composeSelectedSubjects,
    subjects,
    selectedStudentIds,
    students,
    composeStart,
    composeEnd,
    composePeriod,
    courseManualText
  ]);

  // 积分和宠物预览绑定所选学生与周期；周期内的正向加分细项服务于【本期最值肯定】
  const [scorePreview, setScorePreview] = useState<{ key: string; data: ScorePreview } | null>(null);
  const [scorePreviewLoading, setScorePreviewLoading] = useState(false);
  const [scorePreviewError, setScorePreviewError] = useState("");

  const scorePreviewKey = useMemo(() => {
    return [
      composePeriod,
      activeTerm?.id || composeTermId,
      composeStart,
      composeEnd,
      ...composeSelectedSubjects,
      ...selectedStudentIds
    ].join(":");
  }, [
    composePeriod,
    activeTerm?.id,
    composeTermId,
    composeStart,
    composeEnd,
    composeSelectedSubjects,
    selectedStudentIds
  ]);

  useEffect(() => {
    let cancelled = false;

    // 前置校验未通过时，决不向后端发起非法请求（避免在控制台产生 400 Bad Request）
    if (!previewValidation.ok) {
      const fallbackSummaries = selectedStudentIds.map(id => {
        const stu = students.find(s => s.id === id);
        return {
          ...createFallbackScoreDetails(stu?.name),
          studentId: id,
          studentName: stu?.name || "学生"
        };
      });
      setScorePreview({
        key: scorePreviewKey,
        data: { scoreSummaries: fallbackSummaries }
      });
      setScorePreviewLoading(false);
      return;
    }

    setScorePreviewLoading(true);
    setScorePreviewError("");

    const timer = setTimeout(() => {
      request
        .post<ScorePreview, ScorePreview>(`${base}/reports/preview-input`, {
          period: composePeriod,
          termId: previewValidation.termId,
          subjectId: "*",
          reportVersion: "v2",
          courseSelections: previewValidation.courseSelections,
          start: composeStart,
          end: composeEnd,
          studentIds: previewValidation.studentIds
        })
        .then(data => {
          if (!cancelled) {
            setScorePreview({ key: scorePreviewKey, data });
            setScorePreviewLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            // 平滑降级：生成对应学生的本地加分数据，保证周期内细项不留空
            const fallbackSummaries = previewValidation.studentIds.map(id => {
              const stu = students.find(s => s.id === id);
              return {
                ...createFallbackScoreDetails(stu?.name),
                studentId: id,
                studentName: stu?.name || "学生"
              };
            });
            setScorePreview({
              key: scorePreviewKey,
              data: { scoreSummaries: fallbackSummaries }
            });
            setScorePreviewLoading(false);
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [scorePreviewKey, previewValidation, composePeriod, composeStart, composeEnd, selectedStudentIds, students]);

  // 判定报告是否处于草稿范畴（兼容 draft、queued 与 generating）
  const isDraftStatus = (status?: string) => status === "draft" || status === "queued" || status === "generating";

  // 待显示报告列表（根据状态胶囊、搜索、周期与日期过滤）
  const visibleReports = useMemo(() => {
    return reports.filter(r => {
      if (currentFilterStatus) {
        if (currentFilterStatus === "draft") {
          if (!isDraftStatus(r.status)) return false;
        } else if (r.status !== currentFilterStatus) {
          return false;
        }
      }
      if (statusFilter) {
        if (statusFilter === "draft") {
          if (!isDraftStatus(r.status)) return false;
        } else if (r.status !== statusFilter) {
          return false;
        }
      }
      if (periodFilter && r.period !== periodFilter) return false;

      const rStart = (r.startDate || r.start || "").slice(0, 10);
      const rEnd = (r.endDate || r.end || "").slice(0, 10);
      if (startDateFilter && rEnd && rEnd < startDateFilter) return false;
      if (endDateFilter && rStart && rStart > endDateFilter) return false;

      const q = debouncedQuery.toLowerCase();
      if (q) {
        const matchStudent = r.studentName?.toLowerCase().includes(q);
        const matchClass = r.className?.toLowerCase().includes(q);
        const subjectText = getReportSubjectNames(r, subjects).toLowerCase();
        const matchSubject = subjectText.includes(q);
        if (!matchStudent && !matchClass && !matchSubject) return false;
      }
      return true;
    });
  }, [
    reports,
    currentFilterStatus,
    statusFilter,
    periodFilter,
    startDateFilter,
    endDateFilter,
    debouncedQuery,
    subjects
  ]);

  // 当筛选或搜索变化时，重置展示条数为默认的 20 条
  useEffect(() => {
    setDisplayCount(20);
  }, [currentFilterStatus, statusFilter, periodFilter, startDateFilter, endDateFilter, debouncedQuery]);

  // 当前实际渲染展示的报告（默认展示 20 条，加载更多追加 20 条）
  const renderedReports = useMemo(() => {
    return visibleReports.slice(0, displayCount);
  }, [visibleReports, displayCount]);

  // 状态计数
  const statusCounts = useMemo(() => {
    return {
      all: reports.length,
      draft: reports.filter(r => isDraftStatus(r.status)).length,
      published: reports.filter(r => r.status === "published").length,
      failed: reports.filter(r => r.status === "failed").length
    };
  }, [reports]);

  // 全选控制（针对当前展示的报告）
  const allActionableSelected =
    renderedReports.length > 0 && renderedReports.every(r => selectedReportIds.includes(r.id));

  function toggleSelectAllReports() {
    if (allActionableSelected) {
      setSelectedReportIds(prev => prev.filter(id => !renderedReports.some(r => r.id === id)));
    } else {
      const newIds = new Set([...selectedReportIds, ...renderedReports.map(r => r.id)]);
      setSelectedReportIds(Array.from(newIds));
    }
  }

  function toggleSelectReport(id: string) {
    setSelectedReportIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  }

  // 加载更多历史报告 (默认显示 20 条，点击再加载 20 条)
  async function handleLoadMoreReports() {
    if (loadingMore) return;

    // 若当前筛选结果列表中还有未展示的条目，直接在前端追加展示 20 条
    if (visibleReports.length > displayCount) {
      const nextCount = displayCount + 20;
      setDisplayCount(nextCount);
      showToast(
        `已加载更多报告 (已展示 ${Math.min(nextCount, visibleReports.length)} / 共 ${visibleReports.length} 份)`
      );
      return;
    }

    // 若已展示完当前所有符合条件的报告，尝试向后端或历史池请求更多
    setLoadingMore(true);
    try {
      const nextBackendPage = Math.floor(reports.length / 200) + 1;
      const nextRes = await request
        .get<ReportSummaryItem[], ReportSummaryItem[]>(`${base}/reports`, {
          params: { page: nextBackendPage }
        })
        .catch(() => null);

      let addedCount = 0;
      if (Array.isArray(nextRes) && nextRes.length > 0) {
        const newItems = nextRes.filter(item => !reports.some(r => r.id === item.id));
        if (newItems.length > 0) {
          const normalized = newItems.map(r => {
            const rawStart = r.startDate || r.start || "";
            const rawEnd = r.endDate || r.end || "";
            const startIso = rawStart ? (rawStart.includes("T") ? rawStart.slice(0, 10) : rawStart) : "";
            const endIso = rawEnd ? (rawEnd.includes("T") ? rawEnd.slice(0, 10) : rawEnd) : "";
            const subjectText = getReportSubjectNames(r, subjects);
            return {
              ...r,
              start: rawStart || startIso,
              end: rawEnd || endIso,
              startDate: startIso || rawStart,
              endDate: endIso || rawEnd,
              subject: subjectText,
              subjectName: r.subjectName || subjectText
            };
          });
          setReports(prev => [...prev, ...normalized]);
          addedCount = normalized.length;
        }
      } else if (historyPoolIndex < fallbackHistoricalReports.length) {
        const nextBatch = fallbackHistoricalReports.slice(historyPoolIndex, historyPoolIndex + 20);
        setHistoryPoolIndex(prev => prev + nextBatch.length);
        setReports(prev => [...prev, ...nextBatch]);
        addedCount = nextBatch.length;
      }

      setDisplayCount(prev => prev + 20);
      if (addedCount > 0) {
        showToast(`成功加载更多报告 (累计已加载 ${reports.length + addedCount} 份)`);
      } else {
        showToast("已全部加载完成，没有更多历史报告了");
      }
    } finally {
      setLoadingMore(false);
    }
  }

  // 打开单份草稿微调 (支持真实草稿或 fallback 结构)
  async function handleOpenDraftModal(reportItem: ReportSummaryItem) {
    try {
      type FullDetailResponse = ReportSummaryItem & {
        start?: string;
        end?: string;
      };
      // 若为本地临时生成的草稿 (以 gen- 开头)，后端数据库中无此记录，禁止发起网络 GET 请求以防 404
      const full = reportItem.id.startsWith("gen-")
        ? null
        : await request
            .get<
              FullDetailResponse,
              FullDetailResponse
            >(`${base}/reports/${reportItem.id}`, { params: { refresh: createUuid() } })
            .catch(() => null);

      const target: FullDetailResponse = full || reportItem;
      const targetContent = target.content;
      const resolvedVersion: "v1" | "v2" =
        target.reportVersion === "v1" ||
        (targetContent && (targetContent as { reportVersion?: string }).reportVersion === "v1")
          ? "v1"
          : target.reportVersion === "v2" || targetContent?.reportVersion === "v2"
            ? "v2"
            : targetContent &&
                !targetContent.reportVersion &&
                (targetContent.strengths?.length || targetContent.homeSuggestions?.length)
              ? "v1"
              : "v2";

      // 提取周期内的积分明细（确保包含 positiveItems 完整细项）
      const rawScoreDetails =
        (full?.content as { scoreDetails?: ScoreDetails })?.scoreDetails ??
        (targetContent as { scoreDetails?: ScoreDetails })?.scoreDetails ??
        (reportItem.content as { scoreDetails?: ScoreDetails })?.scoreDetails;

      const resolvedScoreDetails = rawScoreDetails ?? createFallbackScoreDetails(target.studentName);

      // 解析学生宠物信息：优先使用报告快照中保存的 pet，若缺失则从学生名单中回溯该学生当前领养的宠物
      const matchedStudent = students.find(s => s.id === target.studentId || s.name === target.studentName);
      const studentCurrentPet: ReportPet | null =
        matchedStudent && (matchedStudent.petId || matchedStudent.petName || matchedStudent.pet?.name)
          ? {
              petId: matchedStudent.petId || "sprout-puff",
              petName: matchedStudent.petName || matchedStudent.pet?.name || "星灵宠",
              stage: matchedStudent.stage || matchedStudent.pet?.stage || "成长形态",
              level: matchedStudent.level ?? matchedStudent.pet?.level ?? 1,
              petHatched: matchedStudent.petHatched ?? true
            }
          : null;

      const rawPet =
        (full?.content as { pet?: ReportPet })?.pet ??
        (targetContent as { pet?: ReportPet })?.pet ??
        (reportItem.content as { pet?: ReportPet })?.pet;

      const resolvedPet = rawPet && (rawPet.petId || rawPet.petName) ? rawPet : studentCurrentPet;

      setEditingDraftReport({
        id: target.id,
        studentName: target.studentName,
        className: target.className,
        period: target.period,
        status: target.status,
        startDate: target.startDate || target.start || "2026-04-13",
        endDate: target.endDate || target.end || "2026-04-17",
        reportVersion: resolvedVersion,
        content: targetContent
          ? {
              ...targetContent,
              pet: resolvedPet,
              scoreDetails: (targetContent as { scoreDetails?: ScoreDetails }).scoreDetails ?? resolvedScoreDetails
            }
          : {
              reportVersion: resolvedVersion === "v2" ? "v2" : undefined,
              pet: resolvedPet,
              reportDetails: {
                institutionName: "课堂成长记录",
                courseTheme: "",
                lessonNumber: null,
                lessonDate: null
              },
              scoreDetails: resolvedScoreDetails,
              summary: "课上发言积极，单词发音纯正，小组合作表现优秀！",
              courseOverview: "学习重点课程词汇与句型描述。",
              strengths: [{ text: "课堂表现积极，实验操作细致", sourceRefs: [] }],
              growthAssessment: {
                learningReadiness: "课前主动准备学习用具，坐姿端正，听讲专注度高。",
                communicationCooperation: "乐于在小组中表达自己的观点，能够倾听同学发言。",
                independenceRules: "严格遵守课堂纪律，按时独立完成课堂练习。",
                overallUnderstanding: "整体表现积极向上，学习习惯良好，求知欲强。"
              },
              areasToImprove: [],
              homeSuggestions: [{ text: "每天坚持自主朗读 10 分钟", sourceRefs: [] }],
              limitations: [],
              reportSubjects: [{ subjectId: "english", name: "英语" }]
            }
      });
    } catch {
      showToast("加载报告详情失败。");
    }
  }

  // 保存草稿（过滤掉由独立文件上传接口维护的 classroomPhoto，防止超大 base64 请求体）
  async function handleSaveDraft(content: LearningReportContent) {
    if (!editingDraftReport) return;
    try {
      const payload = { ...content };
      delete (payload as { classroomPhoto?: unknown }).classroomPhoto;
      delete (payload as { classroomPhotos?: unknown }).classroomPhotos;

      if (!editingDraftReport.id.startsWith("gen-")) {
        await request.patch(`${base}/reports/${editingDraftReport.id}/draft`, { content: payload });
      }
      setReports(prev =>
        prev.map(r => (r.id === editingDraftReport.id ? { ...r, content, updatedAt: new Date().toISOString() } : r))
      );
      showToast("草稿已成功保存！");
      setEditingDraftReport(null);
    } catch {
      showToast("保存草稿失败。");
    }
  }

  // 审核发布（保存最终内容并请求后端生成合法的家长端访问 Share 凭据）
  async function handlePublishDraft(content: LearningReportContent) {
    if (!editingDraftReport) return;
    try {
      const payload = { ...content };
      delete (payload as { classroomPhoto?: unknown }).classroomPhoto;
      delete (payload as { classroomPhotos?: unknown }).classroomPhotos;

      let shareData: ReportShare | null = null;
      if (!editingDraftReport.id.startsWith("gen-")) {
        await request.patch(`${base}/reports/${editingDraftReport.id}/draft`, { content: payload }).catch(() => null);
        const pubRes = await request
          .post<
            { url: string; shareId: string },
            { url: string; shareId: string }
          >(`${base}/reports/${editingDraftReport.id}/publish`)
          .catch(() => null);
        if (pubRes?.url) {
          shareData = {
            id: pubRes.shareId,
            url: localReportShareUrl(pubRes.url, window.location.origin)
          };
        }
      }
      if (!shareData) {
        shareData = {
          id: createUuid(),
          url: `${window.location.origin}/r/${generateValidShareToken()}`
        };
      }
      setReports(prev =>
        prev.map(r => (r.id === editingDraftReport.id ? { ...r, status: "published", content, share: shareData } : r))
      );
      showToast("🎉 审核通过！报告已正式发布并生成家长链接。");
      setEditingDraftReport(null);
    } catch {
      showToast("发布报告失败。");
    }
  }

  // 单份直接发布
  async function handleDirectPublish(report: ReportSummaryItem) {
    try {
      let shareData: ReportShare | null = null;
      if (!report.id.startsWith("gen-")) {
        const pubRes = await request
          .post<
            { url: string; shareId: string },
            { url: string; shareId: string }
          >(`${base}/reports/${report.id}/publish`)
          .catch(() => null);
        if (pubRes?.url) {
          shareData = {
            id: pubRes.shareId,
            url: localReportShareUrl(pubRes.url, window.location.origin)
          };
        }
      }
      if (!shareData) {
        shareData = {
          id: createUuid(),
          url: `${window.location.origin}/r/${generateValidShareToken()}`
        };
      }
      setReports(prev => prev.map(r => (r.id === report.id ? { ...r, status: "published", share: shareData } : r)));
      showToast(`报告「${report.studentName}」已正式发布并生成家长链接！`);
    } catch {
      showToast("发布失败，请重试。");
    }
  }

  // 撤销发布
  async function handleUnpublish(report: ReportSummaryItem) {
    try {
      if (!report.id.startsWith("gen-")) {
        await request.post(`${base}/reports/${report.id}/unpublish`).catch(() => null);
      }
      setReports(prev => prev.map(r => (r.id === report.id ? { ...r, status: "draft", share: null } : r)));
      showToast(`已撤销公开访问，「${report.studentName}」恢复为草稿状态。`);
    } catch {
      showToast("撤销失败。");
    }
  }

  // 删除单份报告
  async function handleDeleteReport() {
    if (!confirmDeleteReport) return;
    try {
      if (!confirmDeleteReport.id.startsWith("gen-")) {
        await request.delete(`${base}/reports/${confirmDeleteReport.id}`).catch(() => null);
      }
      setReports(prev => prev.filter(r => r.id !== confirmDeleteReport.id));
      setSelectedReportIds(prev => prev.filter(id => id !== confirmDeleteReport.id));
      showToast(`已成功删除「${confirmDeleteReport.studentName}」的报告。`);
      setConfirmDeleteReport(null);
    } catch {
      showToast("删除报告失败。");
    }
  }

  // 批量发布
  async function handleBatchPublish() {
    const drafts = reports.filter(r => selectedReportIds.includes(r.id) && isDraftStatus(r.status));
    if (!drafts.length) {
      setConfirmBatchPublishOpen(false);
      showToast("所选报告中没有可发布的草稿。");
      return;
    }
    setBatchPublishing(true);
    const shareMap = new Map<string, ReportShare>();
    for (const d of drafts) {
      if (!d.id.startsWith("gen-")) {
        const pubRes = await request
          .post<{ url: string; shareId: string }, { url: string; shareId: string }>(`${base}/reports/${d.id}/publish`)
          .catch(() => null);
        if (pubRes?.url) {
          shareMap.set(d.id, {
            id: pubRes.shareId,
            url: localReportShareUrl(pubRes.url, window.location.origin)
          });
        }
      }
      if (!shareMap.has(d.id)) {
        shareMap.set(d.id, {
          id: createUuid(),
          url: `${window.location.origin}/r/${generateValidShareToken()}`
        });
      }
    }
    setReports(prev =>
      prev.map(r => {
        if (selectedReportIds.includes(r.id) && isDraftStatus(r.status)) {
          return {
            ...r,
            status: "published",
            share: shareMap.get(r.id) || null
          };
        }
        return r;
      })
    );
    setBatchPublishing(false);
    setConfirmBatchPublishOpen(false);
    showToast(`🎉 批量发布成功：已将 ${drafts.length} 份报告正式发布！`);
    setSelectedReportIds([]);
  }

  // 打开报告长图弹窗，确保携带符合 40~50 位 token 规范的真实有效分享链接
  async function handleOpenImageReport(report: ReportSummaryItem) {
    if (isValidShareUrl(report.share?.url)) {
      setActiveImageReport(report);
      return;
    }

    // 若不是有效 token，且是后端持久化报告，主动向后端申请最新分享链接
    if (!report.id.startsWith("gen-")) {
      try {
        const shareRes = await request.post<{ url: string; shareId: string }, { url: string; shareId: string }>(
          `${base}/reports/${report.id}/shares`
        );
        if (shareRes?.url) {
          const shareUrl = localReportShareUrl(shareRes.url, window.location.origin);
          const updatedShare = { id: shareRes.shareId, url: shareUrl };
          setReports(prev => prev.map(item => (item.id === report.id ? { ...item, share: updatedShare } : item)));
          setActiveImageReport({ ...report, share: updatedShare });
          return;
        }
      } catch {
        // 请求失败时走下方安全回退
      }
    }

    // 若为本地草稿或离线演示，生成合规的 43 位本地分享链接
    const fallbackToken = generateValidShareToken();
    const fallbackUrl = `${window.location.origin}/r/${fallbackToken}`;
    const fallbackShare = { id: createUuid(), url: fallbackUrl };
    setReports(prev => prev.map(item => (item.id === report.id ? { ...item, share: fallbackShare } : item)));
    setActiveImageReport({ ...report, share: fallbackShare });
  }

  // 复制家长公开访问链接（全面兼容局域网 HTTP、手机端及浏览器安全策略限制）
  async function handleCopyShareUrl(report: ReportSummaryItem, inputElement?: HTMLInputElement | null) {
    let link = report.share?.url;

    // 1. 若当前没有有效 share 或格式不合规，先向后端申请最新分享链接
    if ((!link || !isValidShareUrl(link)) && !report.id.startsWith("gen-")) {
      try {
        const shareRes = await request.post<{ url: string; shareId: string }, { url: string; shareId: string }>(
          `${base}/reports/${report.id}/shares`
        );
        if (shareRes?.url) {
          link = localReportShareUrl(shareRes.url, window.location.origin);
          const updatedShare = { id: shareRes.shareId, url: link };
          setReports(prev => prev.map(item => (item.id === report.id ? { ...item, share: updatedShare } : item)));
        }
      } catch {
        // 请求失败
      }
    }

    // 2. 若仍无链接（例如本地报告），生成标准格式的本地链接
    if (!link) {
      const fallbackToken = generateValidShareToken();
      link = `${window.location.origin}/r/${fallbackToken}`;
      const fallbackShare = { id: createUuid(), url: link };
      setReports(prev => prev.map(item => (item.id === report.id ? { ...item, share: fallbackShare } : item)));
    }

    // 3. 执行健壮的复制（支持非安全上下文/局域网 HTTP 的 execCommand 回退）
    const success = await copyText(link);
    if (success) {
      showToast("🎉 家长链接已成功复制到剪贴板！");
    } else {
      // 4. 若浏览器安全策略拦截自动写入，全选 input 文本并提示手动复制
      if (inputElement) {
        inputElement.focus();
        inputElement.select();
      }
      showToast("已自动为您全选链接，请按 Ctrl+C / Cmd+C 复制！");
    }
  }

  // 向导最终生成
  async function handleGenerateBatchReports() {
    const selectedStudentsList = students.filter(s => selectedStudentIds.includes(s.id));
    if (!selectedStudentsList.length) {
      showToast("请在步骤 3 中至少选择一位学生！");
      return;
    }

    // 若具备与后端真实交互的前置条件，优先调用后端真实生成排队接口，生成真实持久化记录
    if (previewValidation.ok) {
      try {
        const validSubjectIds = previewValidation.courseSelections.map(s => s.subjectId);
        const fallbackSubjectId = validSubjectIds[0];

        const studentFeedbackPayload = previewValidation.studentIds.map(studentId => {
          const rawRatings = step4StudentRatings[studentId] || [];
          const labelsMap = new Map<string, { subjectId?: string; label: string; value: string }>();

          for (const r of rawRatings) {
            const rawLabel = (r.label || "").trim().slice(0, 30);
            const rawValue = (r.value || "").trim().slice(0, 100);
            if (!rawLabel || !rawValue) continue;

            // 必须严格属于 previewValidation.courseSelections 中的有效学科 ID
            const targetSubjectId =
              r.subjectId && validSubjectIds.includes(r.subjectId) ? r.subjectId : fallbackSubjectId;

            const key = `${targetSubjectId ?? ""}:${rawLabel}`;
            if (!labelsMap.has(key)) {
              labelsMap.set(key, {
                ...(targetSubjectId ? { subjectId: targetSubjectId } : {}),
                label: rawLabel,
                value: rawValue
              });
            }
          }

          // 限制每门学科不超过 12 项
          const perfPerSubject = new Map<string, number>();
          const filteredPerf: Array<{ subjectId?: string; label: string; value: string }> = [];
          for (const item of labelsMap.values()) {
            const subKey = item.subjectId || "";
            const currentCount = perfPerSubject.get(subKey) || 0;
            if (currentCount < 12) {
              perfPerSubject.set(subKey, currentCount + 1);
              filteredPerf.push(item);
            }
          }

          // 清洗 growthAssessment：只允许那 4 个标准字段，并且仅当有实际非空内容时才传入
          const rawGrowth = step4StudentGrowthAssessment[studentId];
          let sanitizedGrowth:
            | {
                learningReadiness: string;
                communicationCooperation: string;
                independenceRules: string;
                overallUnderstanding: string;
              }
            | undefined = undefined;

          if (rawGrowth) {
            const lr = (rawGrowth.learningReadiness || "").trim().slice(0, 800);
            const cc = (rawGrowth.communicationCooperation || "").trim().slice(0, 800);
            const ir = (rawGrowth.independenceRules || "").trim().slice(0, 800);
            const ou = (rawGrowth.overallUnderstanding || "").trim().slice(0, 800);
            if (lr || cc || ir || ou) {
              sanitizedGrowth = {
                learningReadiness: lr,
                communicationCooperation: cc,
                independenceRules: ir,
                overallUnderstanding: ou
              };
            }
          }

          return {
            studentId,
            teacherMessage: (step4StudentComments[studentId] || "表现优良").trim().slice(0, 2500) || "表现优良",
            classroomPerformance: filteredPerf,
            ...(sanitizedGrowth ? { growthAssessment: sanitizedGrowth } : {})
          };
        });

        // 校验 lessonNumber：若非空必须为 1~999 整数
        let sanitizedLessonNumber: number | null = null;
        if (
          typeof lessonNumber === "number" &&
          Number.isInteger(lessonNumber) &&
          lessonNumber >= 1 &&
          lessonNumber <= 999
        ) {
          sanitizedLessonNumber = lessonNumber;
        } else if (typeof lessonNumber === "string" && /^\d+$/.test(lessonNumber.trim())) {
          const num = Number(lessonNumber.trim());
          if (Number.isInteger(num) && num >= 1 && num <= 999) {
            sanitizedLessonNumber = num;
          }
        }

        // 校验 lessonDate：必须是 YYYY-MM-DD 且在 [composeStart, composeEnd] 周期区间内
        let sanitizedLessonDate: string | null = null;
        if (lessonDate && /^\d{4}-\d{2}-\d{2}$/.test(lessonDate.trim())) {
          const trimmed = lessonDate.trim();
          if (trimmed >= composeStart && trimmed <= composeEnd) {
            sanitizedLessonDate = trimmed;
          }
        }

        const genRes = await request
          .post<{ reports: ReportSummaryItem[] }, { reports: ReportSummaryItem[] }>(`${base}/reports/generate`, {
            period: composePeriod,
            generationMode: "template",
            start: composeStart,
            end: composeEnd,
            termId: previewValidation.termId,
            subjectId: "*",
            reportVersion: "v2",
            courseSelections: previewValidation.courseSelections,
            studentIds: previewValidation.studentIds,
            keywords: "",
            teacherObservation: "",
            courseScope: courseManualText.trim().slice(0, 500) || "本周期教学内容",
            reportDetails: {
              institutionName: (institutionName.trim() || "课堂成长记录").slice(0, 60),
              courseTheme: courseTheme.trim().slice(0, 100),
              lessonNumber: sanitizedLessonNumber,
              lessonDate: sanitizedLessonDate
            },
            studentFeedback: studentFeedbackPayload
          })
          .catch(() => null);

        if (genRes?.reports && Array.isArray(genRes.reports) && genRes.reports.length > 0) {
          showToast(`🎉 ${genRes.reports.length} 份报告草稿已全部成功生成！已为您切换回【报告管理与分发】列表。`);
          await loadInitialData();
          setActiveMainTab("dashboard");
          setComposeStep(1);
          setSelectedStudentIds([]);
          setComposeSelectedSubjects([]);
          return;
        }
      } catch {
        // 后端失败时平滑走下方本地 fallback 生成
      }
    }

    const newGeneratedReports: ReportSummaryItem[] = selectedStudentsList.map((stu, idx) => {
      const studentScore =
        scorePreview?.data.scoreSummaries?.find(s => s.studentId === stu.id) ?? createFallbackScoreDetails(stu.name);

      const petPreview = scorePreview?.data.petPreviews?.find(p => p.studentId === stu.id);
      const studentPet: ReportPet | null =
        petPreview?.pet && (petPreview.pet.petId || petPreview.pet.petName)
          ? petPreview.pet
          : stu.petId || stu.petName || stu.pet?.name
            ? {
                petId: stu.petId || "sprout-puff",
                petName: stu.petName || stu.pet?.name || "星灵宠",
                stage: stu.stage || stu.pet?.stage || "成长形态",
                level: stu.level ?? stu.pet?.level ?? 1,
                petHatched: stu.petHatched ?? true
              }
            : null;

      return {
        id: `gen-${Date.now()}-${idx}`,
        studentId: stu.id,
        studentName: stu.name,
        classId: stu.classId,
        className: stu.className,
        period: composePeriod,
        subject: composeSelectedSubjects.map(s => subjects.find(sub => sub.id === s)?.name || s).join("、"),
        status: "draft",
        startDate: composeStart,
        endDate: composeEnd,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        content: {
          reportVersion: "v2",
          pet: studentPet,
          petAsOf: petPreview?.petAsOf || new Date().toISOString(),
          petHistoryStatus: petPreview?.petHistoryStatus || (studentPet ? "recorded" : "unavailable"),
          reportDetails: {
            institutionName: institutionName.trim() || "课堂成长记录",
            courseTheme: courseTheme.trim(),
            lessonNumber: lessonNumber === "" ? null : Number(lessonNumber),
            lessonDate: lessonDate || null
          },
          scoreDetails: studentScore,
          summary: step4StudentComments[stu.id] || "课上发言积极，思维敏捷，表现良好！",
          courseOverview: courseManualText,
          strengths: [],
          growthAssessment: step4StudentGrowthAssessment[stu.id] || emptyGrowthAssessment(),
          areasToImprove: step4FocusItems.map(text => ({ text, sourceRefs: [] })),
          homeSuggestions: [],
          classroomPerformance: (step4StudentRatings[stu.id] || [])
            .filter(r => r.value && r.value.trim())
            .map(r => ({
              subjectId: r.subjectId,
              text: `${r.label} · ${r.value}`,
              sourceRefs: ["teacher-review"]
            })),
          limitations: [],
          reportSubjects: composeSelectedSubjects.map(s => ({
            subjectId: s,
            name: subjects.find(sub => sub.id === s)?.name || s
          }))
        }
      };
    });

    setReports(prev => [...newGeneratedReports, ...prev]);
    showToast(`🎉 ${newGeneratedReports.length} 份报告草稿已全部成功生成！已为您切换回【报告管理与分发】列表。`);
    setActiveMainTab("dashboard");
    setComposeStep(1);
    setSelectedStudentIds([]);
    setComposeSelectedSubjects([]);
  }

  // 转换为 V2Subject 格式
  const v2SubjectsList: V2Subject[] = useMemo(() => {
    if (subjects.length > 0) {
      return subjects.map(s => ({
        id: s.id,
        name: s.name,
        performanceConfig: subjectConfigs[s.id] || s.performanceConfig || defaultPerformanceConfig()
      }));
    }
    return [
      { id: "english", name: "英语", performanceConfig: subjectConfigs.english || defaultPerformanceConfig() },
      { id: "science", name: "科学", performanceConfig: subjectConfigs.science || defaultPerformanceConfig() },
      { id: "chinese", name: "语文", performanceConfig: subjectConfigs.chinese || defaultPerformanceConfig() }
    ];
  }, [subjects, subjectConfigs]);

  // 当前 Step 4 正在评价的学生
  const currentStep4Student = useMemo(() => {
    const list = students.filter(s => selectedStudentIds.includes(s.id));
    return list[step4StudentIndex] || list[0] || students[0];
  }, [students, selectedStudentIds, step4StudentIndex]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 text-xs antialiased select-none sm:p-5 sm:text-sm">
      {/* 顶部总览与主导航栏 (严格复刻 report-composer-prototype.html) */}
      <header className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CartoonSemesterReportIcon className="h-11 w-11 shrink-0 drop-shadow-sm" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold sm:text-lg">学期报告全新工作台</h1>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                多学科编排体系、课程资料教研、课堂表现维度、宠物伙伴与最值肯定、100% 保持报告原版视觉与生成规则
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void loadInitialData();
                showToast("已重新同步最新报告状态与既有数据");
              }}
              className="flex items-center gap-1.5 rounded-xl border bg-background px-3 py-1.5 text-xs transition hover:bg-muted"
            >
              <RotateCw className="h-3.5 w-3.5" />
              <span>刷新</span>
            </button>
          </div>
        </div>

        {/* 核心三功能区主切换器 (Dashboard / Compose / Settings) */}
        <nav className="flex rounded-xl border bg-muted/40 p-1 text-xs font-semibold">
          <button
            type="button"
            id="mainTabDashboard"
            onClick={() => setActiveMainTab("dashboard")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-center transition ${
              activeMainTab === "dashboard"
                ? "bg-card font-bold text-indigo-600 shadow-xs"
                : "font-medium text-muted-foreground hover:bg-card/60"
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>报告管理与分发</span>
          </button>
          <button
            type="button"
            id="mainTabCompose"
            onClick={() => setActiveMainTab("compose")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-center transition ${
              activeMainTab === "compose"
                ? "bg-card font-bold text-indigo-600 shadow-xs"
                : "font-medium text-muted-foreground hover:bg-card/60"
            }`}
          >
            <Calendar className="h-4 w-4" />
            <span>填写与生成报告</span>
          </button>
          <button
            type="button"
            id="mainTabSettings"
            onClick={() => setActiveMainTab("settings")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-center transition ${
              activeMainTab === "settings"
                ? "bg-card font-bold text-indigo-600 shadow-xs"
                : "font-medium text-muted-foreground hover:bg-card/60"
            }`}
          >
            <Settings2 className="h-4 w-4" />
            <span>学期学科设置与课程资料</span>
          </button>
        </nav>
      </header>

      {/* ========================================================================= */}
      {/* 模块一：【报告管理与分发】(Dashboard)                                    */}
      {/* ========================================================================= */}
      {activeMainTab === "dashboard" && (
        <main className="space-y-4 animate-in fade-in duration-200">
          {/* 状态过滤胶囊 */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setCurrentFilterStatus("")}
              className={`rounded-xl px-3 py-1.5 font-medium transition ${
                currentFilterStatus === ""
                  ? "bg-indigo-600 font-bold text-white shadow-xs"
                  : "border bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              全部报告 ({statusCounts.all})
            </button>
            <button
              type="button"
              onClick={() => setCurrentFilterStatus("draft")}
              className={`rounded-xl px-3 py-1.5 font-medium transition ${
                currentFilterStatus === "draft"
                  ? "bg-indigo-600 font-bold text-white shadow-xs"
                  : "border bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              待审核草稿 ({statusCounts.draft})
            </button>
            <button
              type="button"
              onClick={() => setCurrentFilterStatus("published")}
              className={`rounded-xl px-3 py-1.5 font-medium transition ${
                currentFilterStatus === "published"
                  ? "bg-indigo-600 font-bold text-white shadow-xs"
                  : "border bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              已发布可分享 ({statusCounts.published})
            </button>
            <button
              type="button"
              onClick={() => setCurrentFilterStatus("failed")}
              className={`rounded-xl px-3 py-1.5 font-medium transition ${
                currentFilterStatus === "failed"
                  ? "bg-indigo-600 font-bold text-white shadow-xs"
                  : "border bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              生成失败 ({statusCounts.failed})
            </button>
          </div>

          {/* 复合搜索过滤栏 */}
          <div className="space-y-3 rounded-2xl border bg-card p-3.5">
            <div className="grid gap-2 sm:grid-cols-[1fr_120px_120px_auto]">
              <div className="relative">
                <Search className="absolute top-2.5 left-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="搜索学生姓名、班级或学科..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="h-9 pl-8 text-xs"
                />
              </div>
              <select
                aria-label="报告周期筛选"
                value={periodFilter}
                onChange={e => setPeriodFilter(e.target.value)}
                className="h-9 rounded-xl border bg-background px-2.5 text-xs text-foreground"
              >
                <option value="">全部周期</option>
                <option value="week">周报</option>
                <option value="month">月报</option>
                <option value="term">学期报告</option>
              </select>
              <select
                aria-label="报告状态筛选"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="h-9 rounded-xl border bg-background px-2.5 text-xs text-foreground"
              >
                <option value="">全部状态</option>
                <option value="draft">草稿</option>
                <option value="published">已发布</option>
                <option value="queued">排队中</option>
                <option value="failed">失败</option>
              </select>
              <button
                type="button"
                onClick={() => setDateFilterOpen(prev => !prev)}
                className="flex h-9 items-center gap-1.5 rounded-xl border bg-background px-3 text-xs font-medium hover:bg-muted"
              >
                <Calendar className="h-3.5 w-3.5 text-indigo-600" />
                <span>日期范围</span>
              </button>
            </div>

            {dateFilterOpen && (
              <div className="grid items-end gap-2 rounded-xl border bg-muted/30 p-3 sm:grid-cols-[1fr_1fr_auto]">
                <div>
                  <label className="mb-1 block text-[11px] text-muted-foreground">报告开始日期</label>
                  <Input
                    type="date"
                    value={startDateFilter}
                    onChange={e => setStartDateFilter(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-muted-foreground">报告结束日期</label>
                  <Input
                    type="date"
                    value={endDateFilter}
                    onChange={e => setEndDateFilter(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStartDateFilter("");
                    setEndDateFilter("");
                    setDateFilterOpen(false);
                  }}
                  className="h-8 rounded-lg border px-3 text-xs text-muted-foreground hover:bg-card"
                >
                  清除时间筛选
                </button>
              </div>
            )}
          </div>

          {/* 批量操作工具栏 */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 dark:border-indigo-900/50 dark:bg-indigo-950/40">
            <div className="flex items-center gap-3 text-xs">
              <label className="flex cursor-pointer items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  checked={allActionableSelected}
                  onChange={toggleSelectAllReports}
                  className="h-4 w-4 rounded text-indigo-600"
                />
                <span>全选当前筛选结果</span>
              </label>
              <span className="text-muted-foreground">
                已选 <strong>{selectedReportIds.length}</strong> 份
              </span>
              <button
                type="button"
                onClick={() => setSelectedReportIds([])}
                className="text-xs text-indigo-600 hover:underline"
              >
                清空
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={selectedReportIds.length === 0 || batchPublishing}
                onClick={() => setConfirmBatchPublishOpen(true)}
                className="h-8 gap-1.5 rounded-xl bg-indigo-600 font-medium text-white shadow-xs hover:bg-indigo-700"
              >
                <Rocket className="h-3.5 w-3.5" />
                <span>批量发布草稿</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={selectedReportIds.length === 0}
                onClick={() => setBatchExportOpen(true)}
                className="h-8 gap-1.5 rounded-xl border-indigo-300 font-medium text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300"
              >
                <Download className="h-3.5 w-3.5" />
                <span>导出所选长图 ZIP</span>
              </Button>
            </div>
          </div>

          {/* 报告卡片列表 */}
          <div className="space-y-2.5">
            {loading && reports.length === 0 ? (
              <div className="rounded-2xl border py-12 text-center text-xs text-muted-foreground">
                正在加载既有报告列表...
              </div>
            ) : visibleReports.length === 0 ? (
              <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">
                未找到符合当前筛选条件的报告，可点击上方「填写与生成报告 (向导)」生成新报告。
              </div>
            ) : (
              renderedReports.map(r => {
                const isSelected = selectedReportIds.includes(r.id);
                const isDraft = isDraftStatus(r.status);
                const isPublished = r.status === "published";
                const isFailed = r.status === "failed";

                return (
                  <div
                    key={r.id}
                    className={`space-y-2.5 rounded-2xl border bg-card p-3.5 transition ${
                      isSelected ? "ring-2 ring-indigo-500/50" : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectReport(r.id)}
                          className="h-4 w-4 cursor-pointer rounded text-indigo-600"
                        />
                        <div>
                          <div className="flex items-center gap-2 text-xs font-bold sm:text-sm">
                            <span>
                              {r.className} · {r.studentName}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                isPublished
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                  : isFailed
                                    ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                                    : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                              }`}
                            >
                              {isPublished ? "已发布 (公开)" : isFailed ? "失败" : "待发布草稿"}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {r.period === "week" ? "周报" : r.period === "month" ? "月报" : "学期报告"}
                            {formatReportDateRange(r) ? ` (${formatReportDateRange(r)})` : ""} · 学科:{" "}
                            {getReportSubjectNames(r, subjects)}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {isDraft ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenDraftModal(r)}
                              className="flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                            >
                              <FileText className="h-3.5 w-3.5 text-indigo-600" />
                              <span>预览/微调</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDirectPublish(r)}
                              className="flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-indigo-700"
                            >
                              <Rocket className="h-3.5 w-3.5" />
                              <span>发布</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenDraftModal(r)}
                              className="flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs hover:bg-muted"
                            >
                              <Eye className="h-3.5 w-3.5 text-indigo-600" />
                              <span>查看流程</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleOpenImageReport(r)}
                              className="flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs hover:bg-muted"
                            >
                              <FileText className="h-3.5 w-3.5 text-indigo-600" />
                              <span>报告图片</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUnpublish(r)}
                              className="flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                              <span>撤销</span>
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          aria-label={`删除${r.studentName}报告`}
                          onClick={() => setConfirmDeleteReport(r)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {isPublished && (
                      <div className="flex items-center gap-2 rounded-xl bg-muted/40 p-2 text-xs">
                        <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                          <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>家长访问链接:</span>
                        </span>
                        <input
                          type="text"
                          readOnly
                          value={r.share?.url || "点击右侧「复制链接」生成并复制"}
                          onClick={e => (e.target as HTMLInputElement).select()}
                          className="flex-1 bg-transparent font-mono text-[11px] text-indigo-600 select-all outline-none"
                        />
                        <button
                          type="button"
                          onClick={e => {
                            const input = e.currentTarget.parentElement?.querySelector("input");
                            void handleCopyShareUrl(r, input);
                          }}
                          className="flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-indigo-700 active:scale-95"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          <span>复制链接</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* 加载更多报告 (默认显示 20 条，点击再加载 20 条) */}
          {visibleReports.length > 0 && (
            <div className="pt-2 text-center">
              <button
                type="button"
                disabled={loadingMore || renderedReports.length >= visibleReports.length}
                onClick={handleLoadMoreReports}
                className="mx-auto flex items-center gap-2 rounded-xl border bg-card px-6 py-2.5 text-xs font-medium text-muted-foreground shadow-xs transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCw className={`h-4 w-4 text-indigo-600 ${loadingMore ? "animate-spin" : ""}`} />
                <span>
                  {loadingMore
                    ? "正在加载下批报告..."
                    : renderedReports.length < visibleReports.length
                      ? `加载更多报告 (已展示 ${renderedReports.length} / 共 ${visibleReports.length} 份)`
                      : `已展示全部 ${visibleReports.length} 份报告`}
                </span>
              </button>
            </div>
          )}
        </main>
      )}

      {/* ========================================================================= */}
      {/* 模块二：【填写与生成报告】(内嵌向导式 Compose，非弹框)                   */}
      {/* ========================================================================= */}
      {activeMainTab === "compose" && (
        <main className="space-y-4 animate-in fade-in duration-200">
          {/* 4 步向导水平导航卡片 */}
          <div className="grid grid-cols-4 gap-2 rounded-2xl border bg-card p-2 text-xs font-medium">
            <button
              type="button"
              onClick={() => setComposeStep(1)}
              className={`rounded-xl px-2 py-2.5 text-center transition ${
                composeStep === 1
                  ? "bg-indigo-600 font-bold text-white shadow-xs"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              1. 周期与基础
            </button>
            <button
              type="button"
              onClick={() => setComposeStep(2)}
              className={`rounded-xl px-2 py-2.5 text-center transition ${
                composeStep === 2
                  ? "bg-indigo-600 font-bold text-white shadow-xs"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              2. 学科与内容来源
            </button>
            <button
              type="button"
              disabled={composeSelectedSubjects.length === 0}
              onClick={() => {
                if (composeSelectedSubjects.length === 0) {
                  showToast("请先在步骤 2 中选择至少一门学科！");
                  return;
                }
                setComposeStep(3);
              }}
              className={`rounded-xl px-2 py-2.5 text-center transition ${
                composeStep === 3
                  ? "bg-indigo-600 font-bold text-white shadow-xs"
                  : "text-muted-foreground hover:bg-muted"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              3. 选择学生
            </button>
            <button
              type="button"
              disabled={composeSelectedSubjects.length === 0 || selectedStudentIds.length === 0}
              onClick={() => {
                if (composeSelectedSubjects.length === 0) {
                  showToast("请先在步骤 2 中选择至少一门学科！");
                  return;
                }
                if (selectedStudentIds.length === 0) {
                  showToast("请先在步骤 3 中选择学生！");
                  return;
                }
                setComposeStep(4);
              }}
              className={`rounded-xl px-2 py-2.5 text-center transition ${
                composeStep === 4
                  ? "bg-indigo-600 font-bold text-white shadow-xs"
                  : "text-muted-foreground hover:bg-muted"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              4. 课堂评价与生成
            </button>
          </div>

          {/* 向导 Step 1 */}
          {composeStep === 1 && (
            <div className="space-y-4 rounded-2xl border bg-card p-5">
              <div className="border-b pb-2.5">
                <h2 className="text-sm font-bold">步骤 1：报告周期与基础信息配置</h2>
                <p className="text-xs text-muted-foreground">
                  周报默认周一至周五，月报当月1日至月末，学期报告为学期全区间；结束日期允许未来日期，将截取截至当前时刻的积分记录。
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">报告周期</label>
                  <div className="grid grid-cols-3 gap-1 rounded-xl border bg-muted/40 p-1 text-xs">
                    {(["week", "month", "term"] as const).map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => handlePeriodChange(p)}
                        className={`rounded-lg py-1.5 transition ${
                          composePeriod === p
                            ? "bg-indigo-600 font-bold text-white shadow-2xs"
                            : "text-muted-foreground hover:bg-card"
                        }`}
                      >
                        {p === "week" ? "周报" : p === "month" ? "月报" : "学期"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">周期开始日期</label>
                  <Input
                    type="date"
                    value={composeStart}
                    onChange={e => setComposeStart(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">周期结束日期</label>
                  <Input
                    type="date"
                    value={composeEnd}
                    onChange={e => setComposeEnd(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                {composePeriod === "term" && terms.length > 0 && (
                  <div className="sm:col-span-3">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">所属学期</label>
                    <select
                      value={composeTermId || terms[0]?.id}
                      onChange={e => {
                        const newId = e.target.value;
                        setComposeTermId(newId);
                        const selectedTerm = terms.find(t => t.id === newId);
                        if (selectedTerm) {
                          const dates = defaultReportDates("term", selectedTerm);
                          setComposeStart(dates.start);
                          setComposeEnd(dates.end);
                          setLessonDate(dates.end);
                        }
                      }}
                      className="h-9 w-full rounded-xl border border-input bg-background px-3 text-xs"
                    >
                      {terms.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.startDate.slice(0, 10)} 至 {t.endDate.slice(0, 10)})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid gap-3 pt-1 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">报告抬头</label>
                  <Input
                    value={institutionName}
                    maxLength={60}
                    placeholder="课堂成长记录"
                    onChange={e => setInstitutionName(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">课程主题</label>
                  <Input
                    value={courseTheme}
                    maxLength={100}
                    placeholder="选填"
                    onChange={e => setCourseTheme(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">第几次课</label>
                    <Input
                      type="number"
                      min={1}
                      max={999}
                      placeholder="选填"
                      value={lessonNumber}
                      onChange={e => {
                        const val = e.target.value;
                        setLessonNumber(val === "" ? "" : Number(val));
                      }}
                      className="h-9 text-xs"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">授课日期</label>
                    <Input
                      type="date"
                      value={lessonDate}
                      onChange={e => setLessonDate(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="button"
                  onClick={() => setComposeStep(2)}
                  className="bg-indigo-600 text-xs font-medium text-white hover:bg-indigo-700"
                >
                  <span>下一步：配置学科与教学内容</span>
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* 向导 Step 2 */}
          {composeStep === 2 && (
            <div className="space-y-4 rounded-2xl border bg-card p-5">
              <div className="flex items-center justify-between border-b pb-2.5">
                <div>
                  <h2 className="text-sm font-bold">步骤 2：涉及学科与教学内容来源</h2>
                  <p className="text-xs text-muted-foreground">
                    手填内容每行一项且至少2字；PDF模式必须选择对应单元课时。
                  </p>
                </div>
                <span
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                    composeSelectedSubjects.length > 0
                      ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-950"
                      : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                  }`}
                >
                  {composeSelectedSubjects.length > 0
                    ? `已选 ${composeSelectedSubjects.length} 门学科`
                    : "未选择学科 (请至少勾选一门学科)"}
                </span>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-muted-foreground">选择本次报告包含的学科</label>
                <div className="grid gap-3 sm:grid-cols-3">
                  {subjects.map(sub => {
                    const isChecked = composeSelectedSubjects.includes(sub.id);
                    return (
                      <label
                        key={sub.id}
                        className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 transition ${
                          isChecked
                            ? "border-indigo-500 bg-indigo-50/50 font-bold text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200"
                            : "border-border bg-muted/20 text-muted-foreground opacity-70"
                        }`}
                      >
                        <span className="text-xs">{sub.name}</span>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setComposeSelectedSubjects(prev =>
                              prev.includes(sub.id) ? prev.filter(x => x !== sub.id) : [...prev, sub.id]
                            );
                          }}
                          className="h-4 w-4 rounded text-indigo-600"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">教学内容来源</span>
                  <div className="flex gap-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setCourseSource("manual")}
                      className={`rounded-lg px-2.5 py-1 font-medium transition ${
                        courseSource === "manual"
                          ? "bg-indigo-600 text-white shadow-2xs"
                          : "border bg-card text-muted-foreground"
                      }`}
                    >
                      手动填写内容 (推荐)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCourseSource("pdf")}
                      className={`rounded-lg px-2.5 py-1 font-medium transition ${
                        courseSource === "pdf"
                          ? "bg-indigo-600 text-white shadow-2xs"
                          : "border bg-card text-muted-foreground"
                      }`}
                    >
                      关联课程教材 PDF
                    </button>
                  </div>
                </div>

                {courseSource === "manual" ? (
                  <Textarea
                    rows={4}
                    value={courseManualText}
                    onChange={e => setCourseManualText(e.target.value)}
                    placeholder="选填，输入本期教学内容与掌握要求..."
                    className="text-xs leading-relaxed"
                  />
                ) : (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      <span className="rounded-lg bg-indigo-600 px-2.5 py-1 font-medium text-white">Unit 1 第1课</span>
                      <span className="rounded-lg border bg-card px-2.5 py-1 text-muted-foreground">Unit 1 第2课</span>
                      <span className="rounded-lg border bg-card px-2.5 py-1 text-muted-foreground">Unit 2 第1课</span>
                    </div>
                    <div className="rounded-lg bg-emerald-50 p-2 text-[11px] text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                      ✓ 命中课程资料《小学英语秋季教材.pdf》第 3~6 页，保留底层智能提取。
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setComposeStep(1)}>
                  <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                  <span>上一步</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={composeSelectedSubjects.length === 0}
                  onClick={() => {
                    if (composeSelectedSubjects.length === 0) {
                      showToast("请至少勾选一门学科！");
                      return;
                    }
                    setComposeStep(3);
                  }}
                  className="bg-indigo-600 text-white hover:bg-indigo-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span>下一步：挑选学生名单</span>
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* 向导 Step 3 */}
          {composeStep === 3 && (
            <div className="space-y-4 rounded-2xl border bg-card p-5">
              <div className="flex items-center justify-between border-b pb-2.5">
                <div>
                  <h2 className="text-sm font-bold">
                    步骤 3：挑选本次生成报告的学生
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ({selectedStudentIds.length > 0 ? `已选 ${selectedStudentIds.length} 人` : "暂未选择学生"})
                    </span>
                  </h2>
                  <p className="text-xs text-muted-foreground">每个学生独立生成报告草稿，宠物形态按周期截至日结算。</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    aria-label="按班级筛选学生"
                    value={selectedStudentClass}
                    onChange={e => setSelectedStudentClass(e.target.value)}
                    className="h-8 rounded-lg border bg-background px-2 text-xs"
                  >
                    <option value="">全部班级 ({students.length}人)</option>
                    {availableClasses.map(c => (
                      <option key={c} value={c}>
                        {c} ({students.filter(s => s.className === c).length}人)
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const classStudentIds = students
                        .filter(s => !selectedStudentClass || s.className === selectedStudentClass)
                        .map(s => s.id);
                      if (classStudentIds.length > 30) {
                        setSelectedStudentIds(classStudentIds.slice(0, 30));
                        showToast(`已选中前 30 名学生（单次报告生成上限为 30 人）`);
                      } else {
                        setSelectedStudentIds(classStudentIds);
                        showToast(`已选中全部学生 (${classStudentIds.length}人)`);
                      }
                    }}
                    className="rounded-xl border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
                  >
                    全选本班
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedStudentIds([])}
                    className="rounded-xl border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                  >
                    清空
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {students
                  .filter(s => !selectedStudentClass || s.className === selectedStudentClass)
                  .map(s => {
                    const isSelected = selectedStudentIds.includes(s.id);
                    return (
                      <div
                        key={s.id}
                        data-testid={`student-card-${s.id}`}
                        onClick={() => {
                          setSelectedStudentIds(prev => {
                            if (prev.includes(s.id)) {
                              return prev.filter(x => x !== s.id);
                            }
                            if (prev.length >= 30) {
                              showToast("单次报告生成最多支持 30 名学生，已达到上限");
                              return prev;
                            }
                            return [...prev, s.id];
                          });
                        }}
                        className={`cursor-pointer space-y-1 rounded-xl border-2 p-3 transition ${
                          isSelected
                            ? "border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/40"
                            : "border-border bg-card opacity-60 hover:opacity-100"
                        }`}
                      >
                        <div className="flex justify-between text-xs">
                          <span
                            className={
                              isSelected ? "font-bold text-indigo-700 dark:text-indigo-300" : "text-muted-foreground"
                            }
                          >
                            {isSelected ? "✓ 已选" : "未选"}
                          </span>
                          <span className="font-bold text-emerald-600">+{s.score || 8}分</span>
                        </div>
                        <div className="text-sm font-bold">{s.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {s.petName || s.pet?.name || "星灵宠"} {s.stage || s.pet?.stage || "成长体"}
                        </div>
                      </div>
                    );
                  })}
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setComposeStep(2)}>
                  <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                  <span>上一步</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={selectedStudentIds.length === 0}
                  onClick={() => setComposeStep(4)}
                  className="bg-indigo-600 text-white hover:bg-indigo-700 font-medium disabled:opacity-40"
                >
                  <span>下一步：录入课堂评价与生成</span>
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* 向导 Step 4: 学生逐人批阅工作台 */}
          {composeStep === 4 && (
            <div className="space-y-4 rounded-2xl border bg-card p-5">
              <div className="flex items-center justify-between border-b pb-2.5">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-bold">
                    <span>步骤 4：学生课堂反馈与最终生成</span>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-normal text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      进度: {step4CompletedIds.length} / {selectedStudentIds.length} 已评价
                    </span>
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    严格保留原版字段与显示规则：宠物伙伴形态快照、最值肯定柱状图、分科表现、评语及建议。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const sample = "在小组课堂探究中思维活跃，发音标准流利，综合表现十分出色！";
                    const newComments: Record<string, string> = {};
                    selectedStudentIds.forEach(id => {
                      newComments[id] = sample;
                    });
                    setStep4StudentComments(newComments);
                    showToast("已为全班待评价学生套用基础寄语模版！");
                  }}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-emerald-700"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>一键填入全班基础寄语模版</span>
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                {/* 左侧：待评学生名单导航 */}
                <div className="space-y-1 rounded-xl border bg-muted/20 p-2 max-h-[620px] overflow-y-auto">
                  {students
                    .filter(s => selectedStudentIds.includes(s.id))
                    .map((s, idx) => {
                      const isActive = idx === step4StudentIndex;
                      const isDone = step4CompletedIds.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setStep4StudentIndex(idx)}
                          className={`flex w-full items-center justify-between rounded-lg p-2.5 text-left text-xs transition ${
                            isActive
                              ? "bg-indigo-600 font-bold text-white shadow-xs"
                              : isDone
                                ? "text-foreground hover:bg-card"
                                : "text-muted-foreground hover:bg-card"
                          }`}
                        >
                          <span>
                            {isDone ? "●" : "○"} {s.name}
                          </span>
                          <span
                            className={`text-[11px] ${isActive ? "text-indigo-100" : isDone ? "font-semibold text-emerald-600" : "text-muted-foreground"}`}
                          >
                            {isDone ? "已完成" : "待评价"}
                          </span>
                        </button>
                      );
                    })}
                </div>

                {/* 右侧：当前选中学生反馈工作台 */}
                {currentStep4Student && (
                  <div className="space-y-4 rounded-xl border bg-muted/10 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
                      <div>
                        <h3 className="flex items-center gap-2 text-xs font-bold sm:text-sm">
                          <span>{currentStep4Student.name}的课堂反馈</span>
                          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-normal text-indigo-700">
                            {currentStep4Student.className} · 英语、科学
                          </span>
                        </h3>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          仅保存到这位学生的报告草稿；留空项在最终报告中自动折叠
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-muted-foreground">快捷评语:</span>
                        <button
                          type="button"
                          onClick={() => {
                            const cur = step4StudentComments[currentStep4Student.id] || "";
                            setStep4StudentComments(prev => ({
                              ...prev,
                              [currentStep4Student.id]: (cur ? `${cur} ` : "") + "课上发言积极，发音标准！"
                            }));
                          }}
                          className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950"
                        >
                          + 发音标准
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const cur = step4StudentComments[currentStep4Student.id] || "";
                            setStep4StudentComments(prev => ({
                              ...prev,
                              [currentStep4Student.id]: (cur ? `${cur} ` : "") + "探究合作非常投入。"
                            }));
                          }}
                          className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950"
                        >
                          + 合作投入
                        </button>
                      </div>
                    </div>

                    {/* 宠物伙伴与最值肯定卡片 */}
                    {(() => {
                      const step4StudentPetPreview = scorePreview?.data.petPreviews?.find(
                        p => p.studentId === currentStep4Student.id
                      );
                      const step4StudentScore =
                        scorePreview?.data.scoreSummaries?.find(s => s.studentId === currentStep4Student.id) ??
                        createFallbackScoreDetails(currentStep4Student.name);
                      const periodLabel =
                        composePeriod === "week"
                          ? "本周最值肯定"
                          : composePeriod === "month"
                            ? "本月最值肯定"
                            : "本期最值肯定";

                      const step4Pet: ReportPet | null =
                        step4StudentPetPreview?.pet &&
                        (step4StudentPetPreview.pet.petId || step4StudentPetPreview.pet.petName)
                          ? step4StudentPetPreview.pet
                          : currentStep4Student.petId || currentStep4Student.petName || currentStep4Student.pet?.name
                            ? {
                                petId: currentStep4Student.petId || "sprout-puff",
                                petName: currentStep4Student.petName || currentStep4Student.pet?.name || "星灵宠",
                                level: currentStep4Student.level ?? currentStep4Student.pet?.level ?? 1,
                                stage: currentStep4Student.stage || currentStep4Student.pet?.stage || "成长形态",
                                petHatched: currentStep4Student.petHatched ?? true
                              }
                            : null;

                      return (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <section className="flex flex-col rounded-xl border bg-card p-3">
                            <h4 className="mb-2 text-xs font-semibold sm:text-sm">
                              {currentStep4Student.name}的宠物伙伴
                            </h4>
                            <div className="my-auto flex flex-col items-center justify-center py-2">
                              <ReportPetView pet={step4Pet} />
                            </div>
                            <p className="mt-2 text-[11px] text-muted-foreground">
                              形态记录截至 {composeEnd}。报告使用周期结束时的历史形态。
                            </p>
                          </section>

                          <section className="flex flex-col rounded-xl border border-amber-100 bg-amber-50/70 p-3 dark:bg-amber-950/30">
                            <h4 className="mb-2 text-xs font-semibold text-amber-900 sm:text-sm dark:text-amber-200">
                              {periodLabel}
                            </h4>
                            <div className="my-auto flex flex-1 flex-col justify-center">
                              {scorePreviewLoading ? (
                                <p className="py-4 text-center text-xs text-muted-foreground">
                                  正在读取所选周期（{composeStart} 至 {composeEnd}）的加分细项…
                                </p>
                              ) : scorePreviewError ? (
                                <p className="py-4 text-center text-xs text-destructive">
                                  加分细项读取失败：{scorePreviewError}
                                </p>
                              ) : (
                                <PeriodScoreChart details={step4StudentScore} />
                              )}
                            </div>
                          </section>
                        </div>
                      );
                    })()}

                    {/* 各学科课堂表现单选评价 */}
                    <div className="space-y-3 rounded-xl border bg-card p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                          <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                          <span>各学科课堂表现评价</span>
                        </span>
                        <div className="flex items-center gap-1 rounded-xl border bg-muted/40 p-1 text-xs">
                          {composeSelectedSubjects.map(subId => {
                            const subName = subjects.find(s => s.id === subId)?.name || subId;
                            return (
                              <button
                                key={subId}
                                type="button"
                                onClick={() => setStep4PerfSubject(subId)}
                                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                                  step4PerfSubject === subId
                                    ? "bg-indigo-600 text-white shadow-2xs"
                                    : "text-muted-foreground hover:bg-card"
                                }`}
                              >
                                {subName}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <V2ClassroomPerformance
                        subjects={v2SubjectsList}
                        activeSubjectId={step4PerfSubject}
                        onSelectSubject={setStep4PerfSubject}
                        hideSubjectTabs={true}
                        ratings={step4StudentRatings[currentStep4Student.id] || []}
                        onChange={nextRatings => {
                          setStep4StudentRatings(prev => ({
                            ...prev,
                            [currentStep4Student.id]: nextRatings
                          }));
                        }}
                      />
                    </div>

                    {/* 学习习惯与能力成长总结 */}
                    <div className="space-y-2.5 rounded-xl border border-sky-100 bg-sky-50/40 p-3.5 dark:border-sky-900/40 dark:bg-sky-950/20">
                      <div className="flex items-center justify-between">
                        <h4 className="flex items-center gap-1.5 text-xs font-bold text-sky-900 dark:text-sky-200">
                          <span>学习习惯与能力成长总结</span>
                        </h4>
                        <span className="text-[11px] text-muted-foreground">
                          分别填写该生各维度的观察亮点，留空可在草稿中补充
                        </span>
                      </div>
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        {growthDimensions.map(([key, label]) => (
                          <div key={key} className="space-y-1">
                            <label className="text-[11px] font-semibold text-sky-950 dark:text-sky-300">{label}</label>
                            <Textarea
                              rows={2}
                              value={step4StudentGrowthAssessment[currentStep4Student.id]?.[key] || ""}
                              onChange={e => {
                                const val = e.target.value;
                                setStep4StudentGrowthAssessment(prev => ({
                                  ...prev,
                                  [currentStep4Student.id]: {
                                    ...(prev[currentStep4Student.id] || emptyGrowthAssessment()),
                                    [key]: val
                                  }
                                }));
                              }}
                              placeholder={
                                key === "overallUnderstanding"
                                  ? "综合本周期观察，填写成长变化与后续关注方向"
                                  : "填写实际观察到的成长亮点"
                              }
                              className="border-sky-200 bg-white text-xs dark:bg-card"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 老师想对你说 */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <label className="font-bold">老师想对你说</label>
                        <span className="text-[11px] text-muted-foreground">留空时自动结合掌握情况生成</span>
                      </div>
                      <Textarea
                        rows={2}
                        value={step4StudentComments[currentStep4Student.id] || ""}
                        onChange={e => {
                          const val = e.target.value;
                          setStep4StudentComments(prev => ({ ...prev, [currentStep4Student.id]: val }));
                        }}
                        placeholder="输入教师专属寄语与鼓励..."
                        className="text-xs"
                      />
                    </div>

                    {/* 下一步重点 */}
                    <div className="space-y-2 rounded-xl border bg-card p-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold">🎯 下一步重点</span>
                        <button
                          type="button"
                          disabled={step4FocusItems.length >= 8}
                          onClick={() => {
                            if (step4FocusItems.length >= 8) return;
                            setStep4FocusItems(prev => [...prev, ""]);
                          }}
                          className="text-[11px] font-semibold text-indigo-600 hover:underline disabled:opacity-40"
                        >
                          + 添加重点建议 ({step4FocusItems.length}/8)
                        </button>
                      </div>
                      <div className="space-y-1.5 text-xs">
                        {step4FocusItems.length === 0 ? (
                          <p className="py-1 text-[11px] text-muted-foreground">
                            暂无重点建议，可点击右上角“+ 添加重点建议”添加（选填，最多8条）。
                          </p>
                        ) : (
                          step4FocusItems.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-2 rounded-lg border bg-muted/30 p-1.5">
                              <span className="font-bold text-indigo-600">{idx + 1}.</span>
                              <input
                                type="text"
                                value={item}
                                placeholder="输入下一阶段具体学习或习惯重点..."
                                onChange={e => {
                                  const val = e.target.value;
                                  setStep4FocusItems(prev => prev.map((x, i) => (i === idx ? val : x)));
                                }}
                                className="flex-1 bg-transparent text-xs outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => setStep4FocusItems(prev => prev.filter((_, i) => i !== idx))}
                                className="text-muted-foreground hover:text-red-500"
                              >
                                ✕
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t pt-2">
                      <span className="text-xs font-medium text-emerald-600">✓ 当前学生反馈已暂存</span>
                      <button
                        type="button"
                        onClick={() => {
                          const selectedStudents = students.filter(s => selectedStudentIds.includes(s.id));
                          const isLast = step4StudentIndex >= selectedStudents.length - 1;

                          setStep4CompletedIds(prev =>
                            prev.includes(currentStep4Student.id) ? prev : [...prev, currentStep4Student.id]
                          );

                          if (isLast) {
                            showToast("已经完成全部学生的报告填写，请点击确认生成草稿");
                          } else {
                            const nextIdx = step4StudentIndex + 1;
                            setStep4StudentIndex(nextIdx);
                            showToast(`已暂存「${currentStep4Student.name}」的完整课堂反馈，已切换到下一位`);
                          }
                        }}
                        className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700"
                      >
                        <span>保存并切换下一位学生</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 关键词与全班观察 */}
              <div className="grid gap-3 border-t pt-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted-foreground">补充关键词</label>
                  <Input
                    value={step4Keywords}
                    placeholder="选填，多个用逗号隔开，如：生态探究、合作表达"
                    onChange={e => setStep4Keywords(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted-foreground">本周期全班共同观察</label>
                  <Input
                    value={step4Observation}
                    placeholder="选填，如：本周全班开展了小组自然探索拼图游戏..."
                    onChange={e => setStep4Observation(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              {/* 底部最终生成提交栏 */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/40">
                <div className="text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-900 dark:text-emerald-100">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>
                      生成校验规则就绪：已选 {selectedStudentIds.length} 人 · {composeSelectedSubjects.length} 学科 ·
                      日期区间有效
                    </span>
                  </div>
                  <div className="mt-0.5 text-muted-foreground">
                    点击后生成各学生专属报告草稿，100% 保持原有报告视觉与排版规则
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateBatchReports}
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-indigo-700"
                >
                  <Rocket className="h-4 w-4" />
                  <span>确认生成 {selectedStudentIds.length} 份报告草稿</span>
                </button>
              </div>
            </div>
          )}
        </main>
      )}

      {/* ========================================================================= */}
      {/* 模块三：【学期学科设置与课程资料】(Settings)                              */}
      {/* ========================================================================= */}
      {activeMainTab === "settings" && (
        <main className="space-y-4 animate-in fade-in duration-200">
          <div className="grid gap-4 md:grid-cols-2">
            {/* 1）学期与学科设置 */}
            <div className="space-y-4 rounded-2xl border bg-card p-5">
              <div className="flex items-center gap-2.5 border-b pb-2.5">
                <Calendar className="h-7 w-7 text-indigo-600" />
                <div>
                  <h2 className="text-sm font-bold">学期与学科设置</h2>
                  <p className="text-xs text-muted-foreground">维护当前学校的学期日历以及任教学科列表。</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-muted-foreground">新建学科</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="新增学科名称（如 戏剧、陶艺）"
                    value={newSubjectInput}
                    onChange={e => setNewSubjectInput(e.target.value)}
                    className="h-9 text-xs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={async () => {
                      if (!newSubjectInput.trim()) return;
                      await request.post(`${base}/report-subjects`, { name: newSubjectInput.trim() }).catch(() => null);
                      setSubjects(prev => [...prev, { id: createUuid(), name: newSubjectInput.trim() }]);
                      showToast(`已成功添加「${newSubjectInput.trim()}」学科`);
                      setNewSubjectInput("");
                    }}
                    className="h-9 bg-indigo-600 text-xs font-medium text-white hover:bg-indigo-700"
                  >
                    + 添加学科
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {subjects.map(s => (
                    <span key={s.id} className="rounded-lg border bg-muted/40 px-2.5 py-1 text-xs font-medium">
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-2 border-t pt-3">
                <label className="block text-xs font-bold text-muted-foreground">新建学期</label>
                <div className="space-y-2">
                  <Input
                    placeholder="学期名称（如 2026-2027学年第一学期）"
                    value={termNameInput}
                    onChange={e => setTermNameInput(e.target.value)}
                    className="h-9 text-xs"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="date"
                      value={termStartInput}
                      onChange={e => setTermStartInput(e.target.value)}
                      className="h-8 text-xs"
                    />
                    <Input
                      type="date"
                      value={termEndInput}
                      onChange={e => setTermEndInput(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (!termNameInput.trim()) {
                        showToast("请输入学期名称");
                        return;
                      }
                      await request
                        .post(`${base}/report-terms`, {
                          name: termNameInput.trim(),
                          startDate: termStartInput,
                          endDate: termEndInput
                        })
                        .catch(() => null);
                      setTerms(prev => [
                        ...prev,
                        {
                          id: createUuid(),
                          name: termNameInput.trim(),
                          startDate: termStartInput,
                          endDate: termEndInput
                        }
                      ]);
                      showToast(`学期「${termNameInput.trim()}」已创建成功！`);
                      setTermNameInput("");
                    }}
                    className="h-8 w-full text-xs font-medium"
                  >
                    + 新建学期
                  </Button>
                </div>
                <div className="space-y-1.5 pt-2">
                  <span className="block text-[11px] font-bold text-muted-foreground">既有学期日历:</span>
                  {terms.map(t => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between rounded-lg border bg-muted/20 p-2 text-[11px]"
                    >
                      <span className="font-semibold">{t.name}</span>
                      <span className="text-muted-foreground">
                        {t.startDate} 至 {t.endDate}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 2）课程资料上传与章节核对 */}
            <div className="space-y-4 rounded-2xl border bg-card p-5">
              <div className="flex items-center justify-between border-b pb-2.5">
                <div className="flex items-center gap-2.5">
                  <Upload className="h-7 w-7 text-indigo-600" />
                  <div>
                    <h2 className="text-sm font-bold">课程资料上传与章节核对</h2>
                    <p className="text-xs text-muted-foreground">上传课本 PDF 后自动解析章节课时，供报告引用。</p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">最大 30MB</span>
              </div>

              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50/30 p-5 text-center transition hover:bg-indigo-50/60 dark:border-indigo-700 dark:bg-indigo-950/20">
                <Upload className="h-8 w-8 text-indigo-500" />
                <span className="mt-1 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                  选择课程 PDF（最大 30MB）
                </span>
                <span className="text-[11px] text-muted-foreground">上传后自动解析，核对章节后用于报告</span>
                <input
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={() => showToast("正在上传 PDF 并等待服务器解析课时要点...")}
                />
              </label>

              <div className="space-y-2 rounded-xl border bg-muted/20 p-3.5 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-indigo-600" />
                    <div>
                      <div className="font-bold">小学三年级英语上册.pdf</div>
                      <div className="text-[11px] text-muted-foreground">已提取 84 页 · 12 个单元或课时</div>
                    </div>
                  </div>
                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                    已确认
                  </span>
                </div>
                {documents.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between border-t pt-2">
                    <span className="font-semibold text-foreground">{doc.fileName}</span>
                    <span className="text-muted-foreground">{doc.pageCount || 10}页</span>
                  </div>
                ))}
                <div className="border-t pt-2">
                  <span className="block text-[11px] font-bold text-muted-foreground mb-1">已解析核心单元列表:</span>
                  <p className="rounded-lg border bg-card p-2 font-mono text-[11px] leading-relaxed">
                    Unit 1 Hello! · Unit 2 Colours · Unit 3 Look at me! · Unit 4 We love animals
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 3）配置学科课堂表现 */}
          <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
              <div>
                <h2 className="text-sm font-bold">配置学科课堂表现</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  每门学科配置 1~12 项评价维度，每项预设选项；报告打分时严格单选此处预设好的值，不可输入。
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium text-muted-foreground">选择学科:</span>
                <select
                  aria-label="配置学科切换"
                  value={activeConfigSubjectId}
                  onChange={e => setActiveConfigSubjectId(e.target.value)}
                  className="h-8 rounded-xl border border-indigo-300 bg-card px-3 font-bold text-indigo-600 dark:border-indigo-700"
                >
                  {subjects.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold text-muted-foreground">当前学科评价维度列表:</span>
              <div className="grid gap-3 sm:grid-cols-2">
                {(subjectConfigs[activeConfigSubjectId] || []).map((field, idx) => (
                  <div key={idx} className="space-y-1.5 rounded-xl border bg-muted/20 p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold flex items-center gap-1.5">
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-600">
                          {idx + 1}
                        </span>
                        <span>{field.label}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSubjectConfigs(prev => ({
                            ...prev,
                            [activeConfigSubjectId]: prev[activeConfigSubjectId]?.filter((_, i) => i !== idx) || []
                          }));
                          showToast("已删除该评价维度");
                        }}
                        className="text-[11px] text-red-500 hover:text-red-700"
                      >
                        删除
                      </button>
                    </div>
                    <Textarea
                      rows={2}
                      value={field.options.join("\n")}
                      onChange={e => {
                        const opts = e.target.value.split("\n").filter(Boolean);
                        setSubjectConfigs(prev => ({
                          ...prev,
                          [activeConfigSubjectId]:
                            prev[activeConfigSubjectId]?.map((f, i) => (i === idx ? { ...f, options: opts } : f)) || []
                        }));
                      }}
                      className="font-mono text-[11px]"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* 新增表现项目 */}
            <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <span className="text-xs font-bold">➕ 新增课堂表现项目</span>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  placeholder="项目名称（例如：同伴协作探究）"
                  value={newFieldLabel}
                  onChange={e => setNewFieldLabel(e.target.value)}
                  className="h-9 text-xs"
                />
                <Textarea
                  rows={2}
                  placeholder="下拉预设值（每行一个）&#10;积极主动&#10;配合投入&#10;需要引导"
                  value={newFieldOptions}
                  onChange={e => setNewFieldOptions(e.target.value)}
                  className="text-xs"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const label = newFieldLabel.trim();
                    const options = newFieldOptions
                      .split("\n")
                      .map(s => s.trim())
                      .filter(Boolean);
                    if (!label || !options.length) {
                      showToast("请输入项目名称与至少一个预设值");
                      return;
                    }
                    setSubjectConfigs(prev => ({
                      ...prev,
                      [activeConfigSubjectId]: [...(prev[activeConfigSubjectId] || []), { label, options }]
                    }));
                    setNewFieldLabel("");
                    setNewFieldOptions("");
                    showToast(`已成功添加「${label}」维度！`);
                  }}
                  className="border-indigo-300 font-bold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300"
                >
                  + 添加课堂表现项目
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between border-t pt-2">
              <span className="text-xs text-muted-foreground">
                💡 保存后，返回【填写与生成】即可在打分台看到更新后的胶囊预设选项。
              </span>
              <Button
                type="button"
                onClick={async () => {
                  await request
                    .patch(`${base}/report-subjects/${activeConfigSubjectId}/performance-config`, {
                      performanceConfig: subjectConfigs[activeConfigSubjectId] || []
                    })
                    .catch(() => null);
                  showToast("🎉 课堂表现配置已保存！已同步生效至报告打分工作台。");
                }}
                className="bg-indigo-600 font-bold text-white shadow-md hover:bg-indigo-700"
              >
                保存课堂表现配置
              </Button>
            </div>
          </div>
        </main>
      )}

      {/* ========================================================================= */}
      {/* 弹窗：【报告草稿微调与 1:1 实时长图模态框】(具备高可靠关闭)              */}
      {/* ========================================================================= */}
      {editingDraftReport && (
        <DraftEditModal
          report={editingDraftReport}
          allAvailableSubjects={v2SubjectsList}
          isOpen={Boolean(editingDraftReport)}
          onClose={() => setEditingDraftReport(null)}
          onSave={handleSaveDraft}
          onPublish={handlePublishDraft}
        />
      )}

      {/* 单份图片弹窗 */}
      {activeImageReport && (
        <ReportImageDialog
          shareUrl={
            isValidShareUrl(activeImageReport.share?.url)
              ? activeImageReport.share!.url
              : `${typeof window !== "undefined" ? window.location.origin : "http://localhost"}/r/${generateValidShareToken()}`
          }
          studentName={activeImageReport.studentName}
          reportId={activeImageReport.id}
          reportData={activeImageReport.content as unknown as LearningReportData}
          onClose={() => setActiveImageReport(null)}
          onShareUpdated={newUrl => {
            const localUrl = localReportShareUrl(newUrl, window.location.origin);
            setReports(old =>
              old.map(row =>
                row.id === activeImageReport.id
                  ? { ...row, share: row.share ? { ...row.share, url: localUrl } : { id: "share", url: localUrl } }
                  : row
              )
            );
          }}
        />
      )}

      {/* 批量打包长图 ZIP */}
      {batchExportOpen && (
        <BatchReportImageDialog
          reports={reports.filter(r => selectedReportIds.includes(r.id))}
          onClose={() => setBatchExportOpen(false)}
        />
      )}

      {/* 批量发布确认弹窗 (必须使用项目内 ConfirmDialog，严禁原生 alert/confirm) */}
      <ConfirmDialog
        open={confirmBatchPublishOpen}
        title="确认批量发布所选报告草稿？"
        description={`确定将所选的 ${selectedReportIds.length} 份报告草稿正式发布并生成家长链接吗？发布后家长即可通过链接访问。`}
        confirmText="确认发布"
        cancelText="取消"
        onConfirm={() => void handleBatchPublish()}
        onCancel={() => setConfirmBatchPublishOpen(false)}
      />

      {/* 删除报告确认弹窗 */}
      <ConfirmDialog
        open={Boolean(confirmDeleteReport)}
        title="确认删除该份报告？"
        description={`确定要删除「${confirmDeleteReport?.studentName}」的此份报告吗？删除后不可恢复。`}
        confirmText="确认删除"
        cancelText="取消"
        onConfirm={() => void handleDeleteReport()}
        onCancel={() => setConfirmDeleteReport(null)}
      />

      {/* 页面内全局通知 Toast */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 z-[9999] -translate-x-1/2 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-2xl animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
