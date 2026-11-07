"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import type {
  LearningReportContent,
  LearningReportData,
  ReportEntry
} from "@/components/semester-reports/LearningReportView";
import {
  SubjectLessonFields,
  SubjectLessonPdfFill,
  subjectLessonCategories
} from "@/components/subject-reports/SubjectLessonPdfFill";
import { CourseAttendance, type CourseAttendanceStatus } from "@/components/semester-reports/CourseAttendance";
import { LearningReportView } from "@/components/semester-reports/LearningReportView";
import { ReportHistory } from "@/components/semester-reports/ReportHistory";
import { V2ClassroomPerformance, type V2Subject, type PerformanceRating } from "./V2ClassroomPerformance";
import { growthDimensions, emptyGrowthAssessment } from "@/components/semester-reports/GrowthAssessmentFields";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import request from "@/lib/request";
import { createUuid } from "@/lib/id";
import { X, History, Sparkles, AlertCircle, Plus, Trash2, CheckCircle2 } from "lucide-react";

const base = "/api/semester-reports";

/** 传递给草稿微调弹窗的报告模型，支持版本标识与起止时间 */
export type DraftModalReport = {
  id: string;
  studentName: string;
  className: string;
  period: "week" | "month" | "term" | "stage";
  status: string;
  startDate?: string;
  endDate?: string;
  reportVersion?: "v1" | "v2";
  isStageReport?: boolean;
  isSubjectReport?: boolean;
  stageCustomName?: string;
  content: LearningReportContent;
};

/**
 * 草稿编辑与 1:1 实时长图预览模态弹窗
 *
 * 核心设计：
 * 1. 左栏录入与微调（老师寄语、预设课堂表现胶囊、成长四大维度、课次主题）；
 * 2. 右栏 1:1 无损渲染真实家长端页面（LearningReportView），编辑实时联动，杜绝发布后样式变形；
 * 3. 严格遵循弹窗规范：提供明显的关闭按钮、键盘 Esc / Tab 焦点循环，支持移动端编辑/预览标签切换；
 * 4. 内置版本历史抽屉（ReportHistory），支持恢复至过往保存的草稿修订版本。
 */
function replaceStageTerms<T>(data: T, customName?: string): T {
  if (!customName || customName.trim() === "" || customName.trim() === "本阶段") {
    return data;
  }
  const target = customName.trim();
  if (typeof data === "string") {
    let s: string = data;
    s = s.replaceAll("本阶段", target);
    s = s.replaceAll("所选阶段", target);
    s = s.replaceAll("该阶段", target);
    s = s.replaceAll("此阶段", target);
    s = s.replaceAll("阶段内", `${target}内`);
    s = s.replaceAll("阶段学习", `${target}学习`);
    s = s.replaceAll("阶段成长", `${target}成长`);
    s = s.replaceAll("阶段汇总", `${target}汇总`);
    s = s.replaceAll("阶段总结", `${target}总结`);
    s = s.replaceAll("阶段报告", target.endsWith("报告") ? target : `${target}报告`);
    return s as unknown as T;
  }
  if (Array.isArray(data)) {
    return data.map(item => replaceStageTerms(item, target)) as unknown as T;
  }
  if (data && typeof data === "object") {
    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      res[k] = replaceStageTerms(v, target);
    }
    return res as unknown as T;
  }
  return data;
}

type SubjectDraftPdf = { draftId: string; termId: string; subjectId: string; hasDocuments: boolean; units: string[] };

const lessonPrefix = /^第\s*(\d+)\s*节课\s*·\s*/;

function courseLineLesson(line: string) {
  return Number(lessonPrefix.exec(line)?.[1] ?? 1);
}

const lessonFieldPrefixes = subjectLessonCategories.map(category => `${category}：`);

function readLessonFields(content: string) {
  const lines = content.split("\n");
  return {
    fields: lessonFieldPrefixes.map(prefix =>
      lines
        .filter(line => line.startsWith(prefix))
        .map(line => line.slice(prefix.length))
        .join("\n")
    ),
    other: lines.filter(line => !lessonFieldPrefixes.some(prefix => line.startsWith(prefix))).join("\n")
  };
}

function writeLessonFields(fields: string[], other: string) {
  return [
    other,
    ...fields.flatMap((value, index) => (value ? value.split("\n").map(line => lessonFieldPrefixes[index] + line) : []))
  ]
    .filter(Boolean)
    .join("\n");
}

function SubjectDraftLessonContent({
  lesson,
  value,
  onChange,
  pdf,
  period
}: {
  lesson: number;
  value: string;
  onChange: (update: (current: string) => string) => void;
  pdf?: SubjectDraftPdf;
  period: DraftModalReport["period"];
}) {
  const [scope, setScope] = useState("");
  const lastImport = useRef<string[]>([]);
  const manuallyEdited = useRef(new Set<number>());
  const { fields, other } = readLessonFields(value);
  const [showOther] = useState(Boolean(other));
  const otherId = lesson === 1 ? "subject-draft-course-content" : `subject-draft-legacy-content-${lesson}`;
  const id = lesson === 1 ? "subject-draft-course-content" : `subject-draft-course-content-${lesson}`;
  return (
    <div className="space-y-2">
      {pdf && (
        <SubjectLessonPdfFill
          {...pdf}
          period={period}
          scope={scope}
          onScopeChange={setScope}
          onFill={groups => {
            const imported = groups.map(lines => lines.join("\n"));
            const previousImport = lastImport.current;
            const edited = new Set(manuallyEdited.current);
            lastImport.current = imported;
            onChange(current => {
              const { fields, other } = readLessonFields(current);
              // PDF 只更新空字段或上次带入的值，保留教师填写的字段。
              return writeLessonFields(
                fields.map((value, index) =>
                  !edited.has(index) && (!value || value === previousImport[index]) ? (imported[index] ?? "") : value
                ),
                other
              );
            });
          }}
        />
      )}
      <SubjectLessonFields
        id={id}
        values={fields}
        onChange={(index, value) => {
          manuallyEdited.current.add(index);
          onChange(current => {
            const { fields, other } = readLessonFields(current);
            fields[index] = value;
            return writeLessonFields(fields, other);
          });
        }}
      />
      {showOther && (
        <div>
          <label htmlFor={otherId} className="block text-[11px] font-medium text-muted-foreground">
            原有课程内容
          </label>
          <Textarea
            id={otherId}
            value={other}
            onChange={event => {
              const text = event.target.value;
              onChange(current => writeLessonFields(readLessonFields(current).fields, text));
            }}
            rows={4}
          />
        </div>
      )}
    </div>
  );
}

export function DraftEditModal({
  report,
  allAvailableSubjects,
  subjectReport = false,
  subjectPdf,
  isOpen,
  onClose,
  onSave,
  onPublish,
  busy = false
}: {
  report: DraftModalReport;
  allAvailableSubjects: V2Subject[];
  subjectReport?: boolean;
  subjectPdf?: SubjectDraftPdf;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedContent: LearningReportContent) => Promise<boolean | void>;
  onPublish: (updatedContent: LearningReportContent) => Promise<boolean | void>;
  busy?: boolean;
}) {
  function normalizeContent(raw?: LearningReportContent, fallbackVersion?: "v1" | "v2"): LearningReportContent {
    const baseContent = raw || ({} as LearningReportContent);
    const rawContent = baseContent as unknown as { subjects?: string[]; reportVersion?: string };
    const rawAreas = (baseContent.areasToImprove || []) as Array<ReportEntry | string>;
    const normalizedAreas: ReportEntry[] = rawAreas.map(item =>
      typeof item === "string" ? { text: item, sourceRefs: [] } : item
    );
    // 判断是否为 v1 报告：若明确指定为 v1 则为 v1（reportVersion 设为 undefined），默认视为 v2
    const isV1 = fallbackVersion === "v1" || rawContent.reportVersion === "v1";
    const reportVersion: "v2" | undefined = isV1 ? undefined : "v2";
    const stageCustomName =
      report.stageCustomName ||
      (baseContent as { stageCustomName?: string })?.stageCustomName ||
      (baseContent as { stageTitle?: string })?.stageTitle;

    // 旧报告可能只有一项出勤，课程正文中的后续课次仍须完整展示。
    let initialAttendances = baseContent.attendances;
    if (subjectReport) {
      const lessonNumbers = [...(baseContent.courseContent ?? "").matchAll(/^第\s*(\d+)\s*节课/gm)]
        .map(match => Number(match[1]))
        .filter(number => number >= 1 && number <= 30);
      const count = Math.max(1, initialAttendances?.length ?? 0, ...lessonNumbers);
      initialAttendances = Array.from(
        { length: count },
        (_, index) => baseContent.attendances?.[index] ?? baseContent.attendance ?? "present"
      );
    }

    let resContent: LearningReportContent = {
      ...baseContent,
      ...(subjectReport
        ? {
            attendance: initialAttendances?.[0] ?? baseContent.attendance ?? "present",
            attendances: initialAttendances ?? [baseContent.attendance ?? "present"]
          }
        : {}),
      reportVersion,
      summary: baseContent.summary || "",
      areasToImprove: normalizedAreas,
      stageCustomName,
      stageTitle: stageCustomName,
      reportSubjects:
        baseContent.reportSubjects ||
        (rawContent.subjects || []).map((name: string) => ({
          subjectId: allAvailableSubjects.find(s => s.name === name)?.id || name,
          name
        }))
    };

    if (stageCustomName) {
      resContent = replaceStageTerms(resContent, stageCustomName);
    }

    return resContent;
  }

  // 本地正在编辑的草稿内容状态
  const [content, setContent] = useState<LearningReportContent>(() =>
    normalizeContent(report.content, report.reportVersion)
  );
  const isV2 = content.reportVersion === "v2";
  const [activeSubjectId, setActiveSubjectId] = useState<string>(() => {
    return report.content.reportSubjects?.[0]?.subjectId || allAvailableSubjects[0]?.id || "english";
  });
  const [showHistory, setShowHistory] = useState(false);
  const [historyKey, setHistoryKey] = useState({});
  const [addSubjectDropdownOpen, setAddSubjectDropdownOpen] = useState(false);
  const [subjectBusy, setSubjectBusy] = useState(false);
  const [subjectError, setSubjectError] = useState<string | null>(null);
  // 学科报告的修改由工作台统一保存，避免调用学期报告的学科接口。
  const persistSubjects = !subjectReport && isV2 && !report.id.startsWith("gen-");
  const [mobileTab, setMobileTab] = useState<"edit" | "preview">("edit");
  const [photoError, setPhotoError] = useState<string | null>(null);

  // 快捷常用教师鼓励语
  const quickPhrases = [
    "在小组合作中展现了极佳的倾听与互助精神！",
    "课堂发言积极主动，逻辑清晰，表现优异！",
    "探究实验细致入微，善于观察并提出启发性问题！"
  ];

  const [prevReport, setPrevReport] = useState(report);
  if (report !== prevReport) {
    setPrevReport(report);
    setContent(normalizeContent(report.content, report.reportVersion));
    if (report.content.reportSubjects?.[0]?.subjectId) {
      setActiveSubjectId(report.content.reportSubjects[0].subjectId);
    }
    setShowHistory(false);
    setMobileTab(report.status === "published" ? "preview" : "edit");
    setPhotoError(null);
  }

  // 草稿积分允许实时从详情刷新，但不能用详情响应覆盖老师正在编辑的寄语、评价或照片说明
  useEffect(() => {
    if (subjectReport || !isOpen || !report.id || report.id.startsWith("gen-") || !isV2 || report.status !== "draft")
      return;
    let cancelled = false;
    request
      .get<{ content?: LearningReportContent }, { content?: LearningReportContent }>(`${base}/reports/${report.id}`, {
        params: { refresh: createUuid() }
      })
      .then(full => {
        if (cancelled || !full?.content?.scoreDetails) return;
        const serverScoreDetails = full.content.scoreDetails;
        setContent(curr => {
          if (curr.scoreDetails?.positiveItems?.length && !serverScoreDetails.positiveItems?.length) {
            return curr;
          }
          return { ...curr, scoreDetails: serverScoreDetails };
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [subjectReport, isOpen, report.id, isV2, report.status]);

  // 监听 Escape 键关闭
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // 当前报告包含的学科列表
  const currentReportSubjects = useMemo(() => {
    const list = content.reportSubjects || [];
    return list.map(sub => {
      const found = allAvailableSubjects.find(s => s.id === sub.subjectId);
      return {
        id: sub.subjectId,
        name: sub.name,
        performanceConfig: found?.performanceConfig || null
      };
    });
  }, [content.reportSubjects, allAvailableSubjects]);

  // 未选中的学科列表（可添加）
  const unselectedSubjects = useMemo(() => {
    const selectedIds = new Set((content.reportSubjects || []).map(s => s.subjectId));
    return allAvailableSubjects.filter(s => !selectedIds.has(s.id));
  }, [content.reportSubjects, allAvailableSubjects]);

  // 课堂照片 ref
  const photoInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const classroomPhotos = useMemo(() => {
    return [content.classroomPhotos?.[0] ?? content.classroomPhoto ?? null, content.classroomPhotos?.[1] ?? null];
  }, [content.classroomPhotos, content.classroomPhoto]);

  // 课堂表现 ratings 转换
  const performanceRatings: PerformanceRating[] = useMemo(() => {
    const entries = content.classroomPerformance || [];
    const defaultSubId = currentReportSubjects[0]?.id || "english";
    return entries.map(e => {
      const separator = e.text.indexOf(" · ");
      return {
        subjectId: e.subjectId || defaultSubId,
        label: separator < 0 ? e.text : e.text.slice(0, separator),
        value: separator < 0 ? "" : e.text.slice(separator + 3)
      };
    });
  }, [content.classroomPerformance, currentReportSubjects]);

  function handlePerformanceChange(nextRatings: PerformanceRating[]) {
    const defaultSubId = currentReportSubjects[0]?.id || "english";
    const nextEntries: ReportEntry[] = nextRatings.map(r => ({
      subjectId: r.subjectId || defaultSubId,
      text: `${r.label} · ${r.value}`,
      sourceRefs: ["teacher-review"]
    }));
    setContent(prev => ({
      ...prev,
      classroomPerformance: nextEntries
    }));
  }

  async function handleAddSubject(subject: V2Subject) {
    if (subjectBusy || currentReportSubjects.some(item => item.id === subject.id)) return;
    setAddSubjectDropdownOpen(false);
    setSubjectError(null);
    setSubjectBusy(true);
    try {
      // 保存评价时后端按快照校验学科，先登记学科，再开放该科的评价。
      const updated = persistSubjects
        ? await request.post<unknown, { content: LearningReportContent }>(
            `${base}/reports/${report.id}/course-subjects`,
            {
              courseSelections: [{ subjectId: subject.id, courseScope: "", manualContent: "" }]
            }
          )
        : null;
      setContent(prev => ({
        ...prev,
        reportSubjects: updated
          ? updated.content.reportSubjects
          : [...(prev.reportSubjects ?? []), { subjectId: subject.id, name: subject.name }]
      }));
      setActiveSubjectId(subject.id);
      if (updated) setHistoryKey({});
    } catch (error) {
      const message = (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
      setSubjectError(typeof message === "string" ? message : "添加学科失败，请重试。");
    } finally {
      setSubjectBusy(false);
    }
  }

  async function handleRemoveSubject(subjectId: string) {
    if (subjectBusy || currentReportSubjects.length <= 1) return;
    setSubjectError(null);
    setSubjectBusy(true);
    try {
      const result = persistSubjects
        ? await request.delete<unknown, { report: { content: LearningReportContent }; removedReferences: string[] }>(
            `${base}/reports/${report.id}/course-subjects/${encodeURIComponent(subjectId)}`
          )
        : null;
      const remaining = result
        ? (result.report.content.reportSubjects ?? [])
        : (content.reportSubjects ?? []).filter(subject => subject.subjectId !== subjectId);
      const removed = new Set(result?.removedReferences);
      const keepEntry = (entry: ReportEntry) => !entry.sourceRefs.some(ref => removed.has(ref));
      const remainingLearningIds = new Set(result?.report.content.learningContents?.map(item => item.id));
      setContent(prev => ({
        ...prev,
        reportSubjects: remaining,
        classroomPerformance: prev.classroomPerformance?.filter(
          item => item.subjectId !== subjectId && keepEntry(item)
        ),
        ...(result && {
          learningContents: prev.learningContents?.filter(item => remainingLearningIds.has(item.id)),
          strengths: prev.strengths?.filter(keepEntry),
          areasToImprove: prev.areasToImprove?.filter(keepEntry),
          homeSuggestions: prev.homeSuggestions?.filter(keepEntry)
        })
      }));
      if (activeSubjectId === subjectId) setActiveSubjectId(remaining[0]?.subjectId ?? "");
      if (result) setHistoryKey({});
    } catch (error) {
      const message = (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
      setSubjectError(typeof message === "string" ? message : "移除学科失败，请重试。");
    } finally {
      setSubjectBusy(false);
    }
  }

  // 老师寄语相关
  function handleSummaryChange(summary: string) {
    setContent(prev => ({ ...prev, summary }));
  }

  function handleAppendPhrase(phrase: string) {
    const cur = (content.summary || "").trim();
    const next = cur ? `${cur} ${phrase}` : phrase;
    setContent(prev => ({ ...prev, summary: next }));
  }

  // 下一步重点相关（规则：上限8条）
  function handleAddFocusItem() {
    const items = content.areasToImprove || [];
    if (items.length >= 8) return;
    setContent(prev => ({
      ...prev,
      areasToImprove: [...items, { text: "", sourceRefs: ["teacher-review"] }]
    }));
  }

  function handleUpdateFocusItem(index: number, text: string) {
    const items = [...(content.areasToImprove || [])];
    if (!items[index]) return;
    items[index] = { ...items[index], text };
    setContent(prev => ({ ...prev, areasToImprove: items }));
  }

  function handleRemoveFocusItem(index: number) {
    const items = (content.areasToImprove || []).filter((_, i) => i !== index);
    setContent(prev => ({ ...prev, areasToImprove: items }));
  }

  // 课堂照片上传与移除
  function handlePhotoUpload(slot: number, file: File | null) {
    if (!file) return;

    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setPhotoError("文件格式不支持：请上传 JPG 或 PNG 格式的课堂照片");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      setPhotoError(`照片大小超出限制：当前文件约 ${sizeMb}MB，课堂照片每张最大不能超过 2MB，请压缩后重新上传。`);
      return;
    }

    // 清除上一次的错误信息
    setPhotoError(null);

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setContent(prev => {
        const p0 = slot === 0 ? dataUrl : (prev.classroomPhotos?.[0] ?? prev.classroomPhoto ?? null);
        const p1 = slot === 1 ? dataUrl : (prev.classroomPhotos?.[1] ?? null);
        return {
          ...prev,
          classroomPhoto: p0,
          classroomPhotos: [p0, p1]
        };
      });
    };
    reader.readAsDataURL(file);

    if (report.id && !report.id.startsWith("gen-")) {
      const form = new FormData();
      form.append("file", file);
      request
        .post(`/api/semester-reports/reports/${report.id}/classroom-photo${slot === 1 ? "?slot=1" : ""}`, form, {
          headers: { "Content-Type": undefined }
        })
        .catch(err => {
          const msg = err?.response?.data?.message || "上传课堂照片失败，请检查文件大小（最大 2MB）或重试";
          setPhotoError(typeof msg === "string" ? msg : "上传课堂照片失败，请检查文件大小（最大 2MB）");
        });
    }
  }

  function handleRemovePhoto(slot: number) {
    setPhotoError(null);
    setContent(prev => {
      const p0 = slot === 0 ? null : (prev.classroomPhotos?.[0] ?? prev.classroomPhoto ?? null);
      const p1 = slot === 1 ? null : (prev.classroomPhotos?.[1] ?? null);
      const captions = [
        slot === 0 ? "" : prev.classroomPhotoCaptions?.[0] || "",
        slot === 1 ? "" : prev.classroomPhotoCaptions?.[1] || ""
      ];
      return {
        ...prev,
        classroomPhoto: p0,
        classroomPhotos: [p0, p1],
        classroomPhotoCaptions: captions
      };
    });
    if (report.id && !report.id.startsWith("gen-")) {
      request
        .delete(`/api/semester-reports/reports/${report.id}/classroom-photo${slot === 1 ? "?slot=1" : ""}`)
        .catch(() => null);
    }
  }

  function handlePhotoCaptionChange(slot: number, caption: string) {
    const clean = caption.slice(0, 10);
    setContent(prev => {
      const captions = [
        slot === 0 ? clean : prev.classroomPhotoCaptions?.[0] || "",
        slot === 1 ? clean : prev.classroomPhotoCaptions?.[1] || ""
      ];
      return {
        ...prev,
        classroomPhotoCaptions: captions
      };
    });
  }

  // ⭐ 本期最值得肯定
  function handleStrengthsChange(text: string) {
    setContent(prev => ({
      ...prev,
      strengths: [{ text, sourceRefs: ["teacher-review"] }]
    }));
  }

  // 回家可以这样练
  function handleHomeSuggestionsChange(text: string) {
    setContent(prev => ({
      ...prev,
      homeSuggestions: [{ text, sourceRefs: ["teacher-review"] }]
    }));
  }

  // 实时长图预览数据组装
  const liveReportData: LearningReportData = useMemo(() => {
    return {
      id: report.id,
      studentName: report.studentName,
      className: report.className,
      period: report.isStageReport || report.period === "stage" ? "stage" : report.period,
      isStageReport: report.isStageReport ?? report.period === "stage",
      isSubjectReport: subjectReport || Boolean(report.isSubjectReport),
      stageCustomName: report.stageCustomName || content.stageCustomName || content.stageTitle,
      term: content.reportDetails?.institutionName || "课堂成长记录",
      subject: (content.reportSubjects || []).map(s => s.name).join("、") || "综合",
      start: report.startDate,
      end: report.endDate,
      status: report.status,
      content: {
        ...content,
        stageCustomName: report.stageCustomName || content.stageCustomName || content.stageTitle,
        stageTitle: report.stageCustomName || content.stageTitle || content.stageCustomName,
        reportVersion: isV2 ? "v2" : undefined
      }
    };
  }, [report, content, isV2, subjectReport]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${report.studentName}的${report.status === "published" ? "报告内容与流程" : "学期报告草稿编辑"}`}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 p-0 sm:p-3 md:p-6 backdrop-blur-xs"
    >
      <div className="flex h-full sm:h-[94vh] max-h-full sm:max-h-[96vh] w-full max-w-[1440px] flex-col overflow-hidden rounded-none sm:rounded-2xl border bg-card text-card-foreground shadow-2xl">
        {/* 顶部标题栏 */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2.5 border-b bg-muted/30 p-3 sm:px-5">
          <div className="flex items-center gap-2.5">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold sm:text-base">
                <span>
                  {report.studentName} · {report.status === "published" ? "报告内容与流程" : "报告草稿微调"}
                </span>
                {report.status === "published" ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    已发布 (公开)
                  </span>
                ) : report.isStageReport || report.period === "stage" ? (
                  <span className="rounded-full border border-purple-200 bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300">
                    ✨ AI 阶段汇总草稿
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    草稿状态
                  </span>
                )}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground hidden sm:block">
                {report.status === "published"
                  ? "查看已发布报告详情与 1:1 家长端效果；如需修改可先撤回为草稿"
                  : "所填内容实时镜像同步至右侧 1:1 家长端长图；支持历史修订对比与一键还原"}
              </p>
            </div>
          </div>

          {/* 移动端视口下的表单/预览切换按钮 */}
          <div className="flex md:hidden items-center rounded-xl border bg-muted/60 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setMobileTab("edit")}
              className={`rounded-lg px-3 py-1 transition ${
                mobileTab === "edit"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              ✏️ 编辑表单
            </button>
            <button
              type="button"
              onClick={() => setMobileTab("preview")}
              className={`rounded-lg px-3 py-1 transition ${
                mobileTab === "preview"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              📱 报告预览
            </button>
          </div>

          <div className="flex items-center gap-2">
            {!subjectReport && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowHistory(prev => !prev)}
                className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
              >
                <History className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{showHistory ? "隐藏历史流水" : "流程记录与版本恢复"}</span>
                <span className="sm:hidden">历史</span>
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="关闭编辑窗口"
              onClick={onClose}
              className="h-8 w-8 rounded-lg"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 主编辑区：左侧表单微调，右侧 1:1 长图预览 */}
        <div className="grid flex-1 min-h-0 grid-cols-1 overflow-hidden md:grid-cols-2 lg:grid-cols-[1fr_1.1fr]">
          {/* 左侧表单 */}
          <div
            className={`space-y-4 overflow-y-auto h-full p-3.5 sm:p-5 ${
              mobileTab === "edit" ? "block" : "hidden md:block"
            }`}
            tabIndex={0}
            aria-label="报告表单微调区"
          >
            {/* 规则 1：流程记录与恢复抽屉 */}
            {showHistory && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3.5 dark:border-indigo-900/50 dark:bg-indigo-950/30">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-xs font-bold text-indigo-950 dark:text-indigo-200">
                    <History className="h-4 w-4 text-indigo-600" />
                    <span>流程记录与版本恢复</span>
                  </h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setHistoryKey({})}
                    className="h-6 text-[11px] text-indigo-600 hover:underline"
                  >
                    刷新记录
                  </Button>
                </div>
                <ReportHistory
                  reportId={report.id}
                  status={report.status}
                  refreshKey={historyKey}
                  onRestored={(restoredReport: { content?: LearningReportContent }) => {
                    if (restoredReport?.content) {
                      setContent(restoredReport.content);
                    }
                  }}
                />
              </div>
            )}

            {/* 报告基本信息 */}
            <div className="space-y-3 rounded-xl border bg-background p-3.5">
              <span className="text-xs font-bold text-foreground">报告抬头与课程</span>
              {subjectReport && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">每次课程出勤情况</span>
                    <button
                      type="button"
                      onClick={() => {
                        setContent(current => {
                          const currentList =
                            current.attendances && current.attendances.length > 0
                              ? [...current.attendances]
                              : [current.attendance ?? "present"];
                          const updated = [...currentList, "present" as CourseAttendanceStatus];
                          return {
                            ...current,
                            attendances: updated,
                            attendance: updated[0] ?? "present"
                          };
                        });
                      }}
                      className="text-[11px] font-medium text-primary hover:underline"
                    >
                      + 添加课程
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(content.attendances && content.attendances.length > 0
                      ? content.attendances
                      : [content.attendance ?? "present"]
                    ).map((att, idx, arr) => (
                      <div key={idx} className="min-w-0 space-y-2 rounded-lg border p-2.5">
                        <SubjectDraftLessonContent
                          key={arr.length}
                          lesson={idx + 1}
                          period={report.period}
                          pdf={subjectPdf}
                          value={(content.courseContent ?? "")
                            .split("\n")
                            .filter(line => courseLineLesson(line) === idx + 1)
                            .map(line => line.replace(lessonPrefix, ""))
                            .join("\n")}
                          onChange={update =>
                            setContent(current => {
                              // 沿用报告正文的课次前缀，兼容已有预览和保存接口。
                              const lesson = idx + 1;
                              const lines = (current.courseContent ?? "").split("\n");
                              const ownLines = lines.filter(line => courseLineLesson(line) === lesson);
                              const text = update(ownLines.map(line => line.replace(lessonPrefix, "")).join("\n"));
                              const prefix =
                                lesson > 1 || ownLines.some(line => lessonPrefix.test(line))
                                  ? `第 ${lesson} 节课 · `
                                  : "";
                              const rest = lines.filter(line => courseLineLesson(line) !== lesson);
                              const next = text ? [...rest, ...text.split("\n").map(line => prefix + line)] : rest;
                              next.sort((a, b) => courseLineLesson(a) - courseLineLesson(b));
                              return { ...current, courseContent: next.join("\n") };
                            })
                          }
                        />
                        <div className="flex-1">
                          <CourseAttendance
                            label={arr.length > 1 ? `第 ${idx + 1} 节课出勤情况` : "课程出勤情况"}
                            value={att}
                            onChange={newAtt => {
                              setContent(current => {
                                const currentList =
                                  current.attendances && current.attendances.length > 0
                                    ? [...current.attendances]
                                    : [current.attendance ?? "present"];
                                currentList[idx] = newAtt;
                                return {
                                  ...current,
                                  attendances: currentList,
                                  attendance: currentList[0] ?? newAtt
                                };
                              });
                            }}
                          />
                        </div>
                        {arr.length > 1 && (
                          <button
                            type="button"
                            aria-label={`删除第 ${idx + 1} 节课`}
                            className="mb-1 text-xs text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              setContent(current => {
                                const currentList = (
                                  current.attendances && current.attendances.length > 0
                                    ? current.attendances
                                    : [current.attendance ?? "present"]
                                ).filter((_, i) => i !== idx);
                                return {
                                  ...current,
                                  attendances: currentList.length ? currentList : ["present"],
                                  courseContent: (current.courseContent ?? "")
                                    .split("\n")
                                    .filter(line => courseLineLesson(line) !== idx + 1)
                                    .map(line => {
                                      const lesson = courseLineLesson(line);
                                      return lesson > idx + 1
                                        ? line.replace(lessonPrefix, `第 ${lesson - 1} 节课 · `)
                                        : line;
                                    })
                                    .join("\n"),
                                  attendance: currentList[0] ?? "present"
                                };
                              });
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid gap-2.5 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">报告抬头</label>
                  <Input
                    value={content.reportDetails?.institutionName ?? "课堂成长记录"}
                    maxLength={60}
                    placeholder="课堂成长记录"
                    onChange={e => {
                      const val = e.target.value;
                      setContent(prev => ({
                        ...prev,
                        reportDetails: {
                          institutionName: val,
                          courseTheme: prev.reportDetails?.courseTheme ?? "",
                          lessonNumber: prev.reportDetails?.lessonNumber ?? null,
                          lessonDate: prev.reportDetails?.lessonDate ?? null
                        }
                      }));
                    }}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">课程主题</label>
                  <Input
                    value={content.reportDetails?.courseTheme ?? ""}
                    maxLength={100}
                    placeholder="选填"
                    onChange={e => {
                      const val = e.target.value;
                      setContent(prev => ({
                        ...prev,
                        reportDetails: {
                          institutionName: prev.reportDetails?.institutionName ?? "课堂成长记录",
                          courseTheme: val,
                          lessonNumber: prev.reportDetails?.lessonNumber ?? null,
                          lessonDate: prev.reportDetails?.lessonDate ?? null
                        }
                      }));
                    }}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">第几次课</label>
                    <Input
                      type="number"
                      min={1}
                      max={999}
                      placeholder="选填"
                      value={content.reportDetails?.lessonNumber ?? ""}
                      onChange={e => {
                        const val = e.target.value;
                        setContent(prev => ({
                          ...prev,
                          reportDetails: {
                            institutionName: prev.reportDetails?.institutionName ?? "课堂成长记录",
                            courseTheme: prev.reportDetails?.courseTheme ?? "",
                            lessonNumber: val === "" ? null : Number(val),
                            lessonDate: prev.reportDetails?.lessonDate ?? null
                          }
                        }));
                      }}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">授课日期</label>
                    <Input
                      type="date"
                      value={content.reportDetails?.lessonDate ?? ""}
                      onChange={e => {
                        const val = e.target.value;
                        setContent(prev => ({
                          ...prev,
                          reportDetails: {
                            institutionName: prev.reportDetails?.institutionName ?? "课堂成长记录",
                            courseTheme: prev.reportDetails?.courseTheme ?? "",
                            lessonNumber: prev.reportDetails?.lessonNumber ?? null,
                            lessonDate: val || null
                          }
                        }));
                      }}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 报告学科 */}
            <div className="space-y-2 rounded-xl border bg-background p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">报告学科</span>
                {unselectedSubjects.length > 0 && (
                  <div className="relative">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || subjectBusy}
                      onClick={() => setAddSubjectDropdownOpen(prev => !prev)}
                      className="h-7 text-[11px] text-indigo-600"
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      <span>添加学科</span>
                    </Button>
                    {addSubjectDropdownOpen && (
                      <div className="absolute right-0 top-8 z-30 w-36 rounded-xl border bg-popover p-1 shadow-lg">
                        {unselectedSubjects.map(sub => (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => void handleAddSubject(sub)}
                            className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-muted"
                          >
                            <span>{sub.name}</span>
                            <span className="text-[10px] text-indigo-600">+ 添加</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {persistSubjects && <p className="text-[11px] text-muted-foreground">添加或移除学科会立即保存。</p>}
              {subjectError && (
                <p role="alert" className="text-xs text-destructive">
                  {subjectError}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {currentReportSubjects.map(sub => {
                  const isActive = sub.id === activeSubjectId;
                  const canDelete = currentReportSubjects.length > 1;

                  return (
                    <div
                      key={sub.id}
                      onClick={() => setActiveSubjectId(sub.id)}
                      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs transition ${
                        isActive
                          ? "border-indigo-600 bg-indigo-600 font-bold text-white shadow-2xs"
                          : "border bg-card text-foreground hover:bg-muted font-medium"
                      }`}
                    >
                      <span>{sub.name}</span>
                      {canDelete && (
                        <button
                          type="button"
                          disabled={busy || subjectBusy}
                          aria-label={`移除${sub.name}学科`}
                          onClick={e => {
                            e.stopPropagation();
                            void handleRemoveSubject(sub.id);
                          }}
                          className={`ml-1 text-xs hover:text-red-500 ${isActive ? "text-indigo-200" : "text-muted-foreground"}`}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 各科课堂表现评价 */}
            <div className="space-y-2 rounded-xl border-2 border-indigo-200 bg-indigo-50/40 p-3.5 dark:border-indigo-900/60 dark:bg-indigo-950/20">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="flex items-center gap-1.5 text-xs font-bold text-indigo-950 dark:text-indigo-200">
                    <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                    <span>各科课堂表现评价</span>
                  </h3>
                </div>
              </div>

              <V2ClassroomPerformance
                subjects={currentReportSubjects}
                activeSubjectId={activeSubjectId}
                onSelectSubject={setActiveSubjectId}
                ratings={performanceRatings}
                onChange={handlePerformanceChange}
              />
            </div>

            {/* 课堂照片 */}
            <div className="space-y-2 rounded-xl border bg-background p-3.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-foreground">课堂照片</span>
                <span className="text-[11px] text-muted-foreground">最多两张，每张最大 2MB</span>
              </div>

              {photoError && (
                <div
                  role="alert"
                  className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50/90 p-2 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300 animate-in fade-in duration-150"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
                  <span className="flex-1 leading-relaxed">{photoError}</span>
                  <button
                    type="button"
                    onClick={() => setPhotoError(null)}
                    aria-label="关闭照片错误提示"
                    className="ml-1 text-red-400 hover:text-red-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {[0, 1].map(slot => {
                  const photoSrc = classroomPhotos[slot];
                  return (
                    <div key={slot} className="rounded-xl border p-2 text-center">
                      <input
                        type="file"
                        ref={el => {
                          photoInputRefs.current[slot] = el;
                        }}
                        accept="image/jpeg,image/png"
                        className="hidden"
                        onChange={e => {
                          const f = e.target.files?.[0] || null;
                          handlePhotoUpload(slot, f);
                          e.target.value = "";
                        }}
                      />
                      {photoSrc ? (
                        <div className="relative h-24 w-full overflow-hidden rounded-lg border bg-muted">
                          <img src={photoSrc} alt={`课堂照片 ${slot + 1}`} className="h-full w-full object-cover" />
                          <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/40 opacity-0 transition hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => photoInputRefs.current[slot]?.click()}
                              className="rounded bg-white/90 px-2 py-1 text-[11px] font-bold text-slate-800 hover:bg-white"
                            >
                              更换
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemovePhoto(slot)}
                              className="rounded bg-rose-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-rose-700"
                            >
                              删除
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => photoInputRefs.current[slot]?.click()}
                          className="flex h-24 w-full flex-col items-center justify-center rounded-lg border border-dashed text-muted-foreground hover:bg-muted/40 transition"
                        >
                          <span className="text-xs font-semibold">+ 上传照片 {slot + 1}</span>
                          <span className="mt-1 text-[10px]">JPG / PNG，≤ 2MB</span>
                        </button>
                      )}
                      <div className="mt-1.5">
                        <Input
                          aria-label={`照片${slot + 1}配图说明`}
                          value={content.classroomPhotoCaptions?.[slot] || ""}
                          maxLength={10}
                          placeholder="配图说明（最多10字）"
                          onChange={e => handlePhotoCaptionChange(slot, e.target.value)}
                          className="h-7 text-center text-xs"
                        />
                        <span className="mt-0.5 block text-right text-[10px] text-muted-foreground">
                          {(content.classroomPhotoCaptions?.[slot] || "").length}/10
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 学习习惯与能力成长总结 */}
            <div className="space-y-3 rounded-xl border border-sky-100 bg-sky-50/40 p-3.5 dark:border-sky-900/40 dark:bg-sky-950/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-sky-900 dark:text-sky-200">学习习惯与能力成长总结</span>
                <span className="text-[11px] text-muted-foreground">修改后实时镜像呈现于右侧长图</span>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {growthDimensions.map(([key, label]) => (
                  <div key={key} className="space-y-1">
                    <label className="text-[11px] font-semibold text-sky-950 dark:text-sky-300">{label}</label>
                    <Textarea
                      aria-label={label}
                      rows={2}
                      value={content.growthAssessment?.[key] || ""}
                      onChange={e => {
                        const val = e.target.value;
                        setContent(prev => ({
                          ...prev,
                          growthAssessment: {
                            ...(prev.growthAssessment || emptyGrowthAssessment()),
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
            <div className="space-y-2 rounded-xl border bg-background p-3.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-foreground">老师想对你说</span>
                <span className="text-[11px] text-muted-foreground">{(content.summary || "").length} 字</span>
              </div>
              <Textarea
                aria-label="老师想对你说文本"
                rows={3}
                value={content.summary || ""}
                maxLength={600}
                placeholder="填写给学生的专属寄语与课堂评价..."
                onChange={e => handleSummaryChange(e.target.value)}
                className="text-xs leading-relaxed"
              />
              {persistSubjects && <p className="text-[11px] text-muted-foreground">添加或移除学科会立即保存。</p>}
              {subjectError && (
                <p role="alert" className="text-xs text-destructive">
                  {subjectError}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] text-muted-foreground">快捷填入：</span>
                {quickPhrases.map((phrase, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleAppendPhrase(phrase)}
                    className="rounded-lg border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    + {phrase.slice(0, 8)}...
                  </button>
                ))}
              </div>
            </div>

            {/* ⭐ 本期最值得肯定 (仅在 v1 报告中显示) */}
            {!isV2 && (
              <div className="space-y-2 rounded-xl border bg-background p-3.5 text-xs">
                <span className="font-bold text-amber-800 dark:text-amber-300">⭐ 本期最值得肯定</span>
                <Textarea
                  aria-label="本期最值得肯定"
                  rows={2}
                  value={content.strengths?.[0]?.text || ""}
                  placeholder="例如：课上积极举手发言5次，英语发音纯正，实验操作规范细致..."
                  onChange={e => handleStrengthsChange(e.target.value)}
                  className="border-amber-200 bg-amber-50/30 text-xs"
                />
              </div>
            )}

            {/* 下一步重点 */}
            <div className="space-y-2 rounded-xl border bg-background p-3.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-foreground">下一步重点</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={(content.areasToImprove || []).length >= 8}
                  onClick={handleAddFocusItem}
                  className="h-7 text-[11px]"
                >
                  <Plus className="mr-1 h-3 w-3" />
                  <span>添加一条 ({(content.areasToImprove || []).length}/8)</span>
                </Button>
              </div>

              <div className="space-y-2 pt-1">
                {(content.areasToImprove || []).length === 0 && (
                  <p className="py-1 text-[11px] text-muted-foreground">
                    暂无重点建议，可点击右上角“添加一条”添加（选填，最多8条）。
                  </p>
                )}
                {(content.areasToImprove || []).map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="font-bold text-indigo-600">{idx + 1}.</span>
                    <Input
                      aria-label={`重点建议第${idx + 1}条`}
                      value={item.text}
                      placeholder="填写下一阶段具体学习或习惯重点..."
                      onChange={e => handleUpdateFocusItem(idx, e.target.value)}
                      className="h-8 flex-1 text-xs"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`删除第${idx + 1}条重点建议`}
                      onClick={() => handleRemoveFocusItem(idx)}
                      className="h-8 w-8 text-muted-foreground hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {(content.areasToImprove || []).length >= 8 && (
                  <p className="text-[11px] text-amber-600 flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>已达 8 条建议上限，建议精炼核心关注项。</span>
                  </p>
                )}
              </div>
            </div>

            {/* 回家可以这样练 (仅在 v1 报告中显示) */}
            {!isV2 && (
              <div className="space-y-2 rounded-xl border bg-background p-3.5 text-xs">
                <span className="font-bold text-foreground">回家可以这样练</span>
                <Textarea
                  aria-label="回家练习建议"
                  rows={2}
                  value={content.homeSuggestions?.[0]?.text || ""}
                  placeholder="为家长和孩子提供明确的课后练习指引..."
                  onChange={e => handleHomeSuggestionsChange(e.target.value)}
                  className="text-xs"
                />
              </div>
            )}
          </div>

          {/* 右侧 1:1 家长端报告长图预览 */}
          <div
            className={`flex flex-col h-full min-h-0 border-t bg-muted/20 p-3 sm:p-4 md:border-l md:border-t-0 ${
              mobileTab === "preview" ? "flex" : "hidden md:flex"
            }`}
          >
            <div className="mb-2 flex shrink-0 items-center justify-between text-xs">
              <span className="font-bold text-foreground">📱 最终长图排版</span>
              <span className="font-semibold text-emerald-600">● 100% 实时镜像联动</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border bg-white shadow-inner p-2 sm:p-4">
              <LearningReportView report={liveReportData} />
            </div>
          </div>
        </div>

        {/* 底部操作条 */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-muted/20 p-2.5 sm:p-3.5 sm:px-5">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={busy} className="h-8 sm:h-9">
            关闭
          </Button>

          <div className="flex items-center gap-2">
            {report.status !== "published" && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy || subjectBusy}
                  onClick={() => onSave({ ...content, reportVersion: isV2 ? "v2" : undefined })}
                  className="h-8 sm:h-9 border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 text-xs sm:text-sm"
                >
                  保存草稿
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || subjectBusy}
                  onClick={() => onPublish({ ...content, reportVersion: isV2 ? "v2" : undefined })}
                  className="h-8 sm:h-9 bg-indigo-600 text-white hover:bg-indigo-700 font-bold text-xs sm:text-sm"
                >
                  <Sparkles className="mr-1 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span>审核通过并发布</span>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
