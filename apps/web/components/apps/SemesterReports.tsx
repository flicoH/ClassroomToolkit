"use client";
import {
  ClassroomPerformanceFields,
  performanceRatings,
  performanceEntries
} from "@/components/semester-reports/ClassroomPerformanceFields";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  ChevronDown,
  Clipboard,
  Download,
  FileText,
  ImageIcon,
  LoaderCircle,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { CartoonSemesterReportIcon } from "@/components/icons/CartoonAppIcons";
import request from "@/lib/request";
import { copyText } from "@/lib/clipboard";
import { createUuid } from "@/lib/id";
import {
  LearningReportView,
  learningSectionTitle,
  reportClassroomPhotos,
  showsLearningMastery,
  masteryLabels,
  type LearningContent,
  type LearningReportContent
} from "@/components/semester-reports/LearningReportView";
import { ReportStudentPicker } from "@/components/semester-reports/ReportStudentPicker";
import { ReportImageDialog } from "@/components/semester-reports/ReportImageDialog";
import { BatchReportImageDialog } from "@/components/semester-reports/BatchReportImageDialog";
import { SubjectCoursePicker, courseSelectionsFromScopes } from "@/components/semester-reports/SubjectCoursePicker";
import { SubjectPerformanceConfig } from "@/components/semester-reports/SubjectPerformanceConfig";
import type { PerformanceField } from "@/components/semester-reports/performance-config";
import { GrowthAssessmentFields } from "@/components/semester-reports/GrowthAssessmentFields";
import { localReportShareUrl } from "@/lib/report-share-url";
import { ReportHistory } from "@/components/semester-reports/ReportHistory";
import { PeriodScoreChart } from "@/components/semester-reports/PeriodScoreChart";
import { ReportPetView, type ReportPet } from "@/components/semester-reports/ReportPetView";
import type { ScoreDetails } from "@/components/semester-reports/ScoreDetailsView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  StudentFeedbackForm,
  emptyStudentFeedback,
  type StudentReportFeedback
} from "@/components/semester-reports/StudentFeedbackForm";

type Term = { id: string; name: string; startDate: string; endDate: string };
type Subject = { id: string; name: string; performanceConfig?: PerformanceField[] | null };
/** 报告选择器读取宠物积分学生 ID，头像则由后端匹配学生管理资料后写入报告快照。 */
type Student = ReportPet & { id: string; name: string; classId: string; className: string; score: number };
/** 列表响应只提供摘要；打开编辑时再取详情，避免轮询携带照片和完整报告正文。 */
type Report = {
  courseSelections?: Array<{ subjectId: string; courseScope: string; manualContent?: string }>;
  reportVersion?: "v1" | "v2";
  subjectName?: string;
  id: string;
  studentName: string;
  className: string;
  period: string;
  status: string;
  content: Record<string, unknown> | null;
  errorMessage?: string;
  updatedAt?: string | null;
  generationMode?: "template" | "ai" | null;
  share?: { id: string; url: string } | null;
  start?: string;
  end?: string;
  termId?: string;
  subjectId?: string;
  courseScope?: string | null;
};
type ReportContent = LearningReportContent;
type Document = {
  id: string;
  termId: string;
  subjectId: string;
  fileName: string;
  status: string;
  errorMessage?: string;
  pageCount?: number;
  units?: string[];
  detectedUnits?: string[];
};
type ScopePreview = {
  courseScope: string;
  totalPages: number;
  documents: Array<{ id: string; fileName: string; pages: number[] }>;
  learningContents: Array<Omit<LearningContent, "mastery">>;
  totalLearningContents: number;
};
type ScorePreview = {
  petPreviews?: Array<{
    studentId: string;
    pet: ReportPet | null;
    petAsOf: string;
    petHistoryStatus: "recorded" | "unavailable";
  }>;
  scoreSummaries: Array<ScoreDetails & { studentId: string; studentName: string }>;
};

const base = "/api/semester-reports";
const mobileReportControls =
  "max-md:[&_button]:min-h-11 max-md:[&_button]:min-w-11 max-md:[&_select]:h-11 max-md:[&_select]:min-w-0 max-md:[&_select]:max-w-full max-md:[&_select]:text-base max-md:[&_textarea]:text-base max-md:[&_input:not([type=checkbox]):not([type=file])]:h-11 max-md:[&_input]:text-base [&_input]:min-w-0 [&_input]:max-w-full";
const labels: Record<string, string> = {
  queued: "排队中",
  generating: "生成中",
  failed: "失败",
  draft: "待审核",
  published: "已发布",
  week: "周报",
  month: "月报",
  term: "学期报告",
  parsing: "解析中",
  needs_review: "待确认",
  ready: "可用"
};
const documentStatusHints: Record<string, { title: string; description: string }> = {
  queued: { title: "等待后台解析", description: "PDF 已上传，正在排队。处理状态会自动刷新，可以继续填写报告。" },
  parsing: {
    title: "正在解析 PDF",
    description: "正在提取课程文字与章节，较大的文件需要更长时间。无需重复上传，完成后请核对章节。"
  },
  needs_review: { title: "解析完成，请确认章节", description: "请核对下方章节，点击“确认章节”后即可用于生成报告。" }
};
function localDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
/** 默认覆盖完整教学周期；未来结束日期仍由后端按所选学期范围校验。 */
function defaultReportDates(period: string, term?: Term) {
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
  }
  return { start: localDateString(first), end: localDateString(last) };
}
/** 保存时间统一按上海时区展示，避免老师与家长设备时区不同导致日期看似错位。 */
function ReportEditTime({ value }: { value?: string | null }) {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return <>暂无记录</>;
  return (
    <time dateTime={value!}>
      {date.toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
      })}
    </time>
  );
}
function errorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { message?: unknown } } }).response;
    if (typeof response?.data?.message === "string") return response.data.message;
  }
  return error instanceof Error ? error.message : "请求失败，请稍后重试。";
}

/** 原版与 v2 共用的教师工作台：课程输入 → 分学生评价 → 后台生成 → 草稿核对 → 发布分享。 */
export function SemesterReports({ version = "v1" }: { version?: "v1" | "v2" }) {
  const isV2 = version === "v2";
  const reportTitle = isV2 ? "学期报告v2" : "学期报告";
  const sectionId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [mobileSection, setMobileSection] = useState<"courses" | "compose" | "reports">("courses");
  function showSection(section: typeof mobileSection) {
    setMobileSection(section);
    if (scrollRef.current && window.matchMedia?.("(max-width: 767px)").matches) scrollRef.current.scrollTop = 0;
  }
  const [terms, setTerms] = useState<Term[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [reportSearch, setReportSearch] = useState("");
  const [reportStatus, setReportStatus] = useState("");
  const [reportPeriod, setReportPeriod] = useState("");
  const [reportStartDate, setReportStartDate] = useState("");
  const [reportEndDate, setReportEndDate] = useState("");
  const invalidReportDateRange = Boolean(reportStartDate && reportEndDate && reportStartDate > reportEndDate);
  const reportRangeStart = reportStartDate ? Date.parse(`${reportStartDate}T00:00:00+08:00`) : null;
  const reportRangeEnd = reportEndDate ? Date.parse(`${reportEndDate}T00:00:00+08:00`) + 86400000 : null;
  const [debouncedReportSearch, setDebouncedReportSearch] = useState("");
  const reportPages = useRef(1);
  const [hasMoreReports, setHasMoreReports] = useState(false);
  const [loadingReports, setLoadingReports] = useState(false);
  const reportLoadRevision = useRef(0);
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [publishingReports, setPublishingReports] = useState(false);
  const publishingInFlight = useRef(false);
  const [confirmBatchPublish, setConfirmBatchPublish] = useState(false);
  const [batchResult, setBatchResult] = useState("");
  const [batchFailures, setBatchFailures] = useState<string[]>([]);
  const [exportReports, setExportReports] = useState<Report[] | null>(null);
  const reportSearchQuery = reportSearch.trim();
  const visibleReports = reports.filter(
    report =>
      !invalidReportDateRange &&
      (!reportStatus || report.status === reportStatus) &&
      (!reportPeriod || report.period === reportPeriod) &&
      (reportRangeStart === null || Date.parse(report.end ?? "") > reportRangeStart) &&
      (reportRangeEnd === null || Date.parse(report.start ?? "") < reportRangeEnd) &&
      (!reportSearchQuery ||
        [report.studentName, report.className, report.subjectName].some(value =>
          value?.toLocaleLowerCase().includes(reportSearchQuery.toLocaleLowerCase())
        ))
  );
  const selectableReports = visibleReports.filter(report => report.status === "draft" || report.status === "published");
  const selectedReports = selectableReports.filter(report => selectedReportIds.includes(report.id));
  const selectedDrafts = selectedReports.filter(report => report.status === "draft");
  const allReportsSelected =
    selectableReports.length > 0 && selectableReports.every(report => selectedReportIds.includes(report.id));
  const selectionRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectionRef.current) selectionRef.current.indeterminate = selectedReports.length > 0 && !allReportsSelected;
  }, [selectedReports.length, allReportsSelected]);
  useEffect(() => {
    setSelectedReportIds([]);
    setBatchResult("");
    setBatchFailures([]);
    const timer = setTimeout(() => setDebouncedReportSearch(reportSearchQuery), 350);
    return () => clearTimeout(timer);
  }, [reportSearchQuery, reportStatus, reportPeriod, reportStartDate, reportEndDate, version]);
  useEffect(() => {
    reportPages.current = 1;
    setHasMoreReports(false);
  }, [debouncedReportSearch, reportStatus, reportPeriod, reportStartDate, reportEndDate, version]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [unitDrafts, setUnitDrafts] = useState<Record<string, string>>({});
  const [reviewingDocumentId, setReviewingDocumentId] = useState<string | null>(null);
  const [draftSubjectScopes, setDraftSubjectScopes] = useState<Record<string, string>>({});
  const [termId, setTermId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const subjectRevision = useRef(0);
  const [period, setPeriod] = useState("week");
  const [generationMode] = useState("template");
  const [start, setStart] = useState(() => defaultReportDates("week").start);
  const [end, setEnd] = useState(() => defaultReportDates("week").end);
  const [selected, setSelected] = useState<string[]>([]);
  const [keywords, setKeywords] = useState("");
  const [observation, setObservation] = useState("");
  const [reportDetails, setReportDetails] = useState({
    institutionName: "课堂成长记录",
    courseTheme: "",
    lessonNumber: null as number | null,
    lessonDate: ""
  });
  // 评价以学期、周期、日期和学生区分；切换当前学生只切换表单，不丢掉其他学生的已填内容。
  const [studentFeedback, setStudentFeedback] = useState<Record<string, StudentReportFeedback>>({});
  const [feedbackStudentId, setFeedbackStudentId] = useState("");
  const [courseScope, setCourseScope] = useState("");
  const [subjectScopes, setSubjectScopes] = useState<Record<string, string>>({});
  const [courseSource, setCourseSource] = useState<"manual" | "pdf" | null>(null);
  const hasReadyCourse = documents.some(
    document => document.termId === termId && document.subjectId === subjectId && document.status === "ready"
  );
  const usesManualCourse = !isV2 && (courseSource === "manual" || (courseSource === null && !hasReadyCourse));
  useEffect(() => {
    setCourseSource(null);
  }, [termId, subjectId]);
  // 手填来源显式提交并保存，之后上传 PDF 或重试也不能将教师内容改成页码范围。
  const courseSelections = useMemo(
    () =>
      isV2
        ? courseSelectionsFromScopes(subjectScopes, [], termId, true)
        : usesManualCourse
          ? [{ subjectId, courseScope: "", manualContent: courseScope.trim() }]
          : [],
    [subjectScopes, termId, isV2, usesManualCourse, subjectId, courseScope]
  );
  const scopeDocumentKey =
    isV2 || usesManualCourse
      ? ""
      : JSON.stringify(documents.filter(document => document.termId === termId && document.subjectId === subjectId));
  const courseSelectionKey = isV2 || usesManualCourse ? JSON.stringify(courseSelections) : subjectId;
  const feedbackContext = isV2 ? "v2" : subjectId;
  const invalidCourseSelection =
    isV2 &&
    (!courseSelections.length ||
      courseSelections.some(selection =>
        selection.manualContent !== undefined
          ? selection.manualContent.trim().length > 0 && selection.manualContent.trim().length < 2
          : period !== "term" && selection.courseScope.trim().length < 2
      ));
  useEffect(() => {
    setSubjectScopes({});
  }, [termId]);
  const scopePreviewKey = JSON.stringify([
    version,
    period,
    termId,
    courseSelectionKey,
    isV2 ? null : courseScope.trim(),
    scopeDocumentKey
  ]);
  const [scopePreviewResult, setScopePreviewResult] = useState<{ key: string; data: ScopePreview } | null>(null);
  // 请求返回顺序可能落后于老师的选择；只有标识完全一致的预览才能用于当前生成表单。
  const scopePreview = scopePreviewResult?.key === scopePreviewKey ? scopePreviewResult.data : null;
  const [scopePreviewError, setScopePreviewError] = useState("");
  const [scopePreviewAttempt, setScopePreviewAttempt] = useState(0);
  const [scorePreview, setScorePreview] = useState<{ key: string; data: ScorePreview } | null>(null);
  const [scorePreviewError, setScorePreviewError] = useState("");
  const [scorePreviewAttempt, setScorePreviewAttempt] = useState(0);
  const [newTermName, setNewTermName] = useState("");
  const [newTermStart, setNewTermStart] = useState("");
  const [newTermEnd, setNewTermEnd] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<
    { kind: "report"; report: Report } | { kind: "document"; document: Document } | null
  >(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState<Report | null>(null);
  const activeEditingId = useRef<string | null>(null);
  useEffect(() => {
    activeEditingId.current = editing?.id ?? null;
  }, [editing?.id]);
  const availableDraftSubjects = subjects.filter(
    subject => !(editing?.courseSelections ?? []).some(selection => selection.subjectId === subject.id)
  );
  const [draft, setDraft] = useState<ReportContent | null>(null);
  const [previewingDraft, setPreviewingDraft] = useState(false);
  const [scoreRefreshError, setScoreRefreshError] = useState("");
  useEffect(() => {
    setScoreRefreshError("");
    if (!isV2 || !editing?.id || editing.status !== "draft") return;
    const id = editing.id;
    let cancelled = false;
    let inFlight = false;
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const full = await request.get<Report, Report>(`${base}/reports/${id}`, { params: { refresh: createUuid() } });
        if (cancelled || activeEditingId.current !== id || !full.content) return;
        // 草稿积分允许实时刷新，但不能用详情响应覆盖老师尚未保存的寄语、评价或照片说明。
        const scoreDetails = (full.content as ReportContent).scoreDetails;
        setDraft(current => (current ? { ...current, scoreDetails } : current));
        if (full.status !== "draft")
          setEditing(current => (current?.id === id ? { ...current, status: full.status } : current));
        setScoreRefreshError("");
      } catch (error) {
        if (!cancelled && activeEditingId.current === id)
          setScoreRefreshError(`积分统计刷新失败：${errorMessage(error)}，将自动重试。`);
      } finally {
        inFlight = false;
      }
    };
    const onFocus = () => {
      void refresh();
    };
    const timer = setInterval(onFocus, 5000);
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [isV2, editing?.id, editing?.status]);
  const [loadingReportId, setLoadingReportId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actingReportId, setActingReportId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const uploadInFlight = useRef(false);
  const classroomPhotoInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [uploadState, setUploadState] = useState<{ fileName: string; progress: number | null; error?: string } | null>(
    null
  );
  const [documentRefreshFailed, setDocumentRefreshFailed] = useState(false);
  const [imageReport, setImageReport] = useState<{ studentName: string; url: string } | null>(null);
  const periodTitles: Record<string, string> = { week: "本周", month: "本月", term: "本学期" };
  // Historical reports can have a different period from the current creation form.
  const editingPeriodTitle = periodTitles[editing?.period ?? ""] ?? "本期";
  useEffect(() => {
    if (!editing?.id) return;
    const previous = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("[data-report-history-confirm]")) {
        event.preventDefault();
        setEditing(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus({ preventScroll: true });
    };
    // 只在切换报告时管理焦点；同一草稿的轮询更新不应把阅读位置跳回窗口顶部。
  }, [editing?.id]);

  /** 并行读取工作台数据，按版本筛选报告；旧报告未标记版本时按原版兼容。 */
  const load = useCallback(
    async (refreshToken?: string) => {
      const revision = ++reportLoadRevision.current;
      if (invalidReportDateRange) {
        setLoadingReports(false);
        return;
      }
      const pages = reportPages.current;
      const loadedSubjectRevision = subjectRevision.current;
      setLoadingReports(true);
      try {
        const [t, s, p, r, d] = await Promise.all([
          request.get<Term[], Term[]>(`${base}/report-terms`),
          request.get<Subject[], Subject[]>(`${base}/report-subjects`),
          request.get<{ students: Student[] }, { students: Student[] }>("/api/pet-points"),
          Promise.all(
            Array.from({ length: pages }, (_, page) =>
              request.get<Report[], Report[]>(`${base}/reports`, {
                params: {
                  refresh: refreshToken,
                  q: debouncedReportSearch,
                  status: reportStatus,
                  period: reportPeriod,
                  startDate: reportStartDate,
                  endDate: reportEndDate,
                  version,
                  page: page + 1
                }
              })
            )
          ),
          request.get<Document[], Document[]>(`${base}/course-documents`)
        ]);
        if (revision !== reportLoadRevision.current) return;
        setTerms(t);
        // 学科修改后递增版本号，丢弃修改前发出的列表响应，防止后台轮询撤销刚保存的配置。
        if (loadedSubjectRevision === subjectRevision.current) setSubjects(s);
        setStudents(p.students);
        setReports(
          r
            .flat()
            .filter(report => (report.reportVersion ?? "v1") === version)
            .map(report =>
              report.share
                ? {
                    ...report,
                    share: { ...report.share, url: localReportShareUrl(report.share.url, window.location.origin) }
                  }
                : report
            )
        );
        setHasMoreReports(r.at(-1)?.length === 200);
        setDocuments(d);
        setDocumentRefreshFailed(false);
        setTermId(current => current || t[0]?.id || "");
        setSubjectId(current => current || s[0]?.id || "");
      } finally {
        if (revision === reportLoadRevision.current) setLoadingReports(false);
      }
    },
    [version, debouncedReportSearch, reportStatus, reportPeriod, reportStartDate, reportEndDate, invalidReportDateRange]
  );

  async function loadMoreReports() {
    if (loadingReports || invalidReportDateRange) return;
    const revision = ++reportLoadRevision.current;
    setLoadingReports(true);
    try {
      const next = await request.get<Report[], Report[]>(`${base}/reports`, {
        params: {
          q: debouncedReportSearch,
          status: reportStatus,
          period: reportPeriod,
          startDate: reportStartDate,
          endDate: reportEndDate,
          version,
          page: reportPages.current + 1
        }
      });
      if (revision !== reportLoadRevision.current) return;
      setReports(current => [
        ...current,
        ...next
          .filter(report => !current.some(row => row.id === report.id))
          .map(report =>
            report.share
              ? {
                  ...report,
                  share: { ...report.share, url: localReportShareUrl(report.share.url, window.location.origin) }
                }
              : report
          )
      ]);
      reportPages.current += 1;
      setHasMoreReports(next.length === 200);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoadingReports(false);
    }
  }

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);
  // PDF 解析与报告生成由后台异步执行；仅有未完成任务时刷新，网络失败保留现有列表。
  useEffect(() => {
    const timer = setInterval(() => {
      if (
        reports.some(r => r.status === "queued" || r.status === "generating") ||
        documents.some(d => d.status === "queued" || d.status === "parsing")
      )
        void load().catch(() => {
          if (documents.some(d => d.status === "queued" || d.status === "parsing")) setDocumentRefreshFailed(true);
        });
    }, 2500);
    return () => clearInterval(timer);
  }, [reports, documents, load]);
  const processingDocuments = documents.filter(doc => doc.status === "queued" || doc.status === "parsing");
  const reviewDocuments = documents.filter(doc => doc.status === "needs_review");

  // 授课范围预览做防抖，并在条件变化或组件卸载后忽略旧响应，避免错用上一门课程的内容。
  useEffect(() => {
    setScopePreviewResult(null);
    setScopePreviewError("");
    if (
      !termId ||
      invalidCourseSelection ||
      (!isV2 && (!subjectId || ((usesManualCourse || period !== "term") && courseScope.trim().length < 2)))
    )
      return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void request
        .post<ScopePreview, ScopePreview>(`${base}/course-documents/preview-scope`, {
          period,
          termId,
          subjectId,
          reportVersion: version,
          courseSelections: isV2 || usesManualCourse ? courseSelections : undefined,
          courseScope
        })
        .then(result => {
          if (!cancelled) setScopePreviewResult({ key: scopePreviewKey, data: result });
        })
        .catch(error => {
          if (!cancelled) setScopePreviewError(errorMessage(error));
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    period,
    termId,
    subjectId,
    courseScope,
    scopeDocumentKey,
    scopePreviewAttempt,
    scopePreviewKey,
    version,
    isV2,
    courseSelections,
    usesManualCourse,
    invalidCourseSelection
  ]);

  // 积分和宠物预览绑定所选学生与周期；只能展示对应快照，不能把当前形态冒充历史形态。
  const scorePreviewKey = [period, termId, courseSelectionKey, start, end, ...selected].join(":");
  useEffect(() => {
    setScorePreviewError("");
    if (
      !termId ||
      invalidCourseSelection ||
      (!isV2 && (!subjectId || (usesManualCourse && courseScope.trim().length < 2))) ||
      !selected.length ||
      !start ||
      !end ||
      end < start
    )
      return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void request
        .post<ScorePreview, ScorePreview>(`${base}/reports/preview-input`, {
          period,
          termId,
          subjectId,
          reportVersion: version,
          courseSelections: isV2 || usesManualCourse ? courseSelections : undefined,
          start,
          end,
          studentIds: selected
        })
        .then(data => {
          if (!cancelled) setScorePreview({ key: scorePreviewKey, data });
        })
        .catch(error => {
          if (!cancelled) setScorePreviewError(errorMessage(error));
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    period,
    termId,
    subjectId,
    courseScope,
    start,
    end,
    selected,
    scorePreviewKey,
    scorePreviewAttempt,
    version,
    isV2,
    courseSelections,
    usesManualCourse,
    invalidCourseSelection
  ]);

  const availableUnits = [
    ...new Set(
      documents
        .filter(
          document =>
            document.status === "ready" && document.termId === termId && (isV2 || document.subjectId === subjectId)
        )
        .flatMap(document => [
          ...(document.units ?? [])
          // ...Array.from({ length: Math.min(document.pageCount ?? 0, 100) }, (_, index) => `第${index + 1}页`)
        ])
    )
  ];

  const term = terms.find(t => t.id === termId);
  const selectedStudents = useMemo(() => students.filter(s => selected.includes(s.id)), [students, selected]);
  const feedbackStudent = selectedStudents.find(student => student.id === feedbackStudentId) ?? selectedStudents[0];
  const feedbackKey = feedbackStudent
    ? `${termId}:${feedbackContext}:${period}:${start}:${end}:${feedbackStudent.id}`
    : "";
  const selectedPet =
    scorePreview?.key === scorePreviewKey
      ? scorePreview.data.petPreviews?.find(preview => preview.studentId === feedbackStudent?.id)
      : undefined;

  const selectedScore =
    scorePreview?.key === scorePreviewKey
      ? scorePreview.data.scoreSummaries?.find(summary => summary.studentId === feedbackStudent?.id)
      : undefined;

  // 将禁用原因与按钮状态共用，避免老师选完后只看到灰色按钮却不知道如何继续。
  const generationBlockedReason = (() => {
    if (busy) return "正在处理，请稍候。";
    if (!termId) return "请先选择学期。";
    if (!isV2 && !subjectId) return "请先选择学科。";
    if (!selected.length) return "请选择至少一位学生。";
    if (isV2 && !courseSelections.length) return "请选择至少一门学科。";
    if (!start || !end) return "请填写周期开始和结束日期。";
    if (end < start) return "周期结束日期不能早于开始日期。";
    if (reportDetails.lessonDate && (reportDetails.lessonDate < start || reportDetails.lessonDate > end))
      return "授课日期须在周期内，请调整授课日期或报告周期。";
    if (
      reportDetails.lessonNumber !== null &&
      (!Number.isInteger(reportDetails.lessonNumber) ||
        reportDetails.lessonNumber < 1 ||
        reportDetails.lessonNumber > 999)
    )
      return "第几次课须填写 1 至 999 的整数，或留空。";
    if (isV2 && invalidCourseSelection) return "请检查所选学科的教学内容。";
    if (usesManualCourse && courseScope.trim().length < 2) return "请手动填写至少 2 个字符的教学内容，每行一项。";
    if (!isV2 && !usesManualCourse && period !== "term" && courseScope.trim().length < 2)
      return "请先选择或填写本周期已授课范围。";
    if (scopePreviewError) return `${isV2 ? "学科确认" : "学习内容预览"}失败，请重试：${scopePreviewError}`;
    if (!scopePreview) return isV2 ? "正在确认已选学科，请稍候。" : "正在加载所选学习内容，请稍候。";
    if (
      scopePreview.totalPages === 0 &&
      !((isV2 || usesManualCourse) && courseSelections.some(selection => selection.manualContent !== undefined))
    )
      return "未匹配到可用课程页面，请确认资料已解析并核对授课范围。";
    if ((scopePreview.totalLearningContents ?? 0) > 500) return "学习内容超过 500 项，请缩小授课范围。";
    return "";
  })();

  function changePeriod(nextPeriod: string, nextTermId = termId) {
    setPeriod(nextPeriod);
    const dates = defaultReportDates(
      nextPeriod,
      terms.find(item => item.id === nextTermId)
    );
    setStart(dates.start);
    setEnd(dates.end);
  }

  async function createTerm() {
    const name = newTermName.trim();
    if (!name || !newTermStart || !newTermEnd || newTermEnd <= newTermStart) {
      setMessage("新建学期请填写名称、开始日期和结束日期，并确保结束日期晚于开始日期。");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const row = await request.post<Term, Term>(`${base}/report-terms`, {
        name,
        startDate: newTermStart,
        endDate: newTermEnd
      });
      setTerms(old => [row, ...old]);
      setTermId(row.id);
      if (period === "term") {
        const dates = defaultReportDates("term", row);
        setStart(dates.start);
        setEnd(dates.end);
      }
      setNewTermName("");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function createSubject() {
    const name = newSubject.trim();
    if (!name) {
      setMessage("请先填写学科名称。");
      return;
    }
    subjectRevision.current += 1;
    setBusy(true);
    setMessage("");
    try {
      const row = await request.post<Subject, Subject>(`${base}/report-subjects`, { name });
      setSubjects(old => [...old, row]);
      setSubjectId(row.id);
      setNewSubject("");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      subjectRevision.current += 1;
      setBusy(false);
    }
  }
  async function saveSubjectPerformance(fields: PerformanceField[]): Promise<boolean> {
    subjectRevision.current += 1;
    setBusy(true);
    setMessage("");
    try {
      const row = await request.patch<Subject, Subject>(`${base}/report-subjects/${subjectId}/performance-config`, {
        performanceConfig: fields
      });
      setSubjects(current => current.map(subject => (subject.id === row.id ? row : subject)));
      setMessage("课堂表现配置已保存。");
      return true;
    } catch (error) {
      setMessage(errorMessage(error));
      return false;
    } finally {
      subjectRevision.current += 1;
      setBusy(false);
    }
  }
  /** PDF 上传只登记解析任务；解析完成并经教师确认后，课程资料才进入可用范围。 */
  async function upload(file?: File) {
    if (!file || uploadInFlight.current) return;
    function rejectUpload(reason: string) {
      setMessage(reason);
      setUploadState({ fileName: file!.name, progress: null, error: reason });
    }
    if (!termId) {
      rejectUpload("请先新建并选择学期，再上传课程 PDF。");
      return;
    }
    if (!subjectId) {
      rejectUpload("请先选择学科，再上传课程 PDF。");
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      rejectUpload("PDF 文件不能超过 30MB。");
      return;
    }
    const form = new FormData();
    form.append("file", file);
    form.append("termId", termId);
    form.append("subjectId", subjectId);
    uploadInFlight.current = true;
    setUploadState({ fileName: file.name, progress: null });
    setBusy(true);
    setMessage("");
    try {
      // 二进制请求的 multipart 边界由浏览器生成，否则公共 JSON 请求配置会破坏文件上传。
      const data = await request.post<Document, Document>(`${base}/course-documents`, form, {
        headers: { "Content-Type": undefined },
        timeout: 120000,
        onUploadProgress: event =>
          setUploadState({
            fileName: file.name,
            progress: event.total ? Math.min(100, Math.round((event.loaded / event.total) * 100)) : null
          })
      });
      setDocuments(current => [data, ...current.filter(doc => doc.id !== data.id)]);
      setUploadState(null);
      setMessage(
        data.status === "failed"
          ? data.errorMessage || "PDF 解析失败，请在下方重试。"
          : data.status === "ready"
            ? "这份 PDF 已存在且解析完成，可在下方选择单元、课时或页码。"
            : "PDF 已上传，正在后台解析；完成后请核对章节，无法识别章节时可按页选择。"
      );
      await load().catch(() => setDocumentRefreshFailed(true));
    } catch (error) {
      rejectUpload(errorMessage(error));
    } finally {
      uploadInFlight.current = false;
      setBusy(false);
    }
  }
  /** 确认章节提交老师核对后的内容，重试沿用资料记录；删除由外层项目弹窗先确认。 */
  async function documentAction(id: string, action: "confirm" | "retry" | "delete") {
    const suffix = action === "confirm" ? `/${id}/confirm` : action === "retry" ? `/${id}/retry` : `/${id}`;
    const config =
      action === "confirm"
        ? {
            units: (
              unitDrafts[id] ??
              (() => {
                const doc = documents.find(d => d.id === id);
                return (
                  ((doc?.detectedUnits?.length ?? 0) > (doc?.units?.length ?? 0)
                    ? doc?.detectedUnits
                    : doc?.units
                  )?.join("\n") ?? ""
                );
              })()
            )
              .split("\n")
              .map(x => x.trim())
              .filter(Boolean)
          }
        : undefined;
    if (action === "delete") {
      await request.delete(`${base}/course-documents${suffix}`);
    } else if (action === "confirm") await request.patch(`${base}/course-documents${suffix}`, config);
    else await request.post(`${base}/course-documents${suffix}`);
    await load();
    if (action === "confirm") setReviewingDocumentId(null);
  }
  /** 按已选学生提交各自评价；仅返回排队报告，正文稍后由后台生成并进入审核流程。 */
  async function generate() {
    setBusy(true);
    setMessage("");
    try {
      const result = await request.post<{ reports: Report[] }, { reports: Report[] }>(`${base}/reports/generate`, {
        period,
        generationMode,
        start,
        end,
        termId,
        subjectId,
        reportVersion: version,
        courseSelections: isV2 || usesManualCourse ? courseSelections : undefined,
        studentIds: selected,
        keywords,
        teacherObservation: observation,
        courseScope,
        reportDetails: { ...reportDetails, lessonDate: reportDetails.lessonDate || end },
        studentFeedback: selected.map(studentId => {
          const value =
            studentFeedback[`${termId}:${feedbackContext}:${period}:${start}:${end}:${studentId}`] ??
            emptyStudentFeedback();
          const allowed = new Set(scopePreview?.learningContents.map(item => item.id) ?? []);
          return {
            ...value,
            // v2 的“最值肯定”来自服务端统计的加分事件次数，不能由这里的自由文字伪造。
            ...(isV2 ? { highlight: "" } : {}),
            studentId,
            learningMastery: Object.fromEntries(
              Object.entries(value.learningMastery).filter(([id]) => !isV2 && allowed.has(id))
            ),
            classroomPerformance: value.classroomPerformance.filter(
              item =>
                item.value.trim() &&
                (!isV2 || courseSelections.some(selection => selection.subjectId === item.subjectId))
            )
          };
        })
      });
      setReports(old => [...result.reports, ...old]);
      setMessage(`已提交 ${result.reports.length} 份报告；可在报告列表查看状态。`);
      showSection("reports");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  /** 发布、撤销和复制均以服务端报告状态为准；前端按钮限制不能代替后端教师归属校验。 */
  async function actOnReport(report: Report, action: "publish" | "retry" | "delete" | "copy" | "revoke") {
    if (actingReportId || publishingInFlight.current) return;
    setActingReportId(report.id);
    setMessage("");
    try {
      if (action === "publish" || action === "copy") {
        const result =
          action === "copy" && report.share
            ? { ...report.share, shareId: report.share.id }
            : await request.post<{ url: string; shareId: string }, { url: string; shareId: string }>(
                `${base}/reports/${report.id}/${action === "publish" ? "publish" : "shares"}`
              );
        const shareUrl = localReportShareUrl(result.url, window.location.origin);
        // 先保留发布成功状态；剪贴板失败只影响复制，不能把已经发布的报告显示成发布失败。
        setReports(old =>
          old.map(row =>
            row.id === report.id ? { ...row, status: "published", share: { id: result.shareId, url: shareUrl } } : row
          )
        );
        const copied = await copyText(shareUrl);
        setMessage(
          copied
            ? action === "publish"
              ? "报告已发布，家长链接已复制"
              : "家长链接已复制"
            : "报告已发布，但浏览器未允许自动复制。请在报告下方选中家长链接，手动复制。"
        );
        await load().catch(() => setMessage("报告已发布，家长链接见下方；列表刷新失败，请稍后刷新页面。"));
        return;
      }
      if (action === "delete") {
        await request.delete(`${base}/reports/${report.id}`);
        setReports(current => current.filter(row => row.id !== report.id));
        if (editing?.id === report.id) setEditing(null);
      }
      if (action === "revoke") {
        const result = report.share
          ? await request.delete<{ status: string }, { status: string }>(
              `${base}/reports/${report.id}/shares/${report.share.id}`
            )
          : await request.post<{ status: string }, { status: string }>(`${base}/reports/${report.id}/unpublish`);
        // 撤销后使用新的刷新标识绕过短期 GET 去重缓存，避免读取到变更前的分享状态。
        const refreshToken = createUuid();
        // 老链接的重复撤销请求可能遇到已重新发布的报告，需要再次以服务端状态决定是否打开编辑。
        if (result.status !== "draft") {
          await load(refreshToken);
          setMessage("该链接已撤销，报告状态已更新，请重新查看。");
          return;
        }
        const reopened = { ...report, status: "draft", share: null };
        setReports(current => current.map(row => (row.id === report.id ? reopened : row)));
        await load(refreshToken).catch(() => undefined);
        const opened = await openEdit(reopened, refreshToken);
        if (opened?.status === "draft")
          setMessage(report.share ? "分享链接已撤销，报告已转为草稿，可重新编辑。" : "报告已转为草稿，可重新编辑。");
        else if (opened) setMessage("报告状态已更新，请重新查看。");
        return;
      }
      if (action === "retry") await request.post(`${base}/reports/${report.id}/retry`);
      await load();
    } catch (error) {
      setMessage(errorMessage(error));
      await load().catch(() => undefined);
    } finally {
      setActingReportId(null);
    }
  }
  async function publishSelectedReports() {
    if (publishingInFlight.current || actingReportId || !selectedDrafts.length) return;
    setConfirmBatchPublish(false);
    publishingInFlight.current = true;
    setPublishingReports(true);
    setBatchResult("");
    setBatchFailures([]);
    const succeeded = new Set<string>();
    const failures: string[] = [];
    // 逐份复用发布事务与教师权限校验，避免大批量同时刷新积分和写入分享记录。
    try {
      for (const report of selectedDrafts) {
        try {
          const result = await request.post<{ shareId: string; url: string }, { shareId: string; url: string }>(
            `${base}/reports/${report.id}/publish`
          );
          const url = localReportShareUrl(result.url, window.location.origin);
          succeeded.add(report.id);
          setReports(current =>
            current.map(row =>
              row.id === report.id ? { ...row, status: "published", share: { id: result.shareId, url } } : row
            )
          );
        } catch (error) {
          failures.push(`${report.className} · ${report.studentName}：${errorMessage(error)}`);
        }
        setBatchResult(`正在发布 ${succeeded.size + failures.length} / ${selectedDrafts.length} 份…`);
      }
      setSelectedReportIds(current => current.filter(id => !succeeded.has(id)));
      setBatchFailures(failures);
      setBatchResult(
        `成功发布 ${succeeded.size} 份，失败 ${failures.length} 份${failures.length ? "；失败报告仍保留选择，可重试。" : "。可选择已发布报告导出图片。"}`
      );
      await load(createUuid()).catch(() => setMessage("批量发布已完成，列表刷新失败，请刷新后核对状态。"));
    } finally {
      publishingInFlight.current = false;
      setPublishingReports(false);
    }
  }
  async function confirmDelete() {
    const target = deleteTarget;
    if (!target) return;
    setDeleteTarget(null);
    if (target.kind === "report") await actOnReport(target.report, "delete");
    else {
      setBusy(true);
      setMessage("");
      try {
        await documentAction(target.document.id, "delete");
      } catch (error) {
        setMessage(errorMessage(error));
      } finally {
        setBusy(false);
      }
    }
  }
  /** 列表正文可能为空或过期；编辑必须读取完整详情，并阻止迟到响应打开错误的报告。 */
  async function openEdit(report: Report, refreshToken?: string) {
    if (loadingReportId) return null;
    setLoadingReportId(report.id);
    setMessage("");
    try {
      const detailRefresh = refreshToken ?? (isV2 ? createUuid() : undefined);
      const full = await request.get<Report, Report>(
        `${base}/reports/${report.id}`,
        detailRefresh ? { params: { refresh: detailRefresh } } : undefined
      );
      if (!full.content) throw new Error("报告正文尚未生成，请稍后重试。");
      setEditing(full);
      setDraftSubjectScopes({});
      setPreviewingDraft(full.status !== "draft");
      setDraft(full.content as ReportContent);
      return full;
    } catch (error) {
      setMessage(errorMessage(error));
      return null;
    } finally {
      setLoadingReportId(null);
    }
  }
  /** 两个固定照片位置独立写入；只合并图片字段和当前位置说明，保留未保存的正文。 */
  async function changeClassroomPhoto(file?: File, slot = 0) {
    if (!editing || busy) return;
    if (file && (!["image/jpeg", "image/png"].includes(file.type) || file.size > 2 * 1024 * 1024)) {
      setMessage("请上传 JPG 或 PNG 课堂照片（每张最大 2MB）");
      return;
    }
    setBusy(true);
    try {
      const url = `${base}/reports/${editing.id}/classroom-photo${slot === 1 ? "?slot=1" : ""}`;
      const form = new FormData();
      if (file) form.append("file", file);
      // FormData 必须保留二进制和浏览器生成的边界，才能经过同源代理到达后端文件拦截器。
      const updated = file
        ? await request.post<Report, Report>(url, form, {
            headers: { "Content-Type": undefined },
            timeout: 120000
          })
        : await request.delete<Report, Report>(url);
      if (activeEditingId.current !== editing.id) return;
      const visuals = updated.content as ReportContent;
      setDraft(current =>
        current
          ? {
              ...current,
              classroomPhoto: visuals.classroomPhoto,
              classroomPhotos: reportClassroomPhotos(visuals),
              classroomPhotoCaptions: [0, 1].map(index =>
                index === slot && !file
                  ? ""
                  : (current.classroomPhotoCaptions?.[index] ?? visuals.classroomPhotoCaptions?.[index] ?? "")
              )
            }
          : current
      );
      setEditing(current => (current?.id === updated.id ? updated : current));
      setMessage(file ? "课堂照片已保存" : "课堂照片已移除");
      await load();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  /** 草稿增科保留原有评价；新增学习条目按稳定 ID 合并，避免覆盖老师未保存的输入。 */
  async function addDraftSubjects() {
    if (!editing || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const updated = await request.post<Report, Report>(`${base}/reports/${editing.id}/course-subjects`, {
        courseSelections: courseSelectionsFromScopes(draftSubjectScopes, documents, editing.termId ?? "", isV2)
      });
      // 请求返回时可能已切换报告，不能把前一份报告的新增学科写入当前草稿。
      if (activeEditingId.current !== updated.id) {
        await load();
        return;
      }
      const incoming = (updated.content as ReportContent).learningContents ?? [];
      setDraft(current =>
        current
          ? {
              ...current,
              reportSubjects: (updated.content as ReportContent).reportSubjects,
              learningContents: [
                ...(current.learningContents ?? []),
                ...incoming.filter(item => !(current.learningContents ?? []).some(old => old.id === item.id))
              ]
            }
          : current
      );
      setEditing(updated);
      setDraftSubjectScopes({});
      setMessage("学科已添加，已有评价和未保存的寄语已保留。新增内容可继续填写评价。");
      await load();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  /** 删除学科同时清理失效课程证据和对应评价，其他学科与未保存文字继续保留。 */
  async function removeDraftSubject(subjectId: string) {
    if (!editing || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await request.delete<
        { report: Report; removedReferences: string[] },
        { report: Report; removedReferences: string[] }
      >(`${base}/reports/${editing.id}/course-subjects/${encodeURIComponent(subjectId)}`);
      const updated = result.report;
      if (activeEditingId.current !== updated.id) {
        await load();
        return;
      }
      const remainingIds = new Set(((updated.content as ReportContent).learningContents ?? []).map(item => item.id));
      const removed = new Set(result.removedReferences);
      // 以服务端返回的删除引用为准清理正文，防止已经删除的课程证据仍出现在未保存草稿中。
      const keepEntry = (item: { sourceRefs: string[] }) => !item.sourceRefs.some(ref => removed.has(ref));
      setDraft(current =>
        current
          ? {
              ...current,
              learningContents: current.learningContents?.filter(item => remainingIds.has(item.id)),
              strengths: current.strengths.filter(keepEntry),
              areasToImprove: current.areasToImprove.filter(keepEntry),
              homeSuggestions: current.homeSuggestions.filter(keepEntry),
              reportSubjects: (updated.content as ReportContent).reportSubjects,
              classroomPerformance: current.classroomPerformance?.filter(
                item => item.subjectId !== subjectId && keepEntry(item)
              )
            }
          : current
      );
      setEditing(updated);
      setMessage("学科及对应学习内容、评价和课程引用条目已删除，其他评价和未保存的寄语已保留。");
      await load();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  /** 普通草稿保存只提交可编辑正文；图片经专用接口保存，服务端仍会覆盖快照派生字段。 */
  async function saveDraft() {
    if (!editing || !draft) return;
    setBusy(true);
    setMessage("");
    try {
      // 课堂照片已单独保存，删除派生图片字段可避免重复发送 Base64 和回写陈旧照片。
      const content = {
        ...draft,
        // v2 清空重点等价于隐藏可选区块，不保留只有空白文字的占位条目。
        ...(isV2 ? { areasToImprove: draft.areasToImprove.filter(entry => entry.text.trim()) } : {})
      };
      delete content.classroomPhoto;
      delete content.classroomPhotos;
      await request.patch(`${base}/reports/${editing.id}/draft`, { content });
      setEditing(null);
      await load();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const feedbackPetPreview = feedbackStudent && (
    <section className="flex min-w-0 flex-col rounded-xl border bg-slate-50 p-3" aria-live="polite">
      <h4 className="mb-2 font-semibold">{feedbackStudent.name}的宠物伙伴</h4>
      <div className="my-auto flex flex-1 flex-col items-center justify-center py-2">
        {selectedPet ? (
          selectedPet.petHistoryStatus === "unavailable" ? (
            <p className="text-sm text-muted-foreground">所选周期结束时的宠物形态尚无历史记录。</p>
          ) : (
            <ReportPetView pet={selectedPet.pet} />
          )
        ) : scorePreviewError ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-destructive">宠物形态预览失败：{scorePreviewError}</p>
            <Button size="sm" variant="outline" onClick={() => setScorePreviewAttempt(value => value + 1)}>
              重试
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">正在读取所选周期的宠物形态…</p>
        )}
      </div>
      {selectedPet && (
        <p className="mt-2 text-xs text-muted-foreground">
          形态记录截至 {new Date(selectedPet.petAsOf).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        报告使用所选周期结束时的历史形态；今天尚未结束时以生成时间为准。 课堂照片可在生成后的草稿中上传。
      </p>
    </section>
  );

  return (
    <div
      ref={scrollRef}
      className={`${mobileReportControls} semester-reports h-full min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain bg-slate-50/80 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-foreground md:bg-background md:p-6 dark:bg-background`}
    >
      <header className="mb-4 flex items-center gap-3 md:mb-5">
        <div className="rounded-2xl border border-indigo-100 bg-white p-2 dark:bg-muted md:border-0 md:bg-transparent md:p-0">
          <CartoonSemesterReportIcon className="h-8 w-8 shrink-0 md:h-9 md:w-9" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">{reportTitle}</h1>
          <p className="mt-1 text-xs leading-5 text-muted-foreground md:text-sm">整理课堂成长，审核后分享给家长</p>
        </div>
      </header>
      <nav
        aria-label={`${reportTitle}导航`}
        className="sticky top-0 z-10 mb-4 grid grid-cols-3 gap-1 rounded-2xl border bg-background/95 p-1 shadow-sm backdrop-blur-md md:hidden"
      >
        {(
          [
            ["courses", isV2 ? "学期与学科" : "课程资料"],
            ["compose", "填写报告"],
            ["reports", "报告列表"]
          ] as const
        ).map(([section, label]) => (
          <button
            key={section}
            type="button"
            aria-pressed={mobileSection === section}
            aria-controls={`${sectionId}-${section}`}
            className={`rounded-xl px-1 py-2 text-sm font-medium transition-colors ${mobileSection === section ? "bg-indigo-600 text-white shadow-sm" : "text-muted-foreground hover:bg-muted"}`}
            onClick={() => showSection(section)}
          >
            {label}
          </button>
        ))}
      </nav>
      {message && (
        <p
          role="status"
          className="mb-4 break-words rounded-xl border bg-background p-3 text-sm leading-6 [overflow-wrap:anywhere]"
        >
          {message}
        </p>
      )}
      {!isV2 &&
        ((uploadState && !uploadState.error) ||
          processingDocuments.length > 0 ||
          reviewDocuments.length > 0 ||
          documentRefreshFailed) && (
          <div
            aria-label="PDF 处理状态"
            role="status"
            className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900"
          >
            {(uploadState && !uploadState.error) || processingDocuments.length > 0 ? (
              <LoaderCircle className="h-5 w-5 shrink-0 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
            )}
            <p className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
              {uploadState &&
                !uploadState.error &&
                `正在上传 PDF：${uploadState.fileName}${uploadState.progress === null ? "。" : uploadState.progress === 100 ? "，等待服务器确认。" : ` · ${uploadState.progress}%。`}`}
              {processingDocuments.length > 0 && `${processingDocuments.length} 份 PDF 正在处理，完成后请核对章节。`}
              {reviewDocuments.length > 0 && ` ${reviewDocuments.length} 份 PDF 已解析，等待确认章节。`}
              {documentRefreshFailed && " 状态刷新失败，已保留当前状态，将自动重试。"}
            </p>
            {documentRefreshFailed ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void load().catch(() => setDocumentRefreshFailed(true))}
              >
                刷新处理状态
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => showSection("courses")}>
                查看课程资料
              </Button>
            )}
          </div>
        )}
      <div className="mb-4 flex min-w-0 items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2 md:hidden dark:border-border dark:bg-muted">
        <p className="min-w-0 break-words text-sm leading-6">
          {term?.name || "未选择学期"}{" "}
          <span className="text-muted-foreground">
            · {subjects.find(subject => subject.id === subjectId)?.name || "未选择学科"}
          </span>
        </p>
        {mobileSection !== "courses" && (
          <button
            type="button"
            className="shrink-0 px-2 text-sm font-medium text-indigo-600"
            onClick={() => showSection("courses")}
          >
            更换
          </button>
        )}
      </div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        {/* Keep panels mounted so changing mobile sections never clears inputs or selection. */}
        <section
          id={`${sectionId}-courses`}
          aria-label={isV2 ? "学期与学科" : "课程资料"}
          className={`${mobileSection === "courses" ? "" : "hidden md:block"} min-w-0 space-y-4 rounded-2xl border bg-background p-4 md:rounded-xl`}
        >
          <div>
            <h2 className="font-semibold">{isV2 ? "学期与学科" : "课程资料"}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {isV2
                ? "选择学期并维护学科，报告中直接勾选所需学科。"
                : "选择学期和学科，可上传课程 PDF，也可在报告中手动填写教学内容。"}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              aria-label="课程学期"
              className="h-9 w-full min-w-0 rounded-md border bg-background px-2"
              value={termId}
              onChange={e => {
                setTermId(e.target.value);
                if (period === "term") changePeriod("term", e.target.value);
              }}
            >
              <option value="">选择学期</option>
              {terms.map(x => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            {!isV2 && (
              <select
                aria-label="课程学科"
                className="h-9 w-full min-w-0 rounded-md border bg-background px-2"
                value={subjectId}
                onChange={e => setSubjectId(e.target.value)}
              >
                <option value="">选择学科</option>
                {subjects.map(x => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <details
            key={terms.length && subjects.length ? "ready" : "empty"}
            data-course-setup
            open={!terms.length || !subjects.length}
            className="group rounded-xl border bg-muted/30 p-3"
          >
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
              新建学期 / 学科
              <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-3 space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  placeholder="学科名称（必填）"
                  value={newSubject}
                  onChange={e => setNewSubject(e.target.value)}
                />
                <Button disabled={busy || !newSubject.trim()} variant="outline" onClick={() => void createSubject()}>
                  <Plus />
                  添加学科
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  placeholder="学期名称（必填）"
                  value={newTermName}
                  onChange={e => setNewTermName(e.target.value)}
                />
                <Input
                  type="date"
                  aria-label="学期开始日期（必填）"
                  value={newTermStart}
                  onChange={e => setNewTermStart(e.target.value)}
                />
                <Input
                  type="date"
                  aria-label="学期结束日期（必填）"
                  value={newTermEnd}
                  onChange={e => setNewTermEnd(e.target.value)}
                />
                <Button
                  disabled={busy || !newTermName.trim() || !newTermStart || !newTermEnd || newTermEnd <= newTermStart}
                  variant="outline"
                  onClick={() => void createTerm()}
                >
                  <Plus />
                  新建学期
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                学科填写名称后点击“添加学科”；学期需同时填写名称、开始日期和结束日期，且结束日期晚于开始日期。
              </p>
            </div>
          </details>
          {term && (
            <p className="text-xs text-muted-foreground">
              当前学期：{term.startDate} 至 {term.endDate}
            </p>
          )}
          {isV2 && subjects.length > 0 && (
            <details className="group rounded-xl border p-3">
              <summary className="min-h-11 cursor-pointer text-sm font-medium">配置学科课堂表现</summary>
              <div className="mt-3 space-y-3">
                <select
                  aria-label="配置课堂表现的学科"
                  className="h-10 w-full min-w-0 rounded-md border bg-background px-2"
                  value={subjectId}
                  disabled={busy}
                  onChange={event => setSubjectId(event.target.value)}
                >
                  {subjects.map(subject => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
                {subjects.find(subject => subject.id === subjectId) && (
                  <SubjectPerformanceConfig
                    key={subjectId}
                    subject={subjects.find(subject => subject.id === subjectId)!}
                    busy={busy}
                    onSave={saveSubjectPerformance}
                  />
                )}
              </div>
            </details>
          )}
          {!isV2 && (
            <>
              <label
                className={`flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 p-4 text-center text-sm leading-6 focus-within:ring-2 focus-within:ring-ring ${busy || !termId || !subjectId ? "opacity-60" : "hover:bg-indigo-50"}`}
              >
                {uploadState && !uploadState.error ? (
                  <LoaderCircle className="h-7 w-7 animate-spin text-indigo-600" aria-hidden="true" />
                ) : (
                  <Upload className="h-6 w-6 text-indigo-500" aria-hidden="true" />
                )}
                {uploadState && !uploadState.error
                  ? "正在上传 PDF…"
                  : !termId
                    ? "请先新建并选择学期，再上传课程 PDF"
                    : !subjectId
                      ? "请先选择学科，再上传课程 PDF"
                      : "选择课程 PDF（最大 30MB）"}
                <span className="text-xs text-muted-foreground">上传后自动解析，核对章节后用于报告</span>
                <input
                  className="sr-only"
                  type="file"
                  accept="application/pdf,.pdf"
                  disabled={busy || !termId || !subjectId}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    e.currentTarget.value = "";
                    void upload(file);
                  }}
                />
              </label>
              {uploadState && (
                <div
                  role={uploadState.error ? "alert" : "status"}
                  className={`space-y-2 rounded-xl border p-4 text-sm ${uploadState.error ? "border-red-200 bg-red-50 text-red-800" : "border-indigo-200 bg-indigo-50 text-indigo-900"}`}
                >
                  <p className="break-words font-semibold [overflow-wrap:anywhere]">{uploadState.fileName}</p>
                  {uploadState.error ? (
                    <p>{uploadState.error} 请重新选择文件上传。</p>
                  ) : (
                    <>
                      <p>
                        {uploadState.progress === 100
                          ? "文件已传输，正在等待服务器确认…"
                          : `正在上传 PDF${uploadState.progress === null ? "…" : ` · ${uploadState.progress}%`}`}
                      </p>
                      <div
                        role="progressbar"
                        aria-label="PDF 上传进度"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={uploadState.progress ?? undefined}
                        className="h-2 overflow-hidden rounded-full bg-indigo-100"
                      >
                        <div
                          className={`h-full rounded-full bg-indigo-600 transition-[width] ${uploadState.progress === null ? "w-1/3 animate-pulse" : ""}`}
                          style={uploadState.progress === null ? undefined : { width: `${uploadState.progress}%` }}
                        />
                      </div>
                      <p className="text-xs">上传期间请保持此页面打开，上传完成后会在后台自动解析。</p>
                    </>
                  )}
                </div>
              )}
              <div className="space-y-2">
                {documents
                  .filter(d => (!termId || d.termId === termId) && (!subjectId || d.subjectId === subjectId))
                  .map(doc => (
                    <div
                      key={doc.id}
                      className={`rounded-xl border p-3 text-sm ${doc.status === "queued" || doc.status === "parsing" ? "border-indigo-200 bg-indigo-50/50" : doc.status === "needs_review" ? "border-emerald-200 bg-emerald-50/40" : "bg-muted/20"}`}
                      aria-busy={doc.status === "queued" || doc.status === "parsing"}
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
                        <div className="flex min-w-0 flex-1 items-start gap-2">
                          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <p className="break-words font-medium leading-6 [overflow-wrap:anywhere]">{doc.fileName}</p>
                            <span
                              className={`mt-1 inline-block rounded-md px-2 py-0.5 text-xs ${doc.status === "failed" ? "bg-red-50 text-red-700" : "bg-indigo-50 text-indigo-700"}`}
                            >
                              {labels[doc.status] ?? doc.status}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 max-md:[&_button]:flex-1 md:shrink-0">
                          {(doc.status === "needs_review" || reviewingDocumentId === doc.id) && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() =>
                                void documentAction(doc.id, "confirm").catch(error => setMessage(errorMessage(error)))
                              }
                            >
                              确认章节
                            </Button>
                          )}
                          {doc.status === "ready" && reviewingDocumentId !== doc.id && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => {
                                setReviewingDocumentId(doc.id);
                                setUnitDrafts(old => ({
                                  ...old,
                                  [doc.id]:
                                    (doc.detectedUnits?.length ?? 0) > (doc.units?.length ?? 0)
                                      ? doc.detectedUnits!.join("\n")
                                      : (doc.units ?? []).join("\n")
                                }));
                              }}
                            >
                              重新核对章节
                            </Button>
                          )}
                          {doc.status === "ready" && reviewingDocumentId === doc.id && (
                            <Button size="sm" variant="ghost" onClick={() => setReviewingDocumentId(null)}>
                              取消
                            </Button>
                          )}
                          {doc.status === "failed" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() =>
                                void documentAction(doc.id, "retry").catch(error => setMessage(errorMessage(error)))
                              }
                            >
                              重试
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="删除课程 PDF"
                            disabled={busy}
                            onClick={() => setDeleteTarget({ kind: "document", document: doc })}
                          >
                            <Trash2 />
                            <span className="md:hidden">删除</span>
                          </Button>
                        </div>
                      </div>
                      {documentStatusHints[doc.status] && (
                        <div
                          role="status"
                          className={`mt-3 flex items-start gap-3 rounded-lg p-3 ${doc.status === "needs_review" ? "bg-emerald-100/60 text-emerald-900" : "bg-indigo-100/60 text-indigo-900"}`}
                        >
                          {doc.status === "needs_review" ? (
                            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                          ) : (
                            <LoaderCircle className="mt-0.5 h-5 w-5 shrink-0 animate-spin" aria-hidden="true" />
                          )}
                          <div>
                            <p className="font-semibold">{documentStatusHints[doc.status]?.title}</p>
                            <p className="mt-1 text-xs leading-6">{documentStatusHints[doc.status]?.description}</p>
                          </div>
                        </div>
                      )}
                      {doc.errorMessage && (
                        <p
                          role="alert"
                          className="mt-3 break-words rounded-lg bg-red-50 p-3 text-sm leading-6 text-red-700 [overflow-wrap:anywhere]"
                        >
                          {doc.errorMessage}
                        </p>
                      )}
                      {(doc.status === "ready" || doc.status === "needs_review") && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          已提取 {doc.pageCount ?? 0} 页、{doc.units?.length ?? 0} 个单元或课时
                          {doc.status === "ready" ? "，可在下方选择课时查看学习内容。" : "，请核对章节并确认。"}
                          {(doc.detectedUnits?.length ?? 0) > (doc.units?.length ?? 0)
                            ? ` 新版识别到 ${doc.detectedUnits?.length} 个章节，请重新核对。`
                            : ""}
                        </p>
                      )}
                      {(doc.status === "needs_review" || reviewingDocumentId === doc.id) && (
                        <textarea
                          className="mt-2 min-h-16 w-full rounded border bg-background p-2 text-xs"
                          aria-label={`${doc.fileName} 课程章节`}
                          value={
                            unitDrafts[doc.id] ??
                            ((doc.detectedUnits?.length ?? 0) > (doc.units?.length ?? 0)
                              ? doc.detectedUnits?.join("\n")
                              : doc.units?.join("\n")) ??
                            ""
                          }
                          onChange={e => setUnitDrafts(old => ({ ...old, [doc.id]: e.target.value }))}
                          placeholder="检查或修正解析出的课程章节，每行一章"
                        />
                      )}
                    </div>
                  ))}
                {!documents.some(
                  d => (!termId || d.termId === termId) && (!subjectId || d.subjectId === subjectId)
                ) && (
                  <p className="py-2 text-center text-sm text-muted-foreground">还没有课程 PDF，上传后会显示在这里。</p>
                )}
              </div>
            </>
          )}
          <Button className="w-full md:hidden" variant="outline" onClick={() => showSection("compose")}>
            下一步：填写报告
          </Button>
        </section>
        <section
          id={`${sectionId}-compose`}
          aria-label="填写报告"
          className={`${mobileSection === "compose" ? "" : "hidden md:block"} min-w-0 space-y-4 rounded-2xl border bg-background p-4 md:rounded-xl`}
        >
          <div>
            <h2 className="font-semibold">填写报告</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {isV2 ? "勾选学生和学科，再填写成长评价和课堂表现。" : "选择学生与授课范围，再填写每位学生的课堂反馈。"}
            </p>
          </div>
          <section className="space-y-3 rounded-xl bg-indigo-50/40 p-3">
            <h3 className="text-sm font-semibold">报告基础信息</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                报告抬头
                <Input
                  maxLength={60}
                  value={reportDetails.institutionName}
                  placeholder="例如：WK课堂成长记录"
                  onChange={event => setReportDetails({ ...reportDetails, institutionName: event.target.value })}
                />
              </label>
              <label className="space-y-1 text-sm">
                课程主题
                <Input
                  maxLength={100}
                  value={reportDetails.courseTheme}
                  placeholder="例如：Animals"
                  onChange={event => setReportDetails({ ...reportDetails, courseTheme: event.target.value })}
                />
              </label>
              <label className="space-y-1 text-sm">
                第几次课（选填）
                <Input
                  type="number"
                  min={1}
                  max={999}
                  step={1}
                  value={reportDetails.lessonNumber ?? ""}
                  placeholder="例如：1"
                  onChange={event =>
                    setReportDetails({
                      ...reportDetails,
                      lessonNumber: event.target.value ? Number(event.target.value) : null
                    })
                  }
                />
              </label>
              <label className="space-y-1 text-sm">
                授课日期
                <Input
                  type="date"
                  min={start}
                  max={end}
                  value={reportDetails.lessonDate || end}
                  onChange={event => setReportDetails({ ...reportDetails, lessonDate: event.target.value })}
                />
              </label>
            </div>
          </section>
          {/* <label className="block space-y-1 text-sm">
            <span>生成方式</span>
            <select
              className="h-9 w-full rounded-md border bg-background px-2"
              value={generationMode}
              onChange={e => setGenerationMode(e.target.value)}
            >
              <option value="template">本地模板（无需 AI）</option>
              <option value="ai">AI 生成（需配置模型服务）</option>
            </select>
          </label> */}
          {generationMode === "template" && (
            <p className="text-xs text-muted-foreground">
              {isV2
                ? "按下方填写的成长评价、各科课堂表现和寄语整理报告，结合综合积分生成可审核草稿。"
                : "按下方填写的掌握评价、课堂表现和寄语整理报告，结合综合积分生成可审核草稿。"}
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              aria-label="报告周期"
              className="h-9 rounded-md border bg-background px-2"
              value={period}
              onChange={e => changePeriod(e.target.value)}
            >
              <option value="week">每周</option>
              <option value="month">每月</option>
              {isV2 && <option value="term">每学期</option>}
            </select>
            {isV2 ? (
              <p className="flex items-center rounded-md border px-3 text-sm">已选 {courseSelections.length} 门学科</p>
            ) : (
              <select
                aria-label="报告学科"
                className="h-9 rounded-md border bg-background px-2"
                value={subjectId}
                onChange={e => setSubjectId(e.target.value)}
              >
                {subjects.map(x => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            )}
            <label className="space-y-1 text-sm">
              周期开始日期
              <Input type="date" aria-label="周期开始日期" value={start} onChange={e => setStart(e.target.value)} />
            </label>
            <label className="space-y-1 text-sm">
              周期结束日期
              <Input type="date" aria-label="周期结束日期" value={end} onChange={e => setEnd(e.target.value)} />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            结束日期可设为未来，生成时使用已有记录；周期须在所选学期范围内。
          </p>
          <ReportStudentPicker students={students} selected={selected} onChange={setSelected} />
          {isV2 ? (
            <SubjectCoursePicker
              subjectsOnly
              subjects={subjects}
              documents={documents}
              termId={termId}
              period={period}
              value={subjectScopes}
              onChange={value => {
                setSubjectScopes(value);
                setMessage("");
              }}
            />
          ) : (
            <>
              <label className="block space-y-1 text-sm">
                教学内容来源
                <select
                  aria-label="教学内容来源"
                  className="h-9 w-full rounded-md border bg-background px-2"
                  value={usesManualCourse ? "manual" : "pdf"}
                  onChange={event => setCourseSource(event.target.value as "manual" | "pdf")}
                >
                  <option value="manual">手动输入教学内容</option>
                  <option value="pdf">课程 PDF 授课范围</option>
                </select>
              </label>
              {usesManualCourse && (
                <p className="text-xs text-muted-foreground">
                  无需上传课程资料。请填写实际教学内容，每行一项，生成后可逐项评价掌握情况。
                </p>
              )}
              <textarea
                aria-label="教学内容或授课范围"
                className="min-h-16 w-full rounded-md border bg-background p-2 text-sm"
                placeholder={
                  usesManualCourse
                    ? "手动输入教学内容（每行一项，至少2个字符）"
                    : period === "term"
                      ? "学期报告默认覆盖整份已确认课程资料"
                      : "本周期已授课范围（可选单元、课时，也可填第3页或第3-5页）"
                }
                value={courseScope}
                maxLength={1000}
                onChange={e => {
                  setCourseSource(usesManualCourse ? "manual" : "pdf");
                  setCourseScope(e.target.value);
                  setMessage("");
                }}
              />
              {!usesManualCourse && period !== "term" && availableUnits.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">从课程 PDF 选择单元、课时或页码，可选择多个：</p>
                  {/* <p className="text-xs text-muted-foreground">
                页码可手动填写范围，例如“第101-120页”；同学科有多份 PDF 时，请核对下方的命中页预览。
              </p> */}
                  <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto sm:flex sm:max-h-32 sm:flex-wrap sm:gap-1">
                    {availableUnits.map(unit => (
                      <Button
                        key={unit}
                        size="sm"
                        variant={
                          courseScope
                            .split(/[，、;；\n]+/)
                            .map(value => value.trim())
                            .includes(unit)
                            ? "default"
                            : "outline"
                        }
                        onClick={() => {
                          setMessage("");
                          setCourseScope(current => {
                            const scopes = current
                              .split(/[，、;；\n]+/)
                              .map(value => value.trim())
                              .filter(Boolean);
                            if (scopes.includes(unit)) return scopes.filter(scope => scope !== unit).join("、");
                            // Choosing a lesson narrows an already selected whole unit.
                            const parent = /^(Unit\d+) 第\d+课$/.exec(unit)?.[1];
                            const next = parent
                              ? scopes.filter(scope => scope !== parent)
                              : scopes.filter(scope => !scope.startsWith(`${unit} 第`));
                            return [...next, unit].join("、");
                          });
                        }}
                      >
                        {unit}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {!isV2 && scopePreview && (
            <div className="rounded-md border p-2 text-xs" aria-live="polite">
              {scopePreview.totalPages > 0 ? (
                scopePreview.documents.map(document => (
                  <p key={document.id}>
                    {document.fileName} · 命中 PDF 第 {document.pages.join("、")} 页
                  </p>
                ))
              ) : (
                <p>
                  {usesManualCourse
                    ? "教学内容来自教师手动填写，可填写掌握情况后生成报告。"
                    : "未匹配到 PDF 页面，请选择上方单元、课时或页码，也可以填写“第3页”或“第3-5页”。"}
                </p>
              )}
            </div>
          )}
          {!isV2 && scopePreview && scopePreview.learningContents?.length > 0 && !selectedStudents.length && (
            <section className="space-y-3 rounded-xl border bg-indigo-50/30 p-3" aria-live="polite">
              <h3 className="text-sm font-semibold">已选学习内容 · {scopePreview.totalLearningContents} 项</h3>
              <p className="text-xs text-muted-foreground">
                以下内容来自课程 PDF 或老师填写的教学内容。选择学生后，即可在下方逐项填写掌握情况。
              </p>
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {scopePreview.learningContents.map(item => (
                  <div key={item.id} className="rounded-lg border bg-background p-3">
                    <p className="mb-1 text-xs font-semibold text-indigo-600">{learningSectionTitle(item.section)}</p>
                    <p className="whitespace-pre-wrap text-sm leading-6">{item.text}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.sourceRefs
                        .map(ref => {
                          const match = /^course:(.+):p(\d+)$/.exec(ref);
                          const document = scopePreview.documents.find(doc => doc.id === match?.[1]);
                          return ref.startsWith("teacher-course:")
                            ? "教师填写的教学内容"
                            : document
                              ? `${document.fileName} 第 ${match?.[2]} 页`
                              : "课程资料";
                        })
                        .join("；")}
                    </p>
                  </div>
                ))}
              </div>
              {scopePreview.totalLearningContents > 500 && (
                <p className="text-xs text-destructive">内容超过 500 项，请缩小授课范围后生成。</p>
              )}
            </section>
          )}
          {!isV2 && scopePreview && scopePreview.totalPages > 0 && !scopePreview.learningContents?.length && (
            <p className="text-xs text-amber-700">
              已匹配页面，但未提取到该单元的学习内容；请检查 PDF 的表格或章节格式。
            </p>
          )}
          {scopePreviewError && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-destructive">{scopePreviewError}</p>
              <Button size="sm" variant="outline" onClick={() => setScopePreviewAttempt(current => current + 1)}>
                {isV2 ? "重新确认学科" : "重新加载学习内容"}
              </Button>
            </div>
          )}
          {!scopePreview && !scopePreviewError && (period === "term" || courseScope.trim().length >= 2) && (
            <p className="text-xs text-muted-foreground">{isV2 ? "正在确认已选学科…" : "正在加载所选学习内容…"}</p>
          )}
          {feedbackStudent ? (
            <section className="space-y-3">
              <h3 className="font-semibold">填写学生课堂反馈</h3>
              <p className="text-xs text-muted-foreground">
                已选 {selectedStudents.length} 位学生，点击姓名分别填写；留空项可在生成后的草稿中补充。
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="切换学生反馈">
                {selectedStudents.map(student => (
                  <Button
                    key={student.id}
                    className="shrink-0"
                    size="sm"
                    variant={feedbackStudent.id === student.id ? "default" : "outline"}
                    onClick={() => setFeedbackStudentId(student.id)}
                  >
                    {student.name} · {student.className}
                  </Button>
                ))}
              </div>
              {!isV2 && feedbackPetPreview}
              <StudentFeedbackForm
                key={feedbackKey}
                student={feedbackStudent}
                subject={
                  isV2
                    ? subjects
                        .filter(subject => Object.hasOwn(subjectScopes, subject.id))
                        .map(subject => subject.name)
                        .join("、")
                    : (subjects.find(subject => subject.id === subjectId)?.name ?? "")
                }
                learningContents={scopePreview?.learningContents ?? []}
                subjects={
                  isV2
                    ? subjects
                        .filter(subject => Object.hasOwn(subjectScopes, subject.id))
                        .map(subject => ({
                          subjectId: subject.id,
                          name: subject.name,
                          performanceConfig: subject.performanceConfig
                        }))
                    : undefined
                }
                companion={
                  isV2 ? (
                    <div aria-label="宠物伙伴与阶段积分" className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                      {feedbackPetPreview}
                      <section
                        className="flex min-w-0 flex-col rounded-xl border border-amber-100 bg-amber-50/70 p-3"
                        aria-live="polite"
                      >
                        <h4 className="mb-2 font-semibold">本期最值肯定</h4>
                        <div className="my-auto flex flex-1 flex-col justify-center">
                          {scorePreviewError ? (
                            <p className="text-sm text-destructive">加分细项预览失败：{scorePreviewError}</p>
                          ) : selectedScore ? (
                            <PeriodScoreChart details={selectedScore} />
                          ) : (
                            <p className="text-sm text-muted-foreground">正在读取所选周期的加分细项…</p>
                          )}
                        </div>
                      </section>
                    </div>
                  ) : undefined
                }
                reserveNextFocus={isV2}
                value={studentFeedback[feedbackKey] ?? emptyStudentFeedback()}
                onChange={patch =>
                  setStudentFeedback(current => ({
                    ...current,
                    [feedbackKey]: { ...(current[feedbackKey] ?? emptyStudentFeedback()), ...patch }
                  }))
                }
              />
            </section>
          ) : (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              {isV2
                ? "请先选择学生和学科，再填写成长评价、课堂表现和老师寄语。"
                : "请先选择学生，再填写掌握评价、课堂表现和老师寄语。"}
            </p>
          )}
          <label className="block space-y-1 text-sm">
            补充关键词（选填）
            <Input
              placeholder="例如：阅读表达、计算习惯"
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
            />
          </label>
          <label className="block space-y-1 text-sm">
            本周期共同观察（选填，适用于全部已选学生）
            <textarea
              className="min-h-20 w-full rounded-md border bg-background p-2 text-sm"
              placeholder="只填写适用于所选学生的共同课堂观察；个别反馈请在上方分别填写。"
              value={observation}
              onChange={e => setObservation(e.target.value)}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            积分依据为周期综合评价记录，不代表所选学科的掌握程度。
            {isV2
              ? "勾选学科即可填写反馈，无需课程资料。"
              : usesManualCourse
                ? "教学内容由教师手动填写，无需上传课程资料。"
                : "课程资料须先解析并确认，也可切换为手动输入。"}
          </p>
          {generationBlockedReason && (
            <p
              id={`${sectionId}-generation-hint`}
              aria-label="生成报告提示"
              aria-live="polite"
              className="text-sm text-amber-700"
            >
              {generationBlockedReason}
            </p>
          )}
          <Button
            disabled={Boolean(generationBlockedReason)}
            aria-describedby={generationBlockedReason ? `${sectionId}-generation-hint` : undefined}
            className="w-full sm:w-auto"
            onClick={() => void generate()}
          >
            <RefreshCw />
            生成 {selectedStudents.length} 份报告
          </Button>
        </section>
      </div>
      <section
        id={`${sectionId}-reports`}
        aria-label="报告列表"
        className={`${mobileSection === "reports" ? "" : "hidden md:block"} min-w-0 rounded-2xl border bg-background p-4 md:mt-6 md:rounded-xl`}
      >
        <div className="mb-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">报告与流程</h2>
            <Button
              variant="outline"
              size="sm"
              disabled={publishingReports || !!actingReportId || loadingReports || invalidReportDateRange}
              onClick={() => void load(createUuid()).catch(error => setMessage(errorMessage(error)))}
            >
              刷新报告
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <Input
              aria-label="搜索报告"
              placeholder="搜索学生姓名、班级或学科"
              maxLength={100}
              value={reportSearch}
              disabled={publishingReports}
              onChange={event => setReportSearch(event.target.value)}
            />
            <select
              aria-label="筛选报告状态"
              className="min-h-10 rounded-md border bg-background px-3 text-sm"
              value={reportStatus}
              disabled={publishingReports}
              onChange={event => setReportStatus(event.target.value)}
            >
              <option value="">全部状态</option>
              {["draft", "published", "queued", "generating", "failed"].map(status => (
                <option key={status} value={status}>
                  {labels[status]}
                </option>
              ))}
            </select>
            <select
              aria-label="筛选报告周期"
              className="min-h-10 rounded-md border bg-background px-3 text-sm"
              value={reportPeriod}
              disabled={publishingReports}
              onChange={event => setReportPeriod(event.target.value)}
            >
              <option value="">全部周期</option>
              {["week", "month", "term"].map(period => (
                <option key={period} value={period}>
                  {labels[period]}
                </option>
              ))}
            </select>
          </div>
          <fieldset className="space-y-2 rounded-xl border p-3">
            <legend className="px-1 text-sm font-medium">报告时间筛选</legend>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
              <label className="min-w-0 space-y-1 text-sm">
                开始日期
                <Input
                  type="date"
                  aria-label="筛选开始日期"
                  value={reportStartDate}
                  max={reportEndDate || undefined}
                  disabled={publishingReports}
                  onChange={event => setReportStartDate(event.target.value)}
                />
              </label>
              <label className="min-w-0 space-y-1 text-sm">
                结束日期
                <Input
                  type="date"
                  aria-label="筛选结束日期"
                  value={reportEndDate}
                  min={reportStartDate || undefined}
                  disabled={publishingReports}
                  onChange={event => setReportEndDate(event.target.value)}
                />
              </label>
              <Button
                variant="outline"
                disabled={publishingReports || (!reportStartDate && !reportEndDate)}
                onClick={() => {
                  setReportStartDate("");
                  setReportEndDate("");
                }}
              >
                清除时间筛选
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              按报告覆盖时间（北京时间）筛选，与所选日期有交集即显示；留空表示不限。
            </p>
            {invalidReportDateRange && (
              <p role="alert" className="text-sm text-red-700">
                开始日期不能晚于结束日期，请调整后再筛选。
              </p>
            )}
          </fieldset>
          <div aria-label="报告汇总" className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-lg bg-muted px-3 py-2">
              已加载 {visibleReports.length} 份{hasMoreReports ? "，下方可继续加载" : ""}
            </span>
            {["draft", "published", "queued", "generating", "failed"].map(status => (
              <span key={status} className="rounded-lg bg-muted/50 px-3 py-2">
                {labels[status]} {visibleReports.filter(report => report.status === status).length}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-indigo-50/50 p-3 dark:bg-muted/40">
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                ref={selectionRef}
                type="checkbox"
                aria-label="全选当前结果中的可操作报告"
                className="h-4 w-4"
                checked={allReportsSelected}
                disabled={publishingReports || !selectableReports.length}
                onChange={() =>
                  setSelectedReportIds(allReportsSelected ? [] : selectableReports.map(report => report.id))
                }
              />
              全选当前结果
            </label>
            <span className="text-sm">已选 {selectedReports.length} 份</span>
            <Button
              variant="ghost"
              size="sm"
              disabled={publishingReports || !selectedReports.length}
              onClick={() => setSelectedReportIds([])}
            >
              清空选择
            </Button>
            <Button
              className="min-h-11"
              disabled={publishingReports || !!actingReportId || !selectedDrafts.length}
              onClick={() => setConfirmBatchPublish(true)}
            >
              {publishingReports ? "正在批量发布…" : `批量发布（${selectedDrafts.length}）`}
            </Button>
            <Button
              className="min-h-11"
              variant="outline"
              disabled={
                publishingReports ||
                !!actingReportId ||
                !selectedReports.length ||
                selectedReports.some(report => report.status !== "published")
              }
              onClick={() => setExportReports(selectedReports)}
            >
              <Download />
              导出所选图片（{selectedReports.length}）
            </Button>
            <p className="w-full text-xs text-muted-foreground">
              汇总和全选针对当前筛选中已加载的报告；切换筛选会清空选择。批量发布只处理草稿；导出前请先发布所选草稿，每份报告生成一张
              PNG，统一下载 ZIP。
            </p>
            {batchResult && (
              <p role="status" className="w-full break-words text-sm">
                {batchResult}
              </p>
            )}
            {batchFailures.length > 0 && (
              <ul role="alert" className="w-full space-y-1 break-words text-sm text-red-700">
                {batchFailures.map((failure, index) => (
                  <li key={index}>{failure}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="space-y-2">
          {visibleReports.map(report => (
            <article key={report.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 p-3">
              <label className="flex min-h-11 min-w-11 items-center justify-center">
                <input
                  type="checkbox"
                  aria-label={`选择 ${report.className} ${report.studentName} 的${labels[report.period] ?? "报告"}`}
                  data-report-id={report.id}
                  className="h-4 w-4"
                  disabled={publishingReports || !["draft", "published"].includes(report.status)}
                  checked={selectedReports.some(row => row.id === report.id)}
                  onChange={event =>
                    setSelectedReportIds(current =>
                      event.target.checked ? [...current, report.id] : current.filter(id => id !== report.id)
                    )
                  }
                />
              </label>
              <div className="min-w-0 flex-1 break-words">
                <p className="font-medium">
                  {report.className} · {report.studentName} · {labels[report.period] ?? report.period}
                </p>
                <p className="text-xs text-muted-foreground">
                  {report.subjectName}
                  {report.start
                    ? ` · ${new Date(report.start).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}`
                    : ""}
                  {report.end
                    ? ` 至 ${new Date(new Date(report.end).getTime() - 1).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}`
                    : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {labels[report.status] ?? report.status}
                  {" · 编辑时间："}
                  <ReportEditTime value={report.updatedAt} />
                  {/* {report.generationMode === "template"
                    ? " · 本地模板"
                    : report.generationMode === "ai"
                      ? " · AI 生成"
                      : ""} */}
                  {report.errorMessage ? ` · ${report.errorMessage}` : ""}
                </p>
              </div>
              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
                {(report.status === "draft" || report.status === "published") && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!loadingReportId || !!actingReportId || publishingReports}
                    onClick={() => void openEdit(report)}
                  >
                    {report.status === "draft" ? "预览 / 编辑" : "查看流程"}
                  </Button>
                )}
                {report.status === "draft" && (
                  <Button
                    size="sm"
                    disabled={!!actingReportId || publishingReports}
                    onClick={() => void actOnReport(report, "publish")}
                  >
                    发布并复制链接
                  </Button>
                )}
                {report.status === "failed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!actingReportId || publishingReports}
                    onClick={() => void actOnReport(report, "retry")}
                  >
                    重试
                  </Button>
                )}
                {report.status === "published" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!actingReportId || publishingReports}
                    onClick={() => void actOnReport(report, "copy")}
                  >
                    <Clipboard />
                    复制链接
                  </Button>
                )}
                {report.status === "published" && report.share && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!actingReportId || !!loadingReportId || publishingReports}
                    onClick={() => setImageReport({ studentName: report.studentName, url: report.share!.url })}
                  >
                    <ImageIcon />
                    生成报告图片
                  </Button>
                )}
                {report.status === "published" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!actingReportId || !!loadingReportId || publishingReports}
                    onClick={() => void actOnReport(report, "revoke")}
                  >
                    {report.share ? "撤销链接并编辑" : "重新编辑"}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="删除报告"
                  disabled={!!actingReportId || publishingReports}
                  onClick={() => setDeleteTarget({ kind: "report", report })}
                >
                  <Trash2 />
                  <span className="sm:hidden">删除报告</span>
                </Button>
              </div>
              {report.status === "published" && report.share && (
                <label className="w-full space-y-1 text-xs text-muted-foreground">
                  家长链接（无需登录，点击输入框可选中复制）
                  <Input
                    aria-label={`${report.studentName} 的家长链接`}
                    readOnly
                    value={report.share.url}
                    onClick={event => event.currentTarget.select()}
                  />
                </label>
              )}
            </article>
          ))}
          {visibleReports.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {reportSearch || reportStatus || reportPeriod || reportStartDate || reportEndDate
                ? "没有符合条件的报告，请调整搜索或筛选。"
                : "还没有报告。"}
            </p>
          )}
          {hasMoreReports && (
            <Button
              className="mt-3 w-full"
              variant="outline"
              disabled={loadingReports || publishingReports || reportSearchQuery !== debouncedReportSearch}
              onClick={() => void loadMoreReports()}
            >
              {loadingReports ? "正在加载…" : "加载更多报告"}
            </Button>
          )}
        </div>
      </section>
      <ConfirmDialog
        open={confirmBatchPublish}
        title={`发布所选 ${selectedDrafts.length} 份草稿`}
        description="请确认已经核对所选报告的内容。发布后会为每份报告生成家长访问链接，失败的报告保留选择以便重试。"
        confirmText="确认发布"
        onCancel={() => setConfirmBatchPublish(false)}
        onConfirm={() => void publishSelectedReports()}
      />
      {exportReports && <BatchReportImageDialog reports={exportReports} onClose={() => setExportReports(null)} />}
      {imageReport && (
        <ReportImageDialog
          studentName={imageReport.studentName}
          shareUrl={imageReport.url}
          onClose={() => setImageReport(null)}
        />
      )}
      {editing &&
        draft &&
        createPortal(
          <div
            className={`${mobileReportControls} fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 sm:p-4`}
            // Portal 事件仍沿 React 组件树冒泡；阻止编辑窗操作触发桌面窗口重新置顶。
            onMouseDown={event => event.stopPropagation()}
            onClick={event => {
              if (event.target === event.currentTarget) setEditing(null);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="report-dialog-title"
              className="flex h-dvh max-h-dvh w-full min-w-0 max-w-3xl flex-col overflow-hidden bg-background shadow-xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-xl"
            >
              <div className="flex shrink-0 items-center justify-between gap-3 border-b px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5">
                <h2 id="report-dialog-title" className="min-w-0 break-words text-base font-semibold sm:text-lg">
                  {editing.studentName} · {editing.status === "draft" ? "报告草稿" : "报告内容与流程"}
                </h2>
                <Button
                  ref={closeButtonRef}
                  size="icon"
                  variant="ghost"
                  aria-label="关闭报告窗口"
                  onClick={() => setEditing(null)}
                >
                  <X />
                </Button>
              </div>
              <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain p-3 sm:p-5">
                <ReportHistory<Report>
                  key={editing.id}
                  reportId={editing.id}
                  status={editing.status}
                  refreshKey={editing}
                  disabled={busy}
                  onWorkingChange={setBusy}
                  onRestored={updated => {
                    if (activeEditingId.current !== updated.id) return;
                    setEditing(updated);
                    setDraft(updated.content as ReportContent);
                    setDraftSubjectScopes({});
                    setPreviewingDraft(false);
                    setMessage("历史版本已恢复为草稿，可继续编辑；分享链接已失效。");
                    void load().catch(() => setMessage("历史版本已恢复，报告列表刷新失败，请重新加载。"));
                  }}
                />
                {message && (
                  <p className="rounded-md border p-3 text-sm" role="status">
                    {message}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  <Button
                    size="sm"
                    variant={previewingDraft ? "default" : "outline"}
                    onClick={() => setPreviewingDraft(true)}
                  >
                    查看报告模板
                  </Button>
                  {editing.status === "draft" && (
                    <Button
                      size="sm"
                      variant={!previewingDraft ? "default" : "outline"}
                      onClick={() => setPreviewingDraft(false)}
                    >
                      填写评价 / 编辑
                    </Button>
                  )}
                </div>
                {isV2 && editing.status === "draft" && (
                  <section className="space-y-3 rounded-xl border p-4">
                    <h3 className="font-semibold">调整报告学科</h3>
                    <p className="text-xs text-muted-foreground">
                      删除会立即保存，并移除该学科的学习内容、评价及引用该课程的条目。报告至少保留一门学科。
                    </p>
                    <div className="space-y-2">
                      {(editing.courseSelections ?? []).map(selection => {
                        const name =
                          subjects.find(subject => subject.id === selection.subjectId)?.name ?? selection.subjectId;
                        return (
                          <div
                            key={selection.subjectId}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2"
                          >
                            <span className="min-w-0 break-words text-sm">{name}</span>
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label={`删除${name}学科`}
                              disabled={busy || (editing.courseSelections ?? []).length <= 1}
                              onClick={() => void removeDraftSubject(selection.subjectId)}
                            >
                              <Trash2 /> 删除学科
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                    <h4 className="text-sm font-semibold">添加未选学科</h4>
                    <p className="text-xs text-muted-foreground">
                      补充当前报告未包含的学科，保留已有评价；新增学习内容默认为待评价。
                    </p>
                    {availableDraftSubjects.length ? (
                      <SubjectCoursePicker
                        subjectsOnly
                        subjects={availableDraftSubjects}
                        documents={documents}
                        termId={editing.termId ?? ""}
                        period={editing.period}
                        value={draftSubjectScopes}
                        onChange={setDraftSubjectScopes}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">所有学科均已添加到当前报告。</p>
                    )}
                    <Button
                      disabled={
                        busy ||
                        !Object.keys(draftSubjectScopes).length ||
                        courseSelectionsFromScopes(draftSubjectScopes, documents, editing.termId ?? "", isV2).some(
                          selection =>
                            selection.manualContent !== undefined
                              ? selection.manualContent.trim().length > 0 && selection.manualContent.trim().length < 2
                              : editing.period !== "term" && selection.courseScope.trim().length < 2
                        )
                      }
                      onClick={() => void addDraftSubjects()}
                    >
                      <Plus /> 添加到当前报告
                    </Button>
                  </section>
                )}
                {editing.status === "draft" && (
                  <section className="space-y-3 rounded-xl border-2 border-indigo-200 bg-indigo-50/60 p-4">
                    <h3 className="font-semibold">课堂照片（最多两张）</h3>
                    <p className="text-xs text-muted-foreground">
                      照片显示在报告顶部、班级名称下方。支持 JPG / PNG，每张最大 2MB，最多两张。 照片说明最多 10
                      个字，填写后点击“保存草稿”。
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {reportClassroomPhotos(draft).map((photo, slot) => (
                        <section key={slot} className="min-w-0 space-y-3 rounded-xl border bg-background p-3">
                          <h4 className="text-sm font-semibold">照片 {slot + 1}</h4>
                          {photo && (
                            <img
                              src={photo}
                              alt={
                                slot === 0
                                  ? `${editing.studentName}的课堂照片`
                                  : `${editing.studentName}的第二张课堂照片`
                              }
                              className="max-h-48 w-full rounded-lg object-contain"
                            />
                          )}
                          <input
                            ref={element => {
                              classroomPhotoInputRefs.current[slot] = element;
                            }}
                            className="hidden"
                            aria-label={slot === 0 ? "上传课堂照片" : "上传第二张课堂照片"}
                            type="file"
                            accept="image/jpeg,image/png"
                            disabled={busy}
                            onChange={event => {
                              const file = event.target.files?.[0];
                              if (file) void changeClassroomPhoto(file, slot);
                              event.target.value = "";
                            }}
                          />
                          <Button
                            size="lg"
                            className="min-h-12 w-full bg-indigo-600 text-white hover:bg-indigo-700"
                            disabled={busy}
                            onClick={() => classroomPhotoInputRefs.current[slot]?.click()}
                          >
                            <Upload className="h-5 w-5" />
                            {busy
                              ? "处理中…"
                              : slot === 0
                                ? photo
                                  ? "更换课堂照片"
                                  : "上传课堂照片"
                                : photo
                                  ? "更换第二张课堂照片"
                                  : "上传第二张课堂照片"}
                          </Button>
                          {photo && (
                            <label className="block space-y-1 text-sm">
                              照片说明（最多 10 个字）
                              <Input
                                aria-label={`照片 ${slot + 1}说明`}
                                value={draft.classroomPhotoCaptions?.[slot] ?? ""}
                                disabled={busy}
                                placeholder="例如：课堂小组合作"
                                onChange={event => {
                                  const caption = Array.from(event.target.value).slice(0, 10).join("");
                                  setDraft(current => {
                                    if (!current) return current;
                                    const captions = [
                                      current.classroomPhotoCaptions?.[0] ?? "",
                                      current.classroomPhotoCaptions?.[1] ?? ""
                                    ];
                                    captions[slot] = caption;
                                    return { ...current, classroomPhotoCaptions: captions };
                                  });
                                }}
                              />
                              <span className="text-xs text-muted-foreground">
                                {Array.from(draft.classroomPhotoCaptions?.[slot] ?? "").length}/10
                              </span>
                            </label>
                          )}
                          {photo && (
                            <Button
                              disabled={busy}
                              variant="outline"
                              onClick={() => void changeClassroomPhoto(undefined, slot)}
                            >
                              {slot === 0 ? "移除课堂照片" : "移除第二张课堂照片"}
                            </Button>
                          )}
                        </section>
                      ))}
                    </div>
                  </section>
                )}
                {scoreRefreshError && (
                  <p role="status" className="text-sm text-amber-700">
                    {scoreRefreshError}
                  </p>
                )}
                {previewingDraft ? (
                  <LearningReportView
                    report={{
                      studentName: editing.studentName,
                      className: editing.className,
                      subject: isV2
                        ? (editing.subjectName ?? "已选课程")
                        : (subjects.find(subject => subject.id === editing.subjectId)?.name ?? ""),
                      term: terms.find(term => term.id === editing.termId)?.name ?? "",
                      period: editing.period,
                      start: editing.start,
                      end: editing.end,
                      courseScope: editing.courseScope,
                      content: draft
                    }}
                  />
                ) : (
                  <>
                    <p className="mb-3 text-xs text-muted-foreground">检查事实表述与每条建议的引用。</p>
                    {!isV2 && (
                      <section className="space-y-3">
                        <h3 className="font-semibold">
                          {editingPeriodTitle}学习内容
                          {!draft.learningContents?.length || draft.learningContents.some(showsLearningMastery)
                            ? "与掌握"
                            : ""}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {draft.learningContents?.some(showsLearningMastery)
                            ? "PDF 学习内容的掌握情况请依据实际课堂观察填写；手填内容只展示教学记录。"
                            : "手填内容只展示教学记录，可直接修改文字。"}
                        </p>
                        {(draft.learningContents ?? []).map((item, index) => (
                          <div key={item.id} className="space-y-2 rounded-lg border p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-indigo-600">
                                {learningSectionTitle(item.section)}
                              </p>
                              {showsLearningMastery(item) && (
                                <select
                                  aria-label={`${learningSectionTitle(item.section)} 学习内容 ${index + 1} 掌握情况`}
                                  className="h-9 rounded-md border bg-background px-2 text-sm"
                                  value={item.mastery}
                                  onChange={event =>
                                    setDraft({
                                      ...draft,
                                      learningContents: draft.learningContents?.map((entry, i) =>
                                        i === index
                                          ? { ...entry, mastery: event.target.value as LearningContent["mastery"] }
                                          : entry
                                      )
                                    })
                                  }
                                >
                                  {Object.entries(masteryLabels).map(([value, label]) => (
                                    <option key={value} value={value}>
                                      {label}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                            <textarea
                              className="min-h-20 w-full rounded-md border bg-background p-2 text-sm"
                              value={item.text}
                              maxLength={1500}
                              onChange={event =>
                                setDraft({
                                  ...draft,
                                  learningContents: draft.learningContents?.map((entry, i) =>
                                    i === index ? { ...entry, text: event.target.value } : entry
                                  )
                                })
                              }
                            />
                          </div>
                        ))}
                        {!draft.learningContents?.length && (
                          <p className="text-sm text-muted-foreground">暂无逐项内容，请重新选择授课范围生成。</p>
                        )}
                      </section>
                    )}
                    {isV2 && (
                      <GrowthAssessmentFields
                        studentName={editing.studentName}
                        value={draft.growthAssessment}
                        onChange={growthAssessment => setDraft({ ...draft, growthAssessment })}
                      />
                    )}
                    <section className="space-y-3">
                      <h3 className="font-semibold">{editingPeriodTitle}的课堂表现</h3>
                      <p className="text-xs text-muted-foreground">
                        仅填写实际观察，如“基本完成”“能说词”“引导参与”；留空的项目不会展示。
                      </p>
                      <ClassroomPerformanceFields
                        subjects={
                          isV2
                            ? (
                                draft.reportSubjects ??
                                (editing.courseSelections ?? []).map(selection => ({
                                  subjectId: selection.subjectId,
                                  name: subjects.find(subject => subject.id === selection.subjectId)?.name ?? "已选学科"
                                }))
                              ).map(subject => ({
                                ...subject,
                                performanceConfig: subjects.find(current => current.id === subject.subjectId)
                                  ?.performanceConfig
                              }))
                            : undefined
                        }
                        subject={subjects.find(subject => subject.id === editing.subjectId)?.name ?? ""}
                        value={performanceRatings(draft.classroomPerformance ?? [])}
                        onChange={ratings =>
                          setDraft({
                            ...draft,
                            classroomPerformance: performanceEntries(ratings, draft.classroomPerformance ?? [])
                          })
                        }
                      />
                    </section>
                    <label className="block space-y-1 text-sm font-medium">
                      老师想对你说
                      <textarea
                        className="min-h-20 w-full rounded-md border bg-background p-3 font-normal"
                        aria-label="老师想对你说"
                        value={draft.summary}
                        readOnly={editing.status !== "draft"}
                        onChange={e => setDraft({ ...draft, summary: e.target.value })}
                      />
                    </label>
                    {(
                      [
                        [`本期最值得肯定`, "strengths"],
                        ["下一步重点", "areasToImprove"],
                        ["回家可以这样练", "homeSuggestions"]
                      ] as const
                    )
                      .filter(([, key]) => !isV2 || key === "areasToImprove")
                      .map(([title, key]) => (
                        <section key={key} className="space-y-2">
                          <h3 className="text-sm font-semibold">{title}</h3>
                          {draft[key].map((entry, index) => (
                            <div key={index} className="rounded-md border p-3">
                              <textarea
                                className="min-h-16 w-full bg-background text-sm"
                                value={entry.text}
                                readOnly={editing.status !== "draft"}
                                onChange={e =>
                                  setDraft({
                                    ...draft,
                                    [key]: draft[key].map((item, i) =>
                                      i === index ? { ...item, text: e.target.value } : item
                                    )
                                  })
                                }
                              />
                              <div className="mt-2 flex items-center justify-between gap-2">
                                {/* <p className="text-xs text-muted-foreground">
                                依据：{entry.sourceRefs.map(sourceLabel).join("、")}
                              </p> */}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    setDraft({ ...draft, [key]: draft[key].filter((_, i) => i !== index) })
                                  }
                                >
                                  移除此项
                                </Button>
                              </div>
                            </div>
                          ))}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setDraft({
                                ...draft,
                                [key]: [...draft[key], { text: "", sourceRefs: ["teacher-review"] }]
                              })
                            }
                            disabled={draft[key].length >= 8}
                          >
                            添加教师评价
                          </Button>
                        </section>
                      ))}
                  </>
                )}
              </div>
              <div className="flex shrink-0 justify-end gap-2 border-t bg-background px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 [&>button]:flex-1 sm:[&>button]:flex-none">
                <Button variant="outline" onClick={() => setEditing(null)}>
                  关闭
                </Button>
                {editing.status === "draft" && (
                  <Button disabled={busy} onClick={() => void saveDraft()}>
                    保存草稿
                  </Button>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
      {deleteTarget &&
        createPortal(
          <ConfirmDialog
            open
            title={deleteTarget.kind === "report" ? "删除报告" : "删除课程 PDF"}
            description={
              deleteTarget.kind === "report"
                ? `确定删除 ${deleteTarget.report.className} · ${deleteTarget.report.studentName} 的${labels[deleteTarget.report.period] ?? "报告"}吗？删除后不可恢复，家长链接将立即失效。`
                : `确定删除课程 PDF「${deleteTarget.document.fileName}」吗？删除后不可恢复，已生成的报告仍需单独删除。`
            }
            confirmText="删除"
            onCancel={() => setDeleteTarget(null)}
            onConfirm={() => void confirmDelete()}
          />,
          document.body
        )}
    </div>
  );
}
