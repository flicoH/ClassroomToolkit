"use client";

import { CourseAttendance, type CourseAttendanceStatus } from "@/components/semester-reports/CourseAttendance";
import type { GrowthAssessment } from "@/components/semester-reports/GrowthAssessmentFields";
import { ReportPetView } from "@/components/semester-reports/ReportPetView";
import { PeriodScoreChart } from "@/components/semester-reports/PeriodScoreChart";
import { V2ClassroomPerformance } from "@/components/semester-reports-v2/V2ClassroomPerformance";
import type { ScorePreview } from "@/components/semester-reports-v2/SemesterReportsV2View";
import { ReportWizardSteps, type ReportWizardStep } from "@/components/semester-reports-v2/ReportStudioControls";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import request from "@/lib/request";
import { createUuid } from "@/lib/id";
import { copyText } from "@/lib/clipboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { LearningReportContent } from "@/components/semester-reports/LearningReportView";
import { CartoonSemesterReportIcon } from "@/components/icons/CartoonAppIcons";
import { BatchReportImageDialog } from "@/components/semester-reports/BatchReportImageDialog";
import { SubjectLessonFields, SubjectLessonPdfFill, subjectLessonCategories } from "./SubjectLessonPdfFill";
import { SubjectReportLibrary } from "./SubjectReportLibrary";
import { ReportImageDialog } from "@/components/semester-reports/ReportImageDialog";
import { DraftEditModal, type DraftModalReport } from "@/components/semester-reports-v2/DraftEditModal";
import type { Term, Subject, Student, ReportSummaryItem, CourseDocument } from "@/components/semester-reports-v2/types";
import {
  RotateCw,
  Sparkles,
  FileText,
  Calendar,
  Settings2,
  Trash2,
  Copy,
  Eye,
  Layers,
  ArrowRight,
  ArrowLeft,
  Undo2,
  Search,
  Download,
  Rocket,
  CheckCircle2
} from "lucide-react";

const base = "/api/subject-reports";

const defaultRatings: Record<string, string[]> = {
  课堂参与: ["主动参与", "引导参与", "需要鼓励"],
  跟读发音: ["清晰准确", "基本跟读", "需要练习"],
  看图表达: ["能说词", "能说短句", "能完整表达", "需要提示"],
  课堂任务: ["独立完成", "基本完成", "需要帮助"]
};

/** 每名学生的填写草稿；出勤按课次保存，完成标记仅用于向导进度。 */
type StudentFeedback = {
  /** 兼容旧单次出勤字段。 */
  attendance?: CourseAttendanceStatus;
  /** 按课次顺序保存出勤，随课程一起提交。 */
  attendances?: CourseAttendanceStatus[];
  /** 教师面向该学生的寄语。 */
  teacherMessage?: string;
  /** 兼容旧版单条下一步重点。 */
  nextFocus?: string;
  /** 当前选中的下一步重点列表。 */
  focusItems?: string[];
  /** 按课堂评价维度名称保存预设选项。 */
  ratings?: Record<string, string>;
  /** 教师填写的四维观察文案。 */
  growthAssessment?: GrowthAssessment;
  /** 仅控制填写向导中的逐人完成状态。 */
  completed?: boolean;
};

const messageTemplates = [
  { label: "积极参与", text: "你积极参与课堂活动，期待你继续主动分享自己的想法！" },
  { label: "继续加油", text: "老师看到了你的努力，继续保持练习，一步一步积累进步！" }
] as const;

const subjectReportWizardSteps: readonly (readonly [ReportWizardStep, string])[] = [
  [1, "周期与基础"],
  [2, "选择学生"],
  [3, "学科与内容来源"],
  [4, "课堂评价与生成"]
];

/** 单学科报告工作台：维护填写草稿、报告分发与独立学科配置。 */
export function SubjectReportStudioView() {
  const [activeTab, setActiveTab] = useState<"reports" | "compose" | "library">("reports");
  const [notice, setNotice] = useState<string | null>(null);

  // 基础数据
  const [terms, setTerms] = useState<Term[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [documents, setDocuments] = useState<CourseDocument[]>([]);
  const [reports, setReports] = useState<ReportSummaryItem[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [catalogueRefresh, setCatalogueRefresh] = useState(0);

  // 筛选与报告管理
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [periodFilter, setPeriodFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [dateFilterOpen, setDateFilterOpen] = useState(false);
  const [startFilter, setStartFilter] = useState("");
  const [endFilter, setEndFilter] = useState("");
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [batchPublishOpen, setBatchPublishOpen] = useState(false);
  const [batchPublishing, setBatchPublishing] = useState(false);
  const [exportReports, setExportReports] = useState<ReportSummaryItem[]>([]);
  const reportsRequest = useRef(0);

  // 弹窗状态
  const [viewingReport, setViewingReport] = useState<ReportSummaryItem | null>(null);
  const [editingDraft, setEditingDraft] = useState<
    (DraftModalReport & Pick<ReportSummaryItem, "termId" | "subjectId">) | null
  >(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // 四步向导状态
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [period, setPeriod] = useState<"week" | "month" | "term">("week");
  const [selectedTermId, setSelectedTermId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [{ startDate, endDate }, setReportDates] = useState(() => {
    const monday = new Date();
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const friday = new Date(monday);
    friday.setDate(friday.getDate() + 4);
    const format = new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit" });
    return { startDate: format.format(monday), endDate: format.format(friday) };
  });
  const [heading, setHeading] = useState("WK课堂成长记录");
  const [theme, setTheme] = useState("");
  const [lessonNumber, setLessonNumber] = useState<number | "">("");
  const [lessonDate, setLessonDate] = useState("");

  // 教学内容
  const [lessonCount, setLessonCount] = useState(2);
  const [lessonInputs, setLessonInputs] = useState<Record<string, string>>({});
  const [pdfLessonInputs, setPdfLessonInputs] = useState<Record<string, string[]>>({});
  const [lessonScopes, setLessonScopes] = useState<Record<string, string>>({});
  const [courseScope, setCourseScope] = useState("");
  const [nextWeekContent, setNextWeekContent] = useState("");

  // 学生选择与课堂反馈
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [feedbackStudentId, setFeedbackStudentId] = useState("");
  const [studentFeedbackMap, setStudentFeedbackMap] = useState<Record<string, StudentFeedback>>({});
  const [scorePreview, setScorePreview] = useState<{ key: string; data?: ScorePreview; error?: string }>();
  const [keywords, setKeywords] = useState("");
  const [observation, setObservation] = useState("");
  const [generating, setGenerating] = useState(false);

  const currentFeedbackStudentId = selectedStudentIds.includes(feedbackStudentId)
    ? feedbackStudentId
    : selectedStudentIds[0];
  const currentTermSubjects = subjects.filter(subject => subject.termId === selectedTermId || !subject.termId);
  const selectedSubject =
    currentTermSubjects.find(subject => subject.id === selectedSubjectId) ??
    subjects.find(subject => subject.id === selectedSubjectId);
  // null/缺省沿用历史四项，空数组保留教师主动清空的设置。
  const categories = selectedSubject?.courseContentTitles ?? subjectLessonCategories;
  const performanceFields =
    selectedSubject?.performanceConfig ??
    Object.entries(defaultRatings).map(([label, options]) => ({ label, options }));
  const confirmedDocuments = (termId?: string, subjectId?: string) =>
    documents.filter(doc => doc.termId === termId && doc.subjectId === subjectId && doc.status === "ready");
  const pdfDocuments = confirmedDocuments(selectedTermId, selectedSubjectId);
  const draftPdfDocuments = confirmedDocuments(editingDraft?.termId, editingDraft?.subjectId);
  const pdfUnits = [...new Set(pdfDocuments.flatMap(doc => doc.units ?? []))];

  const announce = useCallback((msg: string) => {
    setNotice(msg);
    setTimeout(() => {
      setNotice(prev => (prev === msg ? null : prev));
    }, 4500);
  }, []);

  // Each response belongs to the filter that started it, even after a report action finishes.
  const loadReports = useCallback(
    async (subjectId: string) => {
      const current = ++reportsRequest.current;
      queueMicrotask(() => {
        if (current === reportsRequest.current) setLoadingReports(true);
      });
      const query = subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : "";
      try {
        const items = await request<ReportSummaryItem[], ReportSummaryItem[]>(`${base}/reports${query}`);
        if (current === reportsRequest.current) setReports(Array.isArray(items) ? items : []);
      } catch {
        if (current === reportsRequest.current) {
          setReports([]);
          announce("读取学科报告列表失败，请稍后重试");
        }
      } finally {
        if (current === reportsRequest.current) setLoadingReports(false);
      }
    },
    [announce]
  );

  const openReportModal = useCallback(
    async (report: ReportSummaryItem) => {
      let target = report;
      if (!target.content && !target.id.startsWith("gen-")) {
        try {
          const full = await request.get<ReportSummaryItem, ReportSummaryItem>(`${base}/reports/${report.id}`, {
            params: { refresh: createUuid() }
          });
          if (full?.content) {
            target = full;
          }
        } catch {
          // ignore
        }
      }
      if (!target.content) {
        announce("报告内容尚未生成，请稍后重试");
        return;
      }
      setEditingDraft({
        id: target.id,
        studentName: target.studentName,
        className: target.className,
        period: target.period,
        termId: target.termId,
        subjectId: target.subjectId || selectedSubjectId,
        startDate: target.startDate,
        endDate: target.endDate,
        reportVersion: target.reportVersion,
        courseScope: target.content?.courseScope || target.courseScope || undefined,
        content: target.content,
        isStageReport: false,
        status: target.status
      });
    },
    [announce]
  );

  const activeSubjectFilter = useRef(subjectFilter);
  const refreshReports = useCallback(() => loadReports(activeSubjectFilter.current), [loadReports]);
  useEffect(() => {
    activeSubjectFilter.current = subjectFilter;
    // 列表加载同步设置 loading，属于请求生命周期的起点。

    void loadReports(subjectFilter);
  }, [loadReports, subjectFilter]);

  // 初始化加载基础数据
  useEffect(() => {
    let alive = true;
    Promise.all([
      request<Term[], Term[]>(`${base}/report-terms`).catch(() => []),
      request<Subject[], Subject[]>(`${base}/report-subjects`).catch(() => []),
      request<{ students: Student[] }, { students: Student[] }>("/api/pet-points").catch(() => ({ students: [] })),
      request<CourseDocument[], CourseDocument[]>(`${base}/course-documents`).catch(() => [])
    ]).then(([termsData, subjectsData, petData, docsData]) => {
      if (!alive) return;
      const termList = Array.isArray(termsData) ? termsData : [];
      const subList = Array.isArray(subjectsData) ? subjectsData : [];
      const stuList = Array.isArray(petData?.students) ? petData.students : [];
      setTerms(termList);
      setSubjects(subList);
      setStudents(stuList);
      setDocuments(Array.isArray(docsData) ? docsData : []);
      setSelectedTermId(current => (termList.some(term => term.id === current) ? current : (termList[0]?.id ?? "")));
      setSelectedSubjectId(current =>
        subList.some(subject => subject.id === current) ? current : (subList[0]?.id ?? "")
      );
    });
    return () => {
      alive = false;
    };
  }, [catalogueRefresh]);

  // 班级列表
  const classes = useMemo(() => {
    return Array.from(new Set(students.map(s => s.className || "未分班"))).filter(Boolean);
  }, [students]);

  // 当前过滤可见学生
  const visibleStudents = useMemo(() => {
    if (!selectedClass) return students;
    return students.filter(s => (s.className || "未分班") === selectedClass);
  }, [students, selectedClass]);

  const lessonScopePrefix = `${selectedTermId}:${selectedSubjectId}:${period}:`;
  // PDF suggestions belong to a lesson and course; edits always take precedence.
  const lessonValue = useCallback(
    (lesson: number, category: number) =>
      lessonInputs[`${lesson}-${category}`] ?? pdfLessonInputs[`${lessonScopePrefix}${lesson}`]?.[category] ?? "",
    [lessonInputs, pdfLessonInputs, lessonScopePrefix]
  );

  // 序列化手填教学内容
  const serializedManualContent = useMemo(() => {
    const lines: string[] = [];
    const count = period === "week" ? lessonCount : 1;
    for (let l = 0; l < count; l += 1) {
      const lName = period === "week" ? `第 ${l + 1} 节课` : "本期教学内容";
      for (let c = 0; c < categories.length; c += 1) {
        const val = lessonValue(l, c)
          .trim()
          .replace(/[\r\n]+/g, " ");
        if (val) {
          lines.push(`${lName} · ${categories[c]}：${val}`);
        }
      }
    }
    return lines.join("\n");
  }, [period, lessonCount, lessonValue, categories]);

  const previewBody = useMemo(
    () => ({
      termId: selectedTermId,
      subjectId: selectedSubjectId,
      period,
      start: startDate,
      end: endDate,
      reportVersion: "v2",
      studentIds: selectedStudentIds,
      courseSelections: [{ subjectId: selectedSubjectId, manualContent: serializedManualContent }]
    }),
    [selectedTermId, selectedSubjectId, period, startDate, endDate, selectedStudentIds, serializedManualContent]
  );
  const previewKey = JSON.stringify(previewBody);
  const currentPreview = scorePreview?.key === previewKey ? scorePreview : undefined;
  const completedCount = selectedStudentIds.filter(id => studentFeedbackMap[id]?.completed).length;
  const validDates = !!startDate && !!endDate && startDate <= endDate;
  const canPreview =
    !!selectedTermId &&
    !!selectedSubjectId &&
    selectedStudentIds.length > 0 &&
    selectedStudentIds.length <= 30 &&
    validDates &&
    !!serializedManualContent &&
    serializedManualContent.length <= 1000;

  useEffect(() => {
    if (activeTab !== "compose" || step !== 4 || !canPreview) return;
    const controller = new AbortController();
    void request<ScorePreview, ScorePreview>(`${base}/reports/preview-input`, {
      method: "POST",
      data: previewBody,
      signal: controller.signal
    })
      .then(data => {
        if (!controller.signal.aborted) setScorePreview({ key: previewKey, data });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setScorePreview({ key: previewKey, error: "无法读取本周期积分和宠物形态，可继续填写评价。" });
      });
    return () => controller.abort();
  }, [activeTab, step, previewBody, previewKey, canPreview]);

  // 提交生成报告
  const handleGenerate = async () => {
    if (!selectedStudentIds.length) {
      announce("请先挑选本次生成报告的学生");
      setStep(3);
      return;
    }
    if (selectedStudentIds.length > 30) {
      announce("单次最多生成 30 份学科报告。");
      setStep(3);
      return;
    }
    if (!selectedSubjectId || !selectedTermId) {
      announce("请确认学期与任教学科");
      setStep(2);
      return;
    }
    if (!validDates) {
      announce("请确认报告周期的起止日期。");
      setStep(1);
      return;
    }
    if (!serializedManualContent || serializedManualContent.length > 1000) {
      announce("请填写教学内容或从 PDF 带入，教学内容最多 1,000 字。");
      setStep(2);
      return;
    }

    setGenerating(true);
    try {
      const effectiveLessonCount = period === "week" ? lessonCount : 1;
      const studentFeedback = selectedStudentIds.map(sid => {
        const fb = studentFeedbackMap[sid] || {};
        const ratingsArray = performanceFields.flatMap(({ label, options }) => {
          const value = fb.ratings?.[label];
          return value && options.includes(value) ? [{ label, value, subjectId: selectedSubjectId }] : [];
        });
        const effectiveAttendances: CourseAttendanceStatus[] =
          fb.attendances && fb.attendances.length === effectiveLessonCount
            ? fb.attendances
            : Array.from({ length: effectiveLessonCount }, (_, i) => fb.attendances?.[i] ?? fb.attendance ?? "present");

        return {
          studentId: sid,
          attendance: effectiveAttendances[0] ?? "present",
          attendances: effectiveAttendances,
          teacherMessage: fb.teacherMessage || undefined,
          nextFocus:
            fb.focusItems
              ?.map(item => item.trim())
              .filter(Boolean)
              .join("\n") ||
            fb.nextFocus ||
            undefined,
          growthAssessment: undefined,
          classroomPerformance: ratingsArray
        };
      });

      const payload = {
        termId: selectedTermId,
        subjectId: selectedSubjectId,
        period,
        start: startDate,
        end: endDate,
        lessonCount: effectiveLessonCount,
        studentIds: selectedStudentIds,
        courseSelections: [
          {
            subjectId: selectedSubjectId,
            manualContent: serializedManualContent || undefined,
            courseScope: courseScope.trim() || undefined
          }
        ],
        courseScope: courseScope.trim() || undefined,
        nextWeekContent: nextWeekContent.trim() || undefined,
        reportDetails: {
          institutionName: heading,
          courseTheme: theme,
          lessonNumber: lessonNumber || undefined,
          lessonDate: lessonDate || undefined
        },
        studentFeedback,
        keywords: keywords || undefined,
        teacherObservation: observation || undefined
      };

      await request(`${base}/reports/generate`, {
        method: "POST",
        data: payload
      });

      announce(`成功生成 ${selectedStudentIds.length} 份学科报告草稿`);
      setActiveTab("reports");
      setStep(1);
      // 成功生成后清空本次填写及 PDF 带入状态，下一份报告从空白内容开始。
      setLessonInputs({});
      setPdfLessonInputs({});
      setLessonScopes({});
      setCourseScope("");
      setNextWeekContent("");
      setLessonCount(2);
      setHeading("WK课堂成长记录");
      setTheme("");
      setLessonNumber("");
      setLessonDate("");
      setSelectedStudentIds([]);
      setFeedbackStudentId("");
      setStudentFeedbackMap({});
      setScorePreview(undefined);
      setKeywords("");
      setObservation("");
      void refreshReports();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "生成学科报告失败，请检查输入";
      announce(msg);
    } finally {
      setGenerating(false);
    }
  };

  // 报告发布
  const handlePublish = async (reportId: string) => {
    try {
      const res = await request<{ report: ReportSummaryItem; url: string }, { report: ReportSummaryItem; url: string }>(
        `${base}/reports/${reportId}/publish`,
        {
          method: "POST"
        }
      );
      void refreshReports();
      announce("报告已成功发布！分享链接已生成");
      if (res?.url && (await copyText(res.url))) {
        announce("已发布并复制分享链接到剪贴板！");
      }
      return true;
    } catch {
      announce("发布失败，请稍后重试");
      return false;
    }
  };

  const saveDraft = async (id: string, content: LearningReportContent) => {
    try {
      await request(`${base}/reports/${id}/draft`, { method: "PATCH", data: { content } });
      return true;
    } catch {
      announce("保存草稿失败");
      return false;
    }
  };

  // 报告撤回
  const handleUnpublish = async (reportId: string) => {
    try {
      await request(`${base}/reports/${reportId}/unpublish`, { method: "POST" });
      announce("报告已撤回为草稿状态，外部链接已失效");
      void refreshReports();
    } catch {
      announce("撤回失败，请稍后重试");
    }
  };

  // 重试生成
  const handleRetry = async (reportId: string) => {
    try {
      await request(`${base}/reports/${reportId}/retry`, { method: "POST" });
      announce("已重新加入生成队列");
      void refreshReports();
    } catch {
      announce("重试失败，请重试");
    }
  };

  // 删除报告
  const confirmDeleteReport = async () => {
    if (!deleteTargetId) return;
    try {
      await request(`${base}/reports/${deleteTargetId}`, { method: "DELETE" });
      announce("报告已删除");
      setDeleteTargetId(null);
      void refreshReports();
    } catch {
      announce("删除失败，请稍后重试");
    }
  };

  const studentsById = new Map(students.map(student => [student.id, student]));
  const listedReports = reports.map(report => {
    // 旧报告可能只保存了默认身份，按学生 ID 从当前教师的名单补齐显示。
    if (report.studentName !== "学生" || report.className !== "默认班级" || !report.studentId) return report;
    const student = studentsById.get(report.studentId);
    return student ? { ...report, studentName: student.name, className: student.className } : report;
  });
  const filteredReports = listedReports.filter(report => {
    if (statusFilter && report.status !== statusFilter) return false;
    if (periodFilter && report.period !== periodFilter) return false;
    const start = report.startDate ?? report.start?.slice(0, 10);
    const end = report.endDate ?? report.end?.slice(0, 10);
    if (startFilter && (!start || start < startFilter)) return false;
    if (endFilter && (!end || end > endFilter)) return false;
    const query = searchQuery.trim().toLowerCase();
    return (
      !query ||
      [report.studentName, report.className, report.subjectName].some(value => value?.toLowerCase().includes(query))
    );
  });
  const selectedReports = filteredReports.filter(report => selectedReportIds.includes(report.id));
  const selectedDrafts = selectedReports.filter(report => report.status === "draft");
  const selectedPublished = selectedReports.filter(report => report.status === "published");

  async function publishSelected() {
    setBatchPublishing(true);
    const failed: string[] = [];
    for (const report of selectedDrafts) {
      try {
        await request(`${base}/reports/${report.id}/publish`, { method: "POST" });
      } catch {
        failed.push(report.id);
      }
    }
    const published = selectedDrafts.length - failed.length;
    setSelectedReportIds(failed);
    announce(
      failed.length ? `已发布 ${published} 份，${failed.length} 份发布失败，可重试。` : `已发布 ${published} 份报告。`
    );
    setBatchPublishOpen(false);
    setBatchPublishing(false);
    void refreshReports();
  }

  const wizardActions = (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
      <div className="flex items-center gap-2">
        {step > 1 && (
          <Button variant="outline" size="sm" onClick={() => setStep(prev => (prev - 1) as 1 | 2 | 3 | 4)}>
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> 上一步
          </Button>
        )}
      </div>

      <div>
        {step < 4 && (
          <Button
            size="sm"
            onClick={() => {
              if (step === 2 && !selectedStudentIds.length) {
                announce("请至少勾选 1 位学生");
                return;
              }
              if (step === 3 && (!selectedSubjectId || !currentTermSubjects.length)) {
                announce("请先选择报告学科");
                return;
              }
              setStep(prev => (prev + 1) as 1 | 2 | 3 | 4);
            }}
          >
            {step === 1 ? "下一步：选择学生" : step === 2 ? "下一步：配置学科与教学内容" : "下一步：课堂评价与生成"}{" "}
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 text-xs antialiased sm:p-5 sm:text-sm">
      {/* 顶部标题栏与工作台主标签 */}
      <header className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CartoonSemesterReportIcon className="h-11 w-11 shrink-0 drop-shadow-sm" />
            <div>
              <h1 className="text-base font-bold sm:text-lg">学科报告工作台</h1>
              <p className="text-xs text-slate-500">课程资料、课堂反馈与家长报告</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void refreshReports();
                setCatalogueRefresh(current => current + 1);
              }}
            >
              <RotateCw className="mr-1.5 h-3.5 w-3.5" /> 刷新
            </Button>
          </div>
        </div>

        {/* 顶部主切换导航 */}
        <nav className="flex rounded-xl border bg-muted/40 p-1 text-xs font-semibold" aria-label="学科报告工作台主导航">
          <button
            type="button"
            onClick={() => setActiveTab("reports")}
            className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-1 py-2 text-center transition ${
              activeTab === "reports"
                ? "bg-card font-bold text-indigo-600 shadow-xs"
                : "font-medium text-muted-foreground hover:bg-card/60"
            }`}
          >
            <FileText className="h-3.5 w-3.5" /> 报告管理与分发
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("compose")}
            className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-1 py-2 text-center transition ${
              activeTab === "compose"
                ? "bg-card font-bold text-indigo-600 shadow-xs"
                : "font-medium text-muted-foreground hover:bg-card/60"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" /> 填写与生成报告
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("library")}
            className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-1 py-2 text-center transition ${
              activeTab === "library"
                ? "bg-card font-bold text-indigo-600 shadow-xs"
                : "font-medium text-muted-foreground hover:bg-card/60"
            }`}
          >
            <Settings2 className="h-3.5 w-3.5" /> 学期学科设置与课程资料
          </button>
        </nav>
      </header>

      {/* 固定在视口内，填写长表单时也能看到操作反馈。 */}
      {notice && (
        <div
          className="fixed left-1/2 top-5 z-[9999] flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-2xl"
          role="status"
        >
          <span>{notice}</span>
        </div>
      )}

      {/* 主视图区 */}
      <main className="min-w-0">
        {/* Tab 1: 报告管理与分发 */}
        {activeTab === "reports" && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {(
                [
                  ["", "全部报告"],
                  ["draft", "待审核草稿"],
                  ["published", "已发布"],
                  ["failed", "失败"]
                ] as const
              ).map(([status, label]) => (
                <Button
                  key={status}
                  size="sm"
                  variant={statusFilter === status ? "default" : "outline"}
                  aria-pressed={statusFilter === status}
                  onClick={() => setStatusFilter(status)}
                >
                  {label} ({reports.filter(report => !status || report.status === status).length})
                </Button>
              ))}
              <Button size="sm" variant="outline" className="ml-auto" onClick={() => setActiveTab("compose")}>
                <Sparkles className="h-3.5 w-3.5" /> 新建学科报告
              </Button>
            </div>
            <div className="space-y-2.5 rounded-2xl border bg-card p-3.5">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_7rem_7rem_8rem_auto]">
                <div className="relative">
                  <Search className="absolute top-2.5 left-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    aria-label="搜索报告"
                    value={searchQuery}
                    onChange={event => setSearchQuery(event.target.value)}
                    placeholder="搜索学生姓名、班级或学科..."
                    className="h-9 pl-8 text-xs"
                  />
                </div>
                <select
                  aria-label="报告周期筛选"
                  value={periodFilter}
                  onChange={event => setPeriodFilter(event.target.value)}
                  className="h-9 min-w-0 rounded-xl border bg-background px-2 text-xs"
                >
                  <option value="">全部周期</option>
                  <option value="week">周报</option>
                  <option value="month">月报</option>
                  <option value="term">学期报告</option>
                </select>
                <select
                  aria-label="报告状态筛选"
                  value={statusFilter}
                  onChange={event => setStatusFilter(event.target.value)}
                  className="h-9 min-w-0 rounded-xl border bg-background px-2 text-xs"
                >
                  <option value="">全部状态</option>
                  <option value="draft">待审核草稿</option>
                  <option value="published">已发布</option>
                  <option value="queued">排队中</option>
                  <option value="generating">生成中</option>
                  <option value="failed">失败</option>
                </select>
                <select
                  aria-label="学科筛选"
                  value={subjectFilter}
                  onChange={event => {
                    setSelectedReportIds([]);
                    setSubjectFilter(event.target.value);
                  }}
                  className="h-9 min-w-0 rounded-xl border bg-background px-2 text-xs"
                >
                  <option value="">全部学科</option>
                  {subjects.map(subject => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  aria-expanded={dateFilterOpen}
                  onClick={() => setDateFilterOpen(open => !open)}
                >
                  <Calendar className="h-3.5 w-3.5" /> 日期范围
                </Button>
              </div>
              {dateFilterOpen && (
                <div className="grid items-end gap-2 rounded-xl border bg-muted/30 p-2 sm:grid-cols-[1fr_1fr_auto]">
                  <label className="space-y-1 text-xs">
                    <span>报告开始日期</span>
                    <Input type="date" value={startFilter} onChange={event => setStartFilter(event.target.value)} />
                  </label>
                  <label className="space-y-1 text-xs">
                    <span>报告结束日期</span>
                    <Input type="date" value={endFilter} onChange={event => setEndFilter(event.target.value)} />
                  </label>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setStartFilter("");
                      setEndFilter("");
                      setDateFilterOpen(false);
                    }}
                  >
                    清除时间筛选
                  </Button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/40 p-3 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    disabled={!filteredReports.length || loadingReports || batchPublishing}
                    checked={filteredReports.length > 0 && selectedReports.length === filteredReports.length}
                    onChange={event =>
                      setSelectedReportIds(event.target.checked ? filteredReports.map(report => report.id) : [])
                    }
                  />
                  全选当前筛选结果
                </label>
                <span>
                  已选 {selectedReports.length} 份 · 共 {filteredReports.length} 份
                </span>
                <Button size="sm" variant="ghost" onClick={() => setSelectedReportIds([])}>
                  清空
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={!selectedDrafts.length || loadingReports || batchPublishing}
                  onClick={() => setBatchPublishOpen(true)}
                >
                  <Rocket className="h-3.5 w-3.5" /> 批量发布草稿
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!selectedPublished.length || loadingReports}
                  onClick={() => setExportReports(selectedPublished)}
                >
                  <Download className="h-3.5 w-3.5" /> 导出所选长图 ZIP
                </Button>
              </div>
            </div>
            <div className="space-y-2.5">
              {loadingReports ? (
                <div className="py-12 text-center text-xs text-slate-400">正在读取学科报告...</div>
              ) : filteredReports.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  当前筛选条件下暂无学科报告，可点击右上角新建。
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredReports.map(report => (
                    <div
                      key={report.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-card p-3.5"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <input
                          className="mt-1"
                          type="checkbox"
                          aria-label={`选择 ${report.studentName} 的报告`}
                          checked={selectedReportIds.includes(report.id)}
                          onChange={event =>
                            setSelectedReportIds(ids =>
                              event.target.checked ? [...ids, report.id] : ids.filter(id => id !== report.id)
                            )
                          }
                        />
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-foreground">
                              {report.studentName} · {report.className || "未分班"}
                            </span>
                            <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700">
                              {report.subjectName || "学科报告"}
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                                report.status === "published"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : report.status === "draft"
                                    ? "bg-amber-50 text-amber-700"
                                    : report.status === "failed"
                                      ? "bg-rose-50 text-rose-700"
                                      : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {report.status === "published"
                                ? "已发布 (公开)"
                                : report.status === "draft"
                                  ? "待审核"
                                  : report.status === "failed"
                                    ? "生成失败"
                                    : "排队中"}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {report.period === "week" ? "周报" : report.period === "month" ? "月报" : "学期报告"} ·{" "}
                            {report.startDate || report.start?.slice(0, 10)} ~{" "}
                            {report.endDate || report.end?.slice(0, 10)}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {report.status === "published" && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-xl"
                              onClick={() => void openReportModal(report)}
                            >
                              <Eye className="mr-1 h-3.5 w-3.5 text-indigo-600" /> 查看流程
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-xl"
                              onClick={() => setViewingReport(report)}
                            >
                              <FileText className="mr-1 h-3.5 w-3.5 text-indigo-600" /> 报告图片
                            </Button>
                          </>
                        )}

                        {report.status === "draft" && (
                          <Button variant="outline" size="sm" onClick={() => void openReportModal(report)}>
                            <FileText className="mr-1 h-3.5 w-3.5 text-indigo-600" /> 预览/微调
                          </Button>
                        )}

                        {report.status === "draft" && (
                          <Button size="sm" onClick={() => void handlePublish(report.id)}>
                            发布
                          </Button>
                        )}

                        {report.status === "published" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-xl text-muted-foreground"
                            onClick={() => void handleUnpublish(report.id)}
                          >
                            <Undo2 className="mr-1 h-3.5 w-3.5" /> 撤销
                          </Button>
                        )}

                        {report.status === "failed" && (
                          <Button variant="outline" size="sm" onClick={() => void handleRetry(report.id)}>
                            重试
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                          aria-label="删除"
                          onClick={() => setDeleteTargetId(report.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {report.status === "published" && (
                        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 rounded-xl bg-muted/40 p-2 text-xs">
                          <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                            <Layers className="size-3.5" /> 家长访问链接
                          </span>
                          <Input
                            aria-label="家长访问链接"
                            readOnly
                            value={report.share?.url ?? ""}
                            placeholder="点击右侧「复制链接」生成并复制"
                            onClick={event => event.currentTarget.select()}
                            className="h-8 min-w-0 flex-1 border-0 bg-transparent font-mono text-xs text-indigo-600 shadow-none"
                          />
                          <Button
                            size="sm"
                            className="shrink-0 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                            onClick={async () => {
                              try {
                                let url = report.share?.url;
                                if (!url) {
                                  const share = await request<{ url: string }, { url: string }>(
                                    `${base}/reports/${encodeURIComponent(report.id)}/shares`,
                                    { method: "POST" }
                                  );
                                  url = share.url;
                                  void refreshReports();
                                }
                                announce(
                                  (await copyText(url)) ? "分享链接已复制！" : "复制失败，请选中链接后手动复制。"
                                );
                              } catch {
                                announce("获取分享链接失败，请重试。");
                              }
                            }}
                          >
                            <Copy className="mr-1 size-3.5" /> 复制链接
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Tab 2: 填写与生成报告 (四步向导) */}
        {activeTab === "compose" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <ReportWizardSteps
              step={step}
              onChange={setStep}
              hasSubjects={!!selectedTermId && !!selectedSubjectId && !!currentTermSubjects.length}
              hasStudents={selectedStudentIds.length > 0}
              steps={subjectReportWizardSteps}
              isStepDisabled={stepValue => {
                if (stepValue === 3) return !selectedStudentIds.length;
                if (stepValue === 4) {
                  return (
                    !selectedStudentIds.length || !selectedTermId || !selectedSubjectId || !currentTermSubjects.length
                  );
                }
                return false;
              }}
            />

            {step === 1 && (
              <div className="space-y-4 rounded-2xl border bg-card p-5">
                <div className="border-b pb-2.5">
                  <h2 className="text-sm font-bold">步骤 1：报告周期与基础信息配置</h2>
                  <p className="text-xs text-muted-foreground">选择报告周期，并确认报告抬头、主题和日期。</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">报告周期</span>
                    <div
                      role="group"
                      aria-label="报告周期"
                      className="grid grid-cols-3 gap-1 rounded-xl border bg-muted/40 p-1 text-xs"
                    >
                      {(
                        [
                          ["week", "周报"],
                          ["month", "月报"],
                          ["term", "学期"]
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          type="button"
                          key={value}
                          aria-pressed={period === value}
                          onClick={() => setPeriod(value)}
                          className={`rounded-lg py-1.5 transition ${period === value ? "bg-indigo-600 font-bold text-white shadow-2xs" : "text-muted-foreground hover:bg-card"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="min-w-0 text-xs font-medium text-muted-foreground">
                    <span className="mb-1 block">周期开始日期</span>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={e => setReportDates({ startDate: e.target.value, endDate })}
                      className="h-9 min-w-0 text-left text-xs"
                    />
                  </label>
                  <label className="min-w-0 text-xs font-medium text-muted-foreground">
                    <span className="mb-1 block">周期结束日期</span>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={e => setReportDates({ startDate, endDate: e.target.value })}
                      className="h-9 min-w-0 text-left text-xs"
                    />
                  </label>
                </div>
                <div className="grid gap-3 pt-1 sm:grid-cols-3">
                  <label className="space-y-1 text-xs font-medium text-muted-foreground">
                    <span>报告抬头</span>
                    <Input
                      value={heading}
                      maxLength={60}
                      onChange={e => setHeading(e.target.value)}
                      placeholder="课堂成长记录"
                      className="h-9 text-xs"
                    />
                  </label>
                  <label className="space-y-1 text-xs font-medium text-muted-foreground">
                    <span>课程主题</span>
                    <Input
                      value={theme}
                      maxLength={100}
                      onChange={e => setTheme(e.target.value)}
                      placeholder="选填"
                      className="h-9 text-xs"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
                      <span>第几次课</span>
                      <Input
                        type="number"
                        min={1}
                        max={999}
                        value={lessonNumber}
                        onChange={e => setLessonNumber(e.target.value ? Number(e.target.value) : "")}
                        placeholder="选填"
                        className="h-9 text-xs"
                      />
                    </label>
                    <label className="min-w-0 text-xs font-medium text-muted-foreground">
                      <span className="mb-1 block">授课日期</span>
                      <Input
                        type="date"
                        value={lessonDate}
                        onChange={e => setLessonDate(e.target.value)}
                        className="h-9 min-w-0 text-left text-xs"
                      />
                    </label>
                  </div>
                </div>
                {wizardActions}
              </div>
            )}

            {/* 步骤 2：挑选本次生成报告的学生 */}
            {step === 2 && (
              <div className="space-y-4 rounded-2xl border bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-2.5">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      步骤 2：挑选本次生成报告的学生（已选 {selectedStudentIds.length} 人）
                    </h2>
                    <p className="text-xs text-slate-500">每个已选学生将独立生成一份学科报告草稿（单次上限 30 人）。</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedClass}
                      onChange={e => setSelectedClass(e.target.value)}
                      className="h-8 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs"
                      aria-label="按班级筛选"
                    >
                      <option value="">全部班级 ({students.length}人)</option>
                      {classes.map(c => (
                        <option key={c} value={c}>
                          {c} ({students.filter(s => (s.className || "未分班") === c).length}人)
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const ids = visibleStudents.map(s => s.id);
                        setSelectedStudentIds(prev => Array.from(new Set([...prev, ...ids])).slice(0, 30));
                      }}
                    >
                      全选本班
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedStudentIds([])}>
                      清空
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {visibleStudents.map(student => {
                    const checked = selectedStudentIds.includes(student.id);
                    return (
                      <button
                        key={student.id}
                        type="button"
                        aria-pressed={checked}
                        disabled={!checked && selectedStudentIds.length >= 30}
                        onClick={() => {
                          setSelectedStudentIds(prev =>
                            checked ? prev.filter(id => id !== student.id) : [...prev, student.id]
                          );
                        }}
                        className={`space-y-1 rounded-xl border-2 p-3 text-left transition disabled:cursor-not-allowed ${
                          checked
                            ? "border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/40"
                            : "border-border bg-card opacity-60 hover:opacity-100"
                        }`}
                      >
                        <div className="flex w-full items-center justify-between text-[11px] text-slate-500">
                          <span>{student.className || "未分班"}</span>
                          <span className={checked ? "font-bold text-indigo-600" : ""}>{checked ? "✓ 已选" : ""}</span>
                        </div>
                        <div className="mt-1 font-bold text-slate-900">{student.name}</div>
                        <div className="text-[11px] text-slate-500">{student.score} 积分</div>
                      </button>
                    );
                  })}
                </div>
                {wizardActions}
              </div>
            )}

            {/* 步骤 3：报告学科与教学内容 */}
            {step === 3 && (
              <div className="space-y-4 rounded-2xl border bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
                  <div>
                    <h2 className="text-sm font-bold">步骤 3：报告学科与教学内容</h2>
                    <p className="text-xs text-muted-foreground">
                      选择一门学科，逐课次手填内容或从已确认的课程 PDF 带入。
                    </p>
                  </div>
                  {selectedSubject && (
                    <span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600 dark:bg-indigo-950">
                      已选 {selectedSubject.name}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-700">课程学期</label>
                    <select
                      value={selectedTermId}
                      onChange={e => {
                        const nextTermId = e.target.value;
                        setSelectedTermId(nextTermId);
                        const matching = subjects.filter(s => s.termId === nextTermId || !s.termId);
                        if (matching.every(s => s.id !== selectedSubjectId)) {
                          setSelectedSubjectId(matching[0]?.id ?? "");
                        }
                      }}
                      className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-slate-50 px-2 text-xs"
                    >
                      {terms.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="subject-report-course-subject" className="text-xs font-semibold text-slate-700">
                      报告学科
                    </label>
                    <select
                      id="subject-report-course-subject"
                      value={selectedSubjectId}
                      onChange={e => setSelectedSubjectId(e.target.value)}
                      className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-slate-50 px-2 text-xs"
                    >
                      {!currentTermSubjects.length && <option value="">该学期暂无学科，请先添加</option>}
                      {currentTermSubjects.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {period === "week" && (
                  <div className="mt-4">
                    <label className="text-xs font-semibold text-slate-700">本周课程次数</label>
                    <Input
                      type="number"
                      min={1}
                      max={30}
                      aria-label="本周课程次数"
                      value={lessonCount}
                      onChange={e => setLessonCount(Math.max(1, Math.min(30, Math.trunc(Number(e.target.value)) || 1)))}
                      className="mt-1 h-9 w-32 text-xs"
                    />
                  </div>
                )}

                {/* 课次手填卡片 */}
                <div className="mt-4 space-y-4">
                  {Array.from({ length: period === "week" ? lessonCount : 1 }).map((_, lIdx) => {
                    const scopeKey = `${lessonScopePrefix}${lIdx}`;
                    return (
                      <div key={lIdx} className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-4">
                        <h3 className="mb-2 text-xs font-bold text-indigo-900">
                          {period === "week" ? `第 ${lIdx + 1} 节课教学内容` : "本期教学内容"}
                        </h3>
                        <SubjectLessonPdfFill
                          key={scopeKey}
                          scope={lessonScopes[scopeKey] ?? ""}
                          onScopeChange={scope => setLessonScopes(current => ({ ...current, [scopeKey]: scope }))}
                          termId={selectedTermId}
                          subjectId={selectedSubjectId}
                          period={period}
                          units={pdfUnits}
                          hasDocuments={!!pdfDocuments.length}
                          onOpenLibrary={() => setActiveTab("library")}
                          onFill={groups =>
                            setPdfLessonInputs(current => ({
                              ...current,
                              [scopeKey]: categories.map(title => {
                                const index = subjectLessonCategories.indexOf(title);
                                return (groups[index] ?? []).join("\n");
                              })
                            }))
                          }
                        />
                        <SubjectLessonFields
                          id={`subject-lesson-${lIdx}`}
                          titles={categories}
                          values={categories.map((_, index) => lessonValue(lIdx, index))}
                          onChange={(index, value) =>
                            setLessonInputs(previous => ({ ...previous, [`${lIdx}-${index}`]: value }))
                          }
                        />
                      </div>
                    );
                  })}
                </div>

                <p aria-live="polite" className="mt-2 text-xs text-muted-foreground">
                  教学内容 {serializedManualContent.length} / 1000 字
                </p>
                <div className="mt-4">
                  <label className="text-xs font-semibold text-slate-700">授课范围备注文案（选填）</label>
                  <Input
                    value={courseScope}
                    onChange={e => setCourseScope(e.target.value)}
                    placeholder="例如：Unit 1 单词复习与句型对话"
                    className="mt-1 h-9 text-xs"
                  />
                </div>

                <div className="mt-4">
                  <label className="text-xs font-semibold text-slate-700">
                    {period === "month"
                      ? "下月课堂预习内容（选填）"
                      : period === "term"
                        ? "下学期课堂预习内容（选填）"
                        : "下周课堂预习内容（选填）"}
                  </label>
                  <Textarea
                    value={nextWeekContent}
                    onChange={e => setNextWeekContent(e.target.value)}
                    placeholder="例如：继续巩固颜色与数字表达，开展课堂情景剧..."
                    className="mt-1 min-h-[60px] text-xs"
                  />
                </div>
                {wizardActions}
              </div>
            )}

            {/* 步骤 4 */}
            {step === 4 && (
              <div className="space-y-4 rounded-2xl border bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
                  <div>
                    <h2 className="flex flex-wrap items-center gap-2 text-sm font-bold">
                      步骤 4：学生课堂反馈与最终生成
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-normal text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        进度：{completedCount} / {selectedStudentIds.length} 已评价
                      </span>
                    </h2>
                    <p className="text-xs text-muted-foreground">核对本周期表现，逐人填写课堂评价。</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={() => {
                      setStudentFeedbackMap(current => {
                        const next = { ...current };
                        for (const id of selectedStudentIds) {
                          if (!next[id]?.teacherMessage?.trim())
                            next[id] = { ...next[id], teacherMessage: messageTemplates[1].text };
                        }
                        return next;
                      });
                      announce("已为寄语为空的学生填入基础寄语");
                    }}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    一键填入全班基础寄语模版
                  </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                  <div
                    aria-label="待评价学生"
                    className="max-h-60 space-y-1 overflow-y-auto rounded-xl border bg-muted/20 p-2 md:max-h-[620px]"
                  >
                    {selectedStudentIds.map(id => {
                      const student = students.find(item => item.id === id);
                      const active = id === currentFeedbackStudentId;
                      const feedback = studentFeedbackMap[id];

                      return (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setFeedbackStudentId(id)}
                          className={`flex w-full items-center justify-between gap-2 rounded-lg p-2.5 text-left text-xs transition ${active ? "bg-indigo-600 font-bold text-white shadow-xs" : "text-muted-foreground hover:bg-card"}`}
                        >
                          <span>{student?.name ?? "学生"}</span>
                          <span>{feedback?.completed ? "已完成" : "待评价"}</span>
                        </button>
                      );
                    })}
                  </div>
                  {currentFeedbackStudentId &&
                    (() => {
                      const id = currentFeedbackStudentId;
                      const student = students.find(item => item.id === id);
                      const feedback = studentFeedbackMap[id];
                      const focusItems = feedback?.focusItems ?? (feedback?.nextFocus ? [feedback.nextFocus] : []);
                      const updateFeedback = (changes: Partial<StudentFeedback>) =>
                        setStudentFeedbackMap(current => ({ ...current, [id]: { ...current[id], ...changes } }));
                      const score = currentPreview?.data?.scoreSummaries?.find(item => item.studentId === id);
                      const pet = currentPreview?.data?.petPreviews?.find(item => item.studentId === id);
                      return (
                        <section className="space-y-4 rounded-xl border bg-muted/10 p-4" aria-label="当前学生课堂评价">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
                            <h3 className="text-sm font-bold">
                              {student?.name ?? "学生"} · {student?.className}
                            </h3>
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                              <span className="text-muted-foreground">快捷评语</span>
                              {messageTemplates.map(template => (
                                <Button
                                  key={template.label}
                                  variant="outline"
                                  size="sm"
                                  className="rounded-full"
                                  onClick={() =>
                                    updateFeedback({
                                      teacherMessage: [feedback?.teacherMessage, template.text]
                                        .filter(Boolean)
                                        .join("\n")
                                        .slice(0, 2500)
                                    })
                                  }
                                >
                                  {template.label}
                                </Button>
                              ))}
                            </div>
                          </div>
                          {period === "week" && lessonCount > 1 ? (
                            <div className="space-y-2 rounded-xl border bg-card p-3">
                              <h4 className="text-xs font-semibold text-foreground">每次课程出勤情况</h4>
                              <div className="grid gap-2.5 sm:grid-cols-2">
                                {Array.from({ length: lessonCount }).map((_, lIdx) => {
                                  const currentAttendances =
                                    feedback?.attendances && feedback.attendances.length === lessonCount
                                      ? feedback.attendances
                                      : Array.from(
                                          { length: lessonCount },
                                          (_, i) => feedback?.attendances?.[i] ?? feedback?.attendance ?? "present"
                                        );
                                  const val = currentAttendances[lIdx] ?? "present";
                                  return (
                                    <CourseAttendance
                                      key={lIdx}
                                      label={`第 ${lIdx + 1} 节课出勤情况`}
                                      value={val}
                                      onChange={newAtt => {
                                        const updatedList = [...currentAttendances];
                                        updatedList[lIdx] = newAtt;
                                        updateFeedback({
                                          attendances: updatedList,
                                          attendance: updatedList[0] ?? newAtt
                                        });
                                      }}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            <CourseAttendance
                              value={feedback?.attendance}
                              onChange={attendance => updateFeedback({ attendance, attendances: [attendance] })}
                            />
                          )}
                          <div className="grid gap-3 sm:grid-cols-2">
                            <section className="rounded-xl border bg-card p-3">
                              <h4 className="mb-2 text-xs font-semibold">{student?.name ?? "学生"}的宠物伙伴</h4>
                              {pet ? (
                                <ReportPetView pet={pet.pet} />
                              ) : (
                                <p className="text-xs text-muted-foreground">暂无周期宠物形态记录</p>
                              )}
                            </section>
                            <section className="rounded-xl border border-amber-100 bg-amber-50/70 p-3 dark:bg-amber-950/30">
                              <h4 className="mb-2 text-xs font-semibold">
                                {period === "week" ? "本周" : period === "month" ? "本月" : "本期"}最值肯定
                              </h4>
                              {score ? (
                                <PeriodScoreChart details={score} />
                              ) : (
                                <p className="text-xs text-muted-foreground" role="status">
                                  {currentPreview?.error ??
                                    (currentPreview
                                      ? "暂无周期积分明细"
                                      : canPreview
                                        ? "正在读取周期积分…"
                                        : "请先确认周期日期和教学内容。")}
                                </p>
                              )}
                            </section>
                          </div>
                          <section className="space-y-3 rounded-xl border bg-card p-3.5">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="flex items-center gap-1.5 text-xs font-bold">
                                <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                                各学科课堂表现评价
                              </h4>
                              {selectedSubject && (
                                <span className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white">
                                  {selectedSubject.name}
                                </span>
                              )}
                            </div>
                            <V2ClassroomPerformance
                              subjects={
                                selectedSubject ? [{ ...selectedSubject, performanceConfig: performanceFields }] : []
                              }
                              activeSubjectId={selectedSubjectId}
                              hideSubjectTabs
                              ratings={Object.entries(feedback?.ratings ?? {}).map(([label, value]) => ({
                                subjectId: selectedSubjectId,
                                label,
                                value
                              }))}
                              onChange={ratings =>
                                updateFeedback({
                                  ratings: Object.fromEntries(ratings.map(rating => [rating.label, rating.value]))
                                })
                              }
                            />
                          </section>
                          <label className="block space-y-1.5 text-xs font-bold">
                            老师想对你说
                            <Textarea
                              value={feedback?.teacherMessage ?? ""}
                              maxLength={2500}
                              onChange={event => updateFeedback({ teacherMessage: event.target.value })}
                              placeholder="输入教师专属寄语与鼓励…"
                              className="min-h-20 text-xs"
                            />
                          </label>
                          <section className="space-y-2 rounded-xl border bg-card p-3">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="text-xs font-bold">回家可以跟父母一起练</h4>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={focusItems.length >= 8}
                                onClick={() =>
                                  updateFeedback({ focusItems: [...focusItems, ""], nextFocus: undefined })
                                }
                              >
                                + 添加练习建议 ({focusItems.length}/8)
                              </Button>
                            </div>
                            {focusItems.map((item, index) => (
                              <div key={index} className="flex items-center gap-2 rounded-lg border bg-muted/30 p-1.5">
                                <Input
                                  aria-label={`练习建议 ${index + 1}`}
                                  value={item}
                                  maxLength={99}
                                  placeholder="填写回家可以跟父母一起练习的内容..."
                                  onChange={event => {
                                    const value = event.target.value;
                                    updateFeedback({
                                      focusItems: focusItems.map((text, position) =>
                                        position === index ? value : text
                                      ),
                                      nextFocus: undefined
                                    });
                                  }}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  aria-label={`移除练习建议 ${index + 1}`}
                                  onClick={() =>
                                    updateFeedback({
                                      focusItems: focusItems.filter((_, position) => index !== position),
                                      nextFocus: undefined
                                    })
                                  }
                                >
                                  移除
                                </Button>
                              </div>
                            ))}
                          </section>
                          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
                            <span className="text-xs font-medium text-emerald-600">✓ 当前学生反馈已暂存</span>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => {
                                updateFeedback({ completed: true });
                                const next = selectedStudentIds[selectedStudentIds.indexOf(id) + 1];
                                if (next) {
                                  setFeedbackStudentId(next);
                                  announce(`已暂存「${student?.name ?? "学生"}」的完整课堂反馈，已切换到下一位`);
                                } else {
                                  announce("已经完成全部学生的报告填写，请点击确认生成草稿");
                                }
                              }}
                            >
                              保存并切换下一位学生 <ArrowRight className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </section>
                      );
                    })()}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-700">补充关键词（选填）</label>
                    <Input
                      value={keywords}
                      onChange={e => setKeywords(e.target.value)}
                      placeholder="例如：阅读表达、探究思维"
                      className="mt-1 h-9 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700">
                      全班共同观察（选填，适用于全部已选学生）
                    </label>
                    <Input
                      value={observation}
                      onChange={e => setObservation(e.target.value)}
                      placeholder="例如：本周整体课堂纪律良好，互动热烈"
                      className="mt-1 h-9 text-xs"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/40">
                  <div className="text-xs">
                    <p className="font-bold">
                      已选 {selectedStudentIds.length} 人 · {selectedSubject?.name ?? "请选择学科"}
                    </p>
                    <p className="text-muted-foreground">按当前周期生成每位学生的学科报告草稿。</p>
                  </div>
                  <Button
                    type="button"
                    disabled={generating || !selectedStudentIds.length}
                    onClick={() => void handleGenerate()}
                  >
                    <Rocket className="h-4 w-4" />
                    {generating ? "正在生成…" : `确认生成 ${selectedStudentIds.length} 份报告草稿`}
                  </Button>
                </div>
                {wizardActions}
              </div>
            )}
          </div>
        )}

        {activeTab === "library" && (
          <SubjectReportLibrary
            terms={terms}
            subjects={subjects}
            documents={documents}
            initialTermId={selectedTermId}
            initialSubjectId={selectedSubjectId}
            onTerm={term => {
              setTerms(current => [...current, term]);
              setSelectedTermId(current => current || term.id);
            }}
            onDeleteTerm={id => {
              setTerms(current => current.filter(term => term.id !== id));
              setSelectedTermId(current => (current === id ? (terms.find(term => term.id !== id)?.id ?? "") : current));
            }}
            onSubject={subject => {
              setSubjects(current =>
                current.some(item => item.id === subject.id)
                  ? current.map(item => (item.id === subject.id ? subject : item))
                  : [...current, subject]
              );
              setSelectedSubjectId(current => current || subject.id);
            }}
            onDeleteSubject={id => {
              setSubjects(current => current.filter(subject => subject.id !== id));
              setSelectedSubjectId(current =>
                current === id ? (subjects.find(item => item.id !== id)?.id ?? "") : current
              );
              if (subjectFilter === id) {
                setSelectedReportIds([]);
                setSubjectFilter("");
              }
            }}
            onDocuments={setDocuments}
            announce={announce}
          />
        )}
      </main>

      {!!exportReports.length && (
        <BatchReportImageDialog reports={exportReports} subjectReport onClose={() => setExportReports([])} />
      )}
      <ConfirmDialog
        open={batchPublishOpen && !batchPublishing}
        title="批量发布草稿？"
        description={`将发布已选中的 ${selectedDrafts.length} 份草稿并生成家长分享链接。`}
        confirmText="发布"
        onConfirm={() => void publishSelected()}
        onCancel={() => setBatchPublishOpen(false)}
      />
      {viewingReport && (
        <ReportImageDialog
          studentName={viewingReport.studentName}
          shareUrl={viewingReport.share?.url ?? ""}
          reportData={
            viewingReport.content
              ? {
                  id: viewingReport.id,
                  studentName: viewingReport.studentName,
                  className: viewingReport.className,
                  subject: viewingReport.subjectName ?? "",
                  term: viewingReport.termName || terms.find(term => term.id === viewingReport.termId)?.name || "",
                  period: viewingReport.period,
                  start: viewingReport.start,
                  end: viewingReport.end,
                  courseScope: viewingReport.content?.courseScope || viewingReport.courseScope || undefined,
                  content: viewingReport.content,
                  isSubjectReport: true
                }
              : null
          }
          onClose={() => setViewingReport(null)}
        />
      )}

      {/* 弹窗：编辑草稿与查看流程 */}
      {editingDraft && (
        <DraftEditModal
          isOpen={true}
          onClose={() => setEditingDraft(null)}
          report={editingDraft}
          allAvailableSubjects={
            subjects.filter(
              subject =>
                subject.id === editingDraft.subjectId ||
                subject.id === editingDraft.content.reportSubjects?.[0]?.subjectId ||
                subject.name === editingDraft.content.reportSubjects?.[0]?.name
            ).length > 0
              ? subjects.filter(
                  subject =>
                    subject.id === editingDraft.subjectId ||
                    subject.id === editingDraft.content.reportSubjects?.[0]?.subjectId ||
                    subject.name === editingDraft.content.reportSubjects?.[0]?.name
                )
              : subjects
          }
          subjectReport
          subjectPdf={{
            draftId: editingDraft.id,
            termId: editingDraft.termId ?? "",
            subjectId: editingDraft.subjectId ?? "",
            hasDocuments: draftPdfDocuments.length > 0,
            units: [...new Set(draftPdfDocuments.flatMap(doc => doc.units ?? []))]
          }}
          onSave={async content => {
            if (!(await saveDraft(editingDraft.id, content))) return;
            announce("草稿已保存");
            setEditingDraft(null);
            void refreshReports();
          }}
          onPublish={async content => {
            if (!(await saveDraft(editingDraft.id, content))) return false;
            setEditingDraft(null);
            return handlePublish(editingDraft.id);
          }}
        />
      )}

      {/* 弹窗 3：确认删除 */}
      <ConfirmDialog
        open={Boolean(deleteTargetId)}
        title="确认删除该学科报告？"
        description="删除后将无法恢复，且相关家长端分享链接也将同步失效。"
        confirmText="确认删除"
        onConfirm={() => void confirmDeleteReport()}
        onCancel={() => setDeleteTargetId(null)}
      />
    </div>
  );
}
