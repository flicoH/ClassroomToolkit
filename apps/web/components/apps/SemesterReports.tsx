"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clipboard, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { CartoonSemesterReportIcon } from "@/components/icons/CartoonAppIcons";
import request from "@/lib/request";
import { copyText } from "@/lib/clipboard";
import {
  LearningReportView,
  masteryLabels,
  type LearningContent,
  type LearningReportContent
} from "@/components/semester-reports/LearningReportView";
import { ReportStudentPicker } from "@/components/semester-reports/ReportStudentPicker";
import { ScoreDetailsView, type ScoreDetails } from "@/components/semester-reports/ScoreDetailsView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  StudentFeedbackForm,
  emptyStudentFeedback,
  type StudentReportFeedback
} from "@/components/semester-reports/StudentFeedbackForm";

type Term = { id: string; name: string; startDate: string; endDate: string };
type Subject = { id: string; name: string };
type Student = { id: string; name: string; classId: string; className: string; score: number };
type Report = {
  id: string;
  studentName: string;
  className: string;
  period: string;
  status: string;
  content: Record<string, unknown> | null;
  errorMessage?: string;
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
  scoreSummaries: Array<ScoreDetails & { studentId: string; studentName: string }>;
};

const base = "/api/semester-reports";
const mobileReportControls =
  "max-sm:[&_button]:min-h-11 max-sm:[&_button]:min-w-11 max-sm:[&_select]:h-11 max-sm:[&_select]:min-w-0 max-sm:[&_select]:max-w-full max-sm:[&_select]:text-base max-sm:[&_textarea]:text-base max-sm:[&_input:not([type=checkbox]):not([type=file])]:h-11 [&_input]:min-w-0 [&_input]:max-w-full";
const performanceCategories = [
  "课堂任务",
  "看图表达",
  "听指令反应",
  "跟读发音",
  "英语开口",
  "课堂参与",
  "专注情况",
  "进入状态"
];
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
function localDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function errorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { message?: unknown } } }).response;
    if (typeof response?.data?.message === "string") return response.data.message;
  }
  return error instanceof Error ? error.message : "请求失败，请稍后重试。";
}

export function SemesterReports() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [unitDrafts, setUnitDrafts] = useState<Record<string, string>>({});
  const [reviewingDocumentId, setReviewingDocumentId] = useState<string | null>(null);
  const [termId, setTermId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [period, setPeriod] = useState("month");
  const [generationMode, setGenerationMode] = useState("template");
  const [start, setStart] = useState(localDateString(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [end, setEnd] = useState(localDateString(new Date()));
  const [selected, setSelected] = useState<string[]>([]);
  const [keywords, setKeywords] = useState("");
  const [observation, setObservation] = useState("");
  const [reportDetails, setReportDetails] = useState({
    institutionName: "课堂成长记录",
    courseTheme: "",
    lessonNumber: null as number | null,
    lessonDate: ""
  });
  const [studentFeedback, setStudentFeedback] = useState<Record<string, StudentReportFeedback>>({});
  const [feedbackStudentId, setFeedbackStudentId] = useState("");
  const [courseScope, setCourseScope] = useState("");
  const [scopePreview, setScopePreview] = useState<ScopePreview | null>(null);
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
  const [draft, setDraft] = useState<ReportContent | null>(null);
  const [previewingDraft, setPreviewingDraft] = useState(false);
  const [loadingReportId, setLoadingReportId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actingReportId, setActingReportId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [events, setEvents] = useState<Array<{ action: string; createdAt: string }>>([]);

  useEffect(() => {
    if (!editing) return;
    const previous = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setEditing(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [editing]);

  const load = useCallback(async () => {
    const [t, s, p, r, d] = await Promise.all([
      request.get<Term[], Term[]>(`${base}/report-terms`),
      request.get<Subject[], Subject[]>(`${base}/report-subjects`),
      request.get<{ students: Student[] }, { students: Student[] }>("/api/pet-points"),
      request.get<Report[], Report[]>(`${base}/reports`),
      request.get<Document[], Document[]>(`${base}/course-documents`)
    ]);
    setTerms(t);
    setSubjects(s);
    setStudents(p.students);
    setReports(r);
    setDocuments(d);
    setTermId(current => current || t[0]?.id || "");
    setSubjectId(current => current || s[0]?.id || "");
  }, []);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (
        reports.some(r => r.status === "queued" || r.status === "generating") ||
        documents.some(d => d.status === "queued" || d.status === "parsing")
      )
        void load().catch(() => undefined);
    }, 2500);
    return () => clearInterval(timer);
  }, [reports, documents, load]);

  useEffect(() => {
    setScopePreview(null);
    setScopePreviewError("");
    if (!termId || !subjectId || (period !== "term" && courseScope.trim().length < 2)) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void request
        .post<ScopePreview, ScopePreview>(`${base}/course-documents/preview-scope`, {
          period,
          termId,
          subjectId,
          courseScope
        })
        .then(result => {
          if (!cancelled) setScopePreview(result);
        })
        .catch(error => {
          if (!cancelled) setScopePreviewError(errorMessage(error));
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [period, termId, subjectId, courseScope, documents, scopePreviewAttempt]);

  const scorePreviewKey = [period, termId, subjectId, start, end, ...selected].join(":");
  useEffect(() => {
    setScorePreviewError("");
    if (!termId || !subjectId || !selected.length || !start || !end || end < start) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void request
        .post<ScorePreview, ScorePreview>(`${base}/reports/preview-input`, {
          period,
          termId,
          subjectId,
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
  }, [period, termId, subjectId, start, end, selected, scorePreviewKey, scorePreviewAttempt]);

  const availableUnits = [
    ...new Set(
      documents
        .filter(
          document => document.status === "ready" && document.termId === termId && document.subjectId === subjectId
        )
        .flatMap(document => [
          ...(document.units ?? []),
          ...Array.from({ length: Math.min(document.pageCount ?? 0, 100) }, (_, index) => `第${index + 1}页`)
        ])
    )
  ];

  const term = terms.find(t => t.id === termId);
  const selectedStudents = useMemo(() => students.filter(s => selected.includes(s.id)), [students, selected]);
  const feedbackStudent = selectedStudents.find(student => student.id === feedbackStudentId) ?? selectedStudents[0];
  const feedbackKey = feedbackStudent ? `${termId}:${subjectId}:${period}:${start}:${end}:${feedbackStudent.id}` : "";
  const selectedScore =
    scorePreview?.key === scorePreviewKey
      ? scorePreview.data.scoreSummaries.find(summary => summary.studentId === feedbackStudent?.id)
      : undefined;

  function changePeriod(nextPeriod: string, nextTermId = termId) {
    setPeriod(nextPeriod);
    const today = new Date();
    let first = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let last = new Date(first);
    if (nextPeriod === "week") {
      first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
      last = new Date(first);
      last.setDate(last.getDate() + 6);
    } else if (nextPeriod === "month") {
      first = new Date(today.getFullYear(), today.getMonth(), 1);
    } else {
      const selectedTerm = terms.find(item => item.id === nextTermId);
      if (selectedTerm) {
        first = new Date(`${selectedTerm.startDate.slice(0, 10)}T00:00:00`);
        last = new Date(`${selectedTerm.endDate.slice(0, 10)}T00:00:00`);
      }
    }
    if (last > today) last.setTime(today.getTime());
    setStart(localDateString(first));
    setEnd(localDateString(last));
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
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    if (!termId) {
      setMessage("请先新建并选择学期，再上传课程 PDF。");
      return;
    }
    if (!subjectId) {
      setMessage("请先选择学科，再上传课程 PDF。");
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setMessage("PDF 文件不能超过 30MB。");
      return;
    }
    const form = new FormData();
    form.append("file", file);
    form.append("termId", termId);
    form.append("subjectId", subjectId);
    setBusy(true);
    setMessage("正在上传 PDF…");
    try {
      const response = await fetch(`${base}/course-documents`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "上传失败");
      setMessage(
        data.status === "failed"
          ? data.errorMessage
          : data.status === "ready"
            ? "这份 PDF 已存在且解析完成，可在下方选择单元、课时或页码。"
            : "PDF 已上传，正在后台解析；完成后请核对章节，无法识别章节时可按页选择。"
      );
      await load();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
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
        studentIds: selected,
        keywords,
        teacherObservation: observation,
        courseScope,
        reportDetails: { ...reportDetails, lessonDate: reportDetails.lessonDate || end },
        studentFeedback: selected.map(studentId => {
          const value =
            studentFeedback[`${termId}:${subjectId}:${period}:${start}:${end}:${studentId}`] ?? emptyStudentFeedback();
          const allowed = new Set(scopePreview?.learningContents.map(item => item.id) ?? []);
          return {
            ...value,
            studentId,
            learningMastery: Object.fromEntries(
              Object.entries(value.learningMastery).filter(([id]) => allowed.has(id))
            ),
            classroomPerformance: value.classroomPerformance.filter(item => item.value.trim())
          };
        })
      });
      setReports(old => [...result.reports, ...old]);
      setMessage(`已提交 ${result.reports.length} 份报告；可在下方查看状态。`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function actOnReport(report: Report, action: "publish" | "retry" | "delete" | "copy" | "revoke") {
    if (actingReportId) return;
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
        // Reflect successful publishing before attempting the optional clipboard operation.
        setReports(old =>
          old.map(row =>
            row.id === report.id ? { ...row, status: "published", share: { id: result.shareId, url: result.url } } : row
          )
        );
        const copied = await copyText(result.url);
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
      if (action === "revoke" && report.share)
        await request.delete(`${base}/reports/${report.id}/shares/${report.share.id}`);
      if (action === "retry") await request.post(`${base}/reports/${report.id}/retry`);
      await load();
    } catch (error) {
      setMessage(errorMessage(error));
      await load().catch(() => undefined);
    } finally {
      setActingReportId(null);
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
  async function openEdit(report: Report) {
    if (loadingReportId) return;
    setLoadingReportId(report.id);
    setMessage("");
    try {
      const [full, history] = await Promise.all([
        request.get<Report, Report>(`${base}/reports/${report.id}`),
        request.get<Array<{ action: string; createdAt: string }>, Array<{ action: string; createdAt: string }>>(
          `${base}/reports/${report.id}/events`
        )
      ]);
      if (!full.content) throw new Error("报告正文尚未生成，请稍后重试。");
      setEditing(full);
      setPreviewingDraft(full.status !== "draft");
      setDraft(full.content as ReportContent);
      setEvents(history);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoadingReportId(null);
    }
  }
  function setPerformance(category: string, value: string) {
    if (!draft) return;
    const other = (draft.classroomPerformance ?? []).filter(item => !item.text.startsWith(`${category} · `));
    setDraft({
      ...draft,
      classroomPerformance: value.trim()
        ? [...other, { text: `${category} · ${value.trim()}`, sourceRefs: ["teacher-review"] }]
        : other
    });
  }
  function sourceLabel(reference: string) {
    const match = /^course:(.+):p(\d+)$/.exec(reference);
    if (match)
      return `${documents.find(document => document.id === match[1])?.fileName ?? "课程 PDF"} 第 ${match[2]} 页`;
    if (reference === "teacher-review") return "教师核对与评价";
    if (reference === "teacher-input") return "教师填写的学习评价";
    if (reference === "teacher-observation") return "教师观察";
    if (reference.startsWith("score:")) return "综合课堂评价记录";
    return reference;
  }
  async function saveDraft() {
    if (!editing || !draft) return;
    setBusy(true);
    setMessage("");
    try {
      await request.patch(`${base}/reports/${editing.id}/draft`, { content: draft });
      setEditing(null);
      await load();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`${mobileReportControls} h-full min-w-0 overflow-x-hidden overflow-y-auto bg-background p-3 text-foreground sm:p-6`}
    >
      <header className="mb-5 flex items-center gap-3">
        <CartoonSemesterReportIcon className="h-9 w-9 shrink-0" />
        <div>
          <h1 className="text-xl font-semibold">学期报告</h1>
          <p className="text-sm text-muted-foreground">课程 PDF + 综合积分，教师审核后分享给家长</p>
        </div>
      </header>
      {message && <p className="mb-4 rounded-md border bg-muted p-3 text-sm">{message}</p>}
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <section className="min-w-0 space-y-4 rounded-xl border p-3 sm:p-4">
          <h2 className="font-semibold">课程资料</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              className="h-9 rounded-md border bg-background px-2"
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
            <select
              className="h-9 rounded-md border bg-background px-2"
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
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input placeholder="学科名称（必填）" value={newSubject} onChange={e => setNewSubject(e.target.value)} />
            <Button disabled={busy || !newSubject.trim()} variant="outline" onClick={() => void createSubject()}>
              <Plus />
              添加学科
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder="学期名称（必填）" value={newTermName} onChange={e => setNewTermName(e.target.value)} />
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
          {term && (
            <p className="text-xs text-muted-foreground">
              当前学期：{term.startDate} 至 {term.endDate}
            </p>
          )}
          <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed p-4 text-sm hover:bg-muted">
            {!termId
              ? "请先新建并选择学期，再上传课程 PDF"
              : !subjectId
                ? "请先选择学科，再上传课程 PDF"
                : "选择课程 PDF（最大 30MB）"}
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
          <div className="space-y-2">
            {documents
              .filter(d => (!termId || d.termId === termId) && (!subjectId || d.subjectId === subjectId))
              .map(doc => (
                <div key={doc.id} className="rounded-md bg-muted/60 p-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
                      {doc.fileName} · {labels[doc.status] ?? doc.status}
                      {doc.errorMessage ? ` · ${doc.errorMessage}` : ""}
                    </span>
                    <div className="flex shrink-0 flex-wrap gap-1">
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
                        <Button size="sm" variant="outline" onClick={() => void documentAction(doc.id, "retry")}>
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
                      </Button>
                    </div>
                  </div>
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
          </div>
        </section>
        <section className="min-w-0 space-y-4 rounded-xl border p-3 sm:p-4">
          <h2 className="font-semibold">生成报告</h2>
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
          <label className="block space-y-1 text-sm">
            <span>生成方式</span>
            <select
              className="h-9 w-full rounded-md border bg-background px-2"
              value={generationMode}
              onChange={e => setGenerationMode(e.target.value)}
            >
              <option value="template">本地模板（无需 AI）</option>
              <option value="ai">AI 生成（需配置模型服务）</option>
            </select>
          </label>
          {generationMode === "template" && (
            <p className="text-xs text-muted-foreground">
              按下方填写的掌握评价、课堂表现和寄语整理报告，结合综合积分生成可审核草稿。
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
              <option value="term">每学期</option>
            </select>
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
            <label className="space-y-1 text-sm">
              周期开始日期
              <Input type="date" value={start} onChange={e => setStart(e.target.value)} />
            </label>
            <label className="space-y-1 text-sm">
              周期结束日期
              <Input type="date" value={end} onChange={e => setEnd(e.target.value)} />
            </label>
          </div>
          <ReportStudentPicker students={students} selected={selected} onChange={setSelected} />
          <textarea
            className="min-h-16 w-full rounded-md border bg-background p-2 text-sm"
            placeholder={
              period === "term"
                ? "学期报告默认覆盖整份已确认课程资料"
                : "本周期已授课范围（可选单元、课时，也可填第3页或第3-5页）"
            }
            value={courseScope}
            maxLength={1000}
            onChange={e => {
              setCourseScope(e.target.value);
              setMessage("");
            }}
          />
          {period !== "term" && availableUnits.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">从课程 PDF 选择单元、课时或页码，可选择多个：</p>
              <p className="text-xs text-muted-foreground">
                页码可手动填写范围，例如“第101-120页”；同学科有多份 PDF 时，请核对下方的命中页预览。
              </p>
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
          {scopePreview && (
            <div className="rounded-md border p-2 text-xs" aria-live="polite">
              {scopePreview.totalPages > 0 ? (
                scopePreview.documents.map(document => (
                  <p key={document.id}>
                    {document.fileName} · 命中 PDF 第 {document.pages.join("、")} 页
                  </p>
                ))
              ) : (
                <p>未匹配到 PDF 页面，请选择上方单元、课时或页码，也可以填写“第3页”或“第3-5页”。</p>
              )}
            </div>
          )}
          {scopePreview && scopePreview.learningContents?.length > 0 && !selectedStudents.length && (
            <section className="space-y-3 rounded-xl border bg-indigo-50/30 p-3" aria-live="polite">
              <h3 className="text-sm font-semibold">已选学习内容 · {scopePreview.totalLearningContents} 项</h3>
              <p className="text-xs text-muted-foreground">
                以下内容来自所选单元或课时。选择学生后，即可在下方逐项填写掌握情况。
              </p>
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {scopePreview.learningContents.map(item => (
                  <div key={item.id} className="rounded-lg border bg-background p-3">
                    <p className="mb-1 text-xs font-semibold text-indigo-600">{item.section}</p>
                    <p className="whitespace-pre-wrap text-sm leading-6">{item.text}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.sourceRefs
                        .map(ref => {
                          const match = /^course:(.+):p(\d+)$/.exec(ref);
                          const document = scopePreview.documents.find(doc => doc.id === match?.[1]);
                          return document ? `${document.fileName} 第 ${match?.[2]} 页` : "课程资料";
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
          {scopePreview && scopePreview.totalPages > 0 && !scopePreview.learningContents?.length && (
            <p className="text-xs text-amber-700">
              已匹配页面，但未提取到该单元的学习内容；请检查 PDF 的表格或章节格式。
            </p>
          )}
          {scopePreviewError && (
            <div className="flex items-center gap-2">
              <p className="text-xs text-destructive">{scopePreviewError}</p>
              <Button size="sm" variant="outline" onClick={() => setScopePreviewAttempt(current => current + 1)}>
                重新加载学习内容
              </Button>
            </div>
          )}
          {!scopePreview && !scopePreviewError && (period === "term" || courseScope.trim().length >= 2) && (
            <p className="text-xs text-muted-foreground">正在加载所选学习内容…</p>
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
              <div className="rounded-xl border bg-slate-50 p-3" aria-live="polite">
                <h4 className="mb-2 text-sm font-semibold">{feedbackStudent.name} · 本期积分加减情况</h4>
                {selectedScore ? (
                  <ScoreDetailsView key={feedbackStudent.id} details={selectedScore} />
                ) : scorePreviewError ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm text-destructive">积分预览失败：{scorePreviewError}</p>
                    <Button size="sm" variant="outline" onClick={() => setScorePreviewAttempt(value => value + 1)}>
                      重试
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">正在读取所选日期内的加减分记录…</p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">生成时会重新读取积分并固定在报告中。</p>
              </div>
              <StudentFeedbackForm
                key={feedbackKey}
                student={feedbackStudent}
                subject={subjects.find(subject => subject.id === subjectId)?.name ?? ""}
                learningContents={scopePreview?.learningContents ?? []}
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
              请先选择学生，再填写掌握评价、课堂表现和老师寄语。
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
            积分依据为周期综合评价记录，不代表所选学科的掌握程度。课程资料须先解析并确认。
          </p>
          <Button
            disabled={
              busy ||
              !scopePreview ||
              scopePreview.courseScope !== courseScope.trim() ||
              !termId ||
              !subjectId ||
              selected.length === 0 ||
              !start ||
              !end ||
              end < start ||
              (reportDetails.lessonDate !== "" &&
                (reportDetails.lessonDate < start || reportDetails.lessonDate > end)) ||
              (reportDetails.lessonNumber !== null &&
                (!Number.isInteger(reportDetails.lessonNumber) ||
                  reportDetails.lessonNumber < 1 ||
                  reportDetails.lessonNumber > 999)) ||
              (period !== "term" && courseScope.trim().length < 2) ||
              (period !== "term" &&
                scopePreview?.courseScope === courseScope.trim() &&
                scopePreview.totalPages === 0) ||
              (scopePreview?.totalLearningContents ?? 0) > 500
            }
            className="w-full sm:w-auto"
            onClick={() => void generate()}
          >
            <RefreshCw />
            生成 {selectedStudents.length} 份报告
          </Button>
        </section>
      </div>
      <section className="mt-6 min-w-0 rounded-xl border p-3 sm:p-4">
        <h2 className="mb-3 font-semibold">报告与流程</h2>
        <div className="space-y-2">
          {reports.map(report => (
            <article key={report.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 p-3">
              <div className="min-w-0 basis-full break-words sm:flex-1 sm:basis-auto">
                <p className="font-medium">
                  {report.className} · {report.studentName} · {labels[report.period] ?? report.period}
                </p>
                <p className="text-xs text-muted-foreground">
                  {labels[report.status] ?? report.status}
                  {report.generationMode === "template"
                    ? " · 本地模板"
                    : report.generationMode === "ai"
                      ? " · AI 生成"
                      : ""}
                  {report.errorMessage ? ` · ${report.errorMessage}` : ""}
                </p>
              </div>
              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
                {(report.status === "draft" || report.status === "published") && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!loadingReportId}
                    onClick={() => void openEdit(report)}
                  >
                    {report.status === "draft" ? "预览 / 编辑" : "查看流程"}
                  </Button>
                )}
                {report.status === "draft" && (
                  <Button size="sm" disabled={!!actingReportId} onClick={() => void actOnReport(report, "publish")}>
                    发布并复制链接
                  </Button>
                )}
                {report.status === "failed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!actingReportId}
                    onClick={() => void actOnReport(report, "retry")}
                  >
                    重试
                  </Button>
                )}
                {report.status === "published" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!actingReportId}
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
                    disabled={!!actingReportId}
                    onClick={() => void actOnReport(report, "revoke")}
                  >
                    撤销链接
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="删除报告"
                  disabled={!!actingReportId}
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
          {reports.length === 0 && <p className="text-sm text-muted-foreground">还没有报告。</p>}
        </div>
      </section>
      {editing &&
        draft &&
        createPortal(
          <div
            className={`${mobileReportControls} fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 sm:p-4`}
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
                <details className="rounded-lg border p-3 text-sm" open={editing.status !== "draft"}>
                  <summary className="cursor-pointer font-medium">流程记录</summary>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {events.map((event, index) => (
                      <li key={index}>
                        {event.action} · {new Date(event.createdAt).toLocaleString()}
                      </li>
                    ))}
                  </ul>
                  {!events.length && <p className="mt-2 text-xs text-muted-foreground">暂无流程记录。</p>}
                </details>
                {message && (
                  <p className="rounded-md border p-3 text-sm" role="status">
                    {message}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
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
                {previewingDraft ? (
                  <LearningReportView
                    report={{
                      studentName: editing.studentName,
                      className: editing.className,
                      subject: subjects.find(subject => subject.id === editing.subjectId)?.name ?? "",
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
                    <section className="space-y-3">
                      <h3 className="font-semibold">本期学习内容与掌握</h3>
                      <p className="text-xs text-muted-foreground">
                        学习目标来自课程 PDF；掌握情况请依据实际课堂观察逐项填写，默认待评价。
                      </p>
                      {(draft.learningContents ?? []).map((item, index) => (
                        <div key={item.id} className="space-y-2 rounded-lg border p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-indigo-600">{item.section}</p>
                            <select
                              aria-label={`${item.section} 学习内容 ${index + 1} 掌握情况`}
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
                    <section className="space-y-3">
                      <h3 className="font-semibold">本期的课堂表现</h3>
                      <p className="text-xs text-muted-foreground">
                        仅填写实际观察，如“基本完成”“能说词”“引导参与”；留空的项目不会展示。
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {performanceCategories.map(original => {
                          const category =
                            original === "英语开口" &&
                            !subjects.find(subject => subject.id === editing.subjectId)?.name.includes("英")
                              ? "学科表达"
                              : original;
                          return (
                            <label key={category} className="space-y-1 text-sm">
                              {category}
                              <Input
                                maxLength={100}
                                value={
                                  (draft.classroomPerformance ?? [])
                                    .find(item => item.text.startsWith(`${category} · `))
                                    ?.text.slice(category.length + 3) ?? ""
                                }
                                placeholder="填写实际课堂表现"
                                onChange={event => setPerformance(category, event.target.value)}
                              />
                            </label>
                          );
                        })}
                      </div>
                    </section>
                    <label className="block space-y-1 text-sm font-medium">
                      老师想对你说
                      <textarea
                        className="min-h-20 w-full rounded-md border bg-background p-3 font-normal"
                        value={draft.summary}
                        readOnly={editing.status !== "draft"}
                        onChange={e => setDraft({ ...draft, summary: e.target.value })}
                      />
                    </label>
                    {(
                      [
                        ["本期最值得肯定", "strengths"],
                        ["下一步重点", "areasToImprove"],
                        ["回家可以这样练", "homeSuggestions"]
                      ] as const
                    ).map(([title, key]) => (
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
                              <p className="text-xs text-muted-foreground">
                                依据：{entry.sourceRefs.map(sourceLabel).join("、")}
                              </p>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDraft({ ...draft, [key]: draft[key].filter((_, i) => i !== index) })}
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
                            setDraft({ ...draft, [key]: [...draft[key], { text: "", sourceRefs: ["teacher-review"] }] })
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
