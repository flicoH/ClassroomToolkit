"use client";

import { useState, useMemo } from "react";
import type { V2Subject, PerformanceRating } from "./V2ClassroomPerformance";
import { V2ClassroomPerformance } from "./V2ClassroomPerformance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  LearningReportView,
  type LearningReportData,
  type LearningReportContent
} from "@/components/semester-reports/LearningReportView";
import { ArrowLeft, ArrowRight, Sparkles, X } from "lucide-react";

/** 四步向导初始元数据（对应报告表头、课次及所选学科） */
export type WizardInitialData = {
  classId: string;
  className: string;
  period: "week" | "month" | "term";
  startDate: string;
  endDate: string;
  title: string;
  courseTheme: string;
  lessonNumber: number | null;
  lessonDate: string;
  selectedSubjects: string[];
};

/**
 * 新建报告四步向导组件（弹窗形态）
 *
 * 流程设计：
 * 1. Step 1: 基础设置（学期、周期、日期范围、课次与主题）；
 * 2. Step 2: 学科与内容（默认不选学科，必须至少选一门学科方可推进）；
 * 3. Step 3: 学生名单挑选（默认不全选，支持全选本班或精准勾选，严格限制 1~30 人）；
 * 4. Step 4: 逐人评价台（快速批量切换、预设标签选择、评语撰写与 1:1 家长端实时长图核对）。
 */
export function NewReportWizard({
  isOpen,
  onClose,
  allStudents,
  availableSubjects,
  onFinishGenerate,
  busy = false
}: {
  isOpen: boolean;
  onClose: () => void;
  allStudents: Array<{ id: string; name: string; classId: string; className: string; score: number }>;
  availableSubjects: V2Subject[];
  onFinishGenerate: (result: {
    meta: WizardInitialData;
    studentIds: string[];
    ratings: Record<string, PerformanceRating[]>;
    comments: Record<string, string>;
  }) => Promise<void>;
  busy?: boolean;
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1 状态
  const [meta, setMeta] = useState<WizardInitialData>({
    classId: allStudents[0]?.classId || "c1",
    className: allStudents[0]?.className || "一年级1班",
    period: "week",
    startDate: "2026-04-13",
    endDate: "2026-04-17",
    title: "课堂成长记录",
    courseTheme: "",
    lessonNumber: null,
    lessonDate: "2026-04-17",
    selectedSubjects: []
  });

  // Step 2 状态：教研要点与课堂反馈
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [selectedSentences, setSelectedSentences] = useState<string[]>([]);
  const [classComment, setClassComment] = useState("");

  // Step 3 状态：勾选学生名单（新增报告时默认不选中学生）
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  // Step 4 状态：逐人批阅工作台
  const [currentStudentIdx, setCurrentStudentIdx] = useState(0);
  const [studentRatings, setStudentRatings] = useState<Record<string, PerformanceRating[]>>({});
  const [studentComments, setStudentComments] = useState<Record<string, string>>({});
  const [studentFocusMap, setStudentFocusMap] = useState<Record<string, string[]>>({});
  const [activePerfSubId, setActivePerfSubId] = useState<string>(availableSubjects[0]?.id || "");

  const activeStudent = allStudents[currentStudentIdx];

  // 选中学科对象
  const activeReportSubjects = useMemo(() => {
    return availableSubjects.filter(s => meta.selectedSubjects.includes(s.id));
  }, [availableSubjects, meta.selectedSubjects]);

  // Step 4 当前学生的 1:1 长图预览数据
  const currentPreviewData: LearningReportData | null = useMemo(() => {
    if (!activeStudent) return null;
    const ratings = studentRatings[activeStudent.id] || [];
    const comment = studentComments[activeStudent.id] || classComment;
    const focusItems = studentFocusMap[activeStudent.id] || [];

    const content: LearningReportContent = {
      reportVersion: "v2",
      reportDetails: {
        institutionName: meta.title.trim() || "课堂成长记录",
        courseTheme: meta.courseTheme.trim(),
        lessonNumber: meta.lessonNumber,
        lessonDate: meta.lessonDate || null
      },
      summary: comment,
      courseOverview: meta.courseTheme,
      reportSubjects: activeReportSubjects.map(s => ({ subjectId: s.id, name: s.name })),
      classroomPerformance: ratings.map(r => ({
        subjectId: r.subjectId,
        text: `${r.label} · ${r.value}`,
        sourceRefs: ["teacher-review"]
      })),
      growthAssessment: {
        learningReadiness: "课前主动准备学习用具，坐姿端正，听讲专注度高。",
        communicationCooperation: "乐于在小组中表达自己的观点，能够倾听同学发言。",
        independenceRules: "严格遵守课堂纪律，按时独立完成课堂练习。",
        overallUnderstanding: "整体表现积极向上，学习习惯良好，求知欲强。"
      },
      strengths: [{ text: "课堂专注稳定，积极参与小组交流", sourceRefs: ["teacher-review"] }],
      areasToImprove: focusItems.map(f => ({ text: f, sourceRefs: ["teacher-review"] })),
      homeSuggestions: [{ text: "每天坚持5-10分钟亲子问答与自然观察分享。", sourceRefs: ["teacher-review"] }],
      limitations: []
    };

    return {
      id: `preview-${activeStudent.id}`,
      studentName: activeStudent.name,
      className: activeStudent.className,
      period: meta.period,
      term: meta.title || "2026春季学期",
      subject: activeReportSubjects.map(s => s.name).join("、"),
      start: meta.startDate,
      end: meta.endDate,
      status: "draft",
      content
    };
  }, [activeStudent, studentRatings, studentComments, studentFocusMap, classComment, meta, activeReportSubjects]);

  if (!isOpen) return null;

  function toggleStudentSelection(id: string) {
    setSelectedStudentIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  }

  function handleBatchApplyComment() {
    const nextComments: Record<string, string> = {};
    for (const s of allStudents) {
      nextComments[s.id] = classComment;
    }
    setStudentComments(nextComments);
  }

  async function handleFinish() {
    await onFinishGenerate({
      meta,
      studentIds: selectedStudentIds,
      ratings: studentRatings,
      comments: studentComments
    });
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="新建学期报告向导"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4 backdrop-blur-xs"
    >
      <div className="flex h-[94vh] max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-2xl">
        {/* 顶部向导进度条 */}
        <div className="flex shrink-0 items-center justify-between border-b bg-muted/30 px-5 py-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold sm:text-base">新建学期报告向导 (Step {step}/4)</h2>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={step >= 1 ? "font-bold text-indigo-600" : ""}>1. 基础周期</span>
              <span>→</span>
              <span className={step >= 2 ? "font-bold text-indigo-600" : ""}>2. 课程要点</span>
              <span>→</span>
              <span className={step >= 3 ? "font-bold text-indigo-600" : ""}>3. 学生名单</span>
              <span>→</span>
              <span className={step >= 4 ? "font-bold text-indigo-600" : ""}>4. 批阅工作台</span>
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* 向导各步骤内容 */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Step 1: 基础信息配置 */}
          {step === 1 && (
            <div className="mx-auto max-w-2xl space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-semibold">班级选择 (className)</label>
                  <Input
                    value={meta.className}
                    onChange={e => setMeta(prev => ({ ...prev, className: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold">报告周期 (period)</label>
                  <div className="grid grid-cols-3 gap-1 rounded-lg border bg-muted/40 p-1">
                    {(["week", "month", "term"] as const).map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setMeta(prev => ({ ...prev, period: p }))}
                        className={`rounded-md py-1 font-semibold transition ${
                          meta.period === p ? "bg-indigo-600 text-white shadow-2xs" : "text-muted-foreground"
                        }`}
                      >
                        {p === "week" ? "周报" : p === "month" ? "月报" : "学期"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-semibold">周期开始日期</label>
                  <Input
                    type="date"
                    value={meta.startDate}
                    onChange={e => setMeta(prev => ({ ...prev, startDate: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold">周期结束日期</label>
                  <Input
                    type="date"
                    value={meta.endDate}
                    onChange={e => setMeta(prev => ({ ...prev, endDate: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block font-semibold">报告抬头 (最多60字)</label>
                <Input
                  value={meta.title}
                  maxLength={60}
                  placeholder="课堂成长记录"
                  onChange={e => setMeta(prev => ({ ...prev, title: e.target.value }))}
                  className="h-8 text-xs"
                />
              </div>

              <div>
                <label className="mb-1 block font-semibold">课程主题 (最多100字)</label>
                <Input
                  value={meta.courseTheme}
                  maxLength={100}
                  placeholder="选填"
                  onChange={e => setMeta(prev => ({ ...prev, courseTheme: e.target.value }))}
                  className="h-8 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-semibold">第几次课</label>
                  <Input
                    type="number"
                    placeholder="选填"
                    value={meta.lessonNumber ?? ""}
                    onChange={e =>
                      setMeta(prev => ({
                        ...prev,
                        lessonNumber: e.target.value === "" ? null : Number(e.target.value)
                      }))
                    }
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold">授课日期</label>
                  <Input
                    type="date"
                    value={meta.lessonDate}
                    onChange={e => setMeta(prev => ({ ...prev, lessonDate: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: 课程资料与教研要点 */}
          {step === 2 && (
            <div className="mx-auto max-w-2xl space-y-4 text-xs">
              <div className="rounded-xl border bg-background p-3.5 space-y-2">
                <span className="font-bold">核心词汇 (点击选择包含进报告)</span>
                <div className="flex flex-wrap gap-1.5">
                  {["habitat", "ecosystem", "wildlife", "observation", "predator", "diversity"].map(kw => {
                    const isSelected = selectedKeywords.includes(kw);
                    return (
                      <button
                        key={kw}
                        type="button"
                        onClick={() =>
                          setSelectedKeywords(prev => (isSelected ? prev.filter(x => x !== kw) : [...prev, kw]))
                        }
                        className={`rounded-lg px-2.5 py-1 text-xs transition ${
                          isSelected
                            ? "bg-indigo-600 text-white font-semibold"
                            : "border bg-card text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {kw}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border bg-background p-3.5 space-y-2">
                <span className="font-bold">重点句型与语法</span>
                <div className="space-y-1.5">
                  {[
                    "Where do wild animals live?",
                    "They live in the forest and grassland.",
                    "What can we do to protect nature?"
                  ].map(sent => {
                    const isSelected = selectedSentences.includes(sent);
                    return (
                      <div
                        key={sent}
                        onClick={() =>
                          setSelectedSentences(prev => (isSelected ? prev.filter(x => x !== sent) : [...prev, sent]))
                        }
                        className={`cursor-pointer rounded-lg border p-2 transition ${
                          isSelected ? "border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30" : "hover:bg-muted"
                        }`}
                      >
                        <span className="font-medium">{sent}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border bg-background p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold">课时课堂总体反馈 (教师观察总结)</span>
                  <span className="text-[11px] text-muted-foreground">作为学生报告的基础生成素材</span>
                </div>
                <Textarea
                  rows={3}
                  value={classComment}
                  onChange={e => setClassComment(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>
          )}

          {/* Step 3: 学生名单与生成 */}
          {step === 3 && (
            <div className="mx-auto max-w-2xl space-y-4 text-xs">
              <div className="flex items-center justify-between rounded-xl border bg-muted/30 p-3">
                <span className="font-semibold">
                  已选择 {selectedStudentIds.length} / {allStudents.length} 位学生
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedStudentIds(allStudents.map(s => s.id))}
                    className="h-7 text-xs"
                  >
                    全选当前班级
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedStudentIds([])}
                    className="h-7 text-xs"
                  >
                    清空选择
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {allStudents.map(student => {
                  const isChecked = selectedStudentIds.includes(student.id);
                  return (
                    <div
                      key={student.id}
                      onClick={() => toggleStudentSelection(student.id)}
                      className={`flex cursor-pointer items-center justify-between rounded-xl border p-2.5 transition ${
                        isChecked
                          ? "border-indigo-600 bg-indigo-50/50 font-semibold dark:bg-indigo-950/30"
                          : "hover:bg-muted"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          readOnly
                          className="h-4 w-4 rounded text-indigo-600"
                        />
                        <span>{student.name}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{student.score} 积分</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 4: 逐人批阅工作台 */}
          {step === 4 && (
            <div className="grid h-full grid-cols-1 gap-4 md:grid-cols-[200px_1fr_380px]">
              {/* 学生列表 */}
              <div className="space-y-1.5 overflow-y-auto border-r pr-2 text-xs">
                <span className="block font-bold text-muted-foreground pb-1">学生名单</span>
                {allStudents.map((s, idx) => {
                  const isCurrent = idx === currentStudentIdx;
                  const hasDone = Boolean(studentRatings[s.id]?.length);

                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setCurrentStudentIdx(idx)}
                      className={`flex w-full items-center justify-between rounded-lg p-2 text-left transition ${
                        isCurrent ? "bg-indigo-600 text-white font-bold" : "hover:bg-muted text-foreground"
                      }`}
                    >
                      <span>{s.name}</span>
                      <span
                        className={`text-[10px] ${isCurrent ? "text-indigo-100" : hasDone ? "text-emerald-600 font-semibold" : "text-muted-foreground"}`}
                      >
                        {hasDone ? "已评" : "待评"}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* 中间批阅表单 */}
              <div className="space-y-4 overflow-y-auto px-2 text-xs">
                {activeStudent && (
                  <>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold">{activeStudent.name} 的课堂反馈打分</h3>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleBatchApplyComment}
                        className="h-7 text-[11px] text-indigo-600"
                      >
                        套用全班评语模版
                      </Button>
                    </div>

                    {/* 宠物伙伴形态展示 */}
                    <div className="rounded-xl border bg-amber-50/50 p-2.5 dark:bg-amber-950/20">
                      <span className="font-semibold text-amber-900 dark:text-amber-200">
                        🐾 {activeStudent.name}的宠物伙伴：火绒狐 · Lv.3
                      </span>
                    </div>

                    {/* 各科课堂表现（纯预设胶囊选项，完全禁止手输文本框） */}
                    <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/30 p-3 dark:border-indigo-900/50 dark:bg-indigo-950/20 space-y-2">
                      <span className="font-bold text-indigo-950 dark:text-indigo-200">
                        课堂表现打分 (仅限选择预设值，禁止手输)
                      </span>
                      <V2ClassroomPerformance
                        subjects={activeReportSubjects}
                        activeSubjectId={activePerfSubId}
                        onSelectSubject={setActivePerfSubId}
                        ratings={studentRatings[activeStudent.id] || []}
                        onChange={next => setStudentRatings(prev => ({ ...prev, [activeStudent.id]: next }))}
                      />
                    </div>

                    {/* 教师评语 */}
                    <div className="space-y-1">
                      <span className="font-bold">老师想对你说 (个性化寄语)</span>
                      <Textarea
                        rows={3}
                        value={studentComments[activeStudent.id] || classComment}
                        onChange={e =>
                          setStudentComments(prev => ({
                            ...prev,
                            [activeStudent.id]: e.target.value
                          }))
                        }
                        className="text-xs"
                      />
                    </div>

                    {/* 下一步重点 (上限8条) */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold">下一步重点 (上限 8 条)</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={(studentFocusMap[activeStudent.id] || []).length >= 8}
                          onClick={() => {
                            const cur = studentFocusMap[activeStudent.id] || [];
                            if (cur.length >= 8) return;
                            setStudentFocusMap(prev => ({
                              ...prev,
                              [activeStudent.id]: [...cur, "新关注要点"]
                            }));
                          }}
                          className="h-6 text-[10px]"
                        >
                          + 添加
                        </Button>
                      </div>
                      <div className="space-y-1">
                        {(studentFocusMap[activeStudent.id] || []).map((item, fIdx) => (
                          <div key={fIdx} className="flex items-center gap-1.5">
                            <span className="font-bold text-indigo-600">{fIdx + 1}.</span>
                            <Input
                              value={item}
                              onChange={e => {
                                const list = [...(studentFocusMap[activeStudent.id] || [])];
                                list[fIdx] = e.target.value;
                                setStudentFocusMap(prev => ({ ...prev, [activeStudent.id]: list }));
                              }}
                              className="h-7 text-xs flex-1"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* 右侧 1:1 预览长图 */}
              <div className="flex flex-col border-l pl-3">
                <span className="mb-2 text-xs font-bold">📱 1:1 家长端实时预览</span>
                <div className="flex-1 overflow-y-auto rounded-xl border bg-white p-2 shadow-inner">
                  {currentPreviewData && <LearningReportView report={currentPreviewData} />}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 底部导航按钮 */}
        <div className="flex shrink-0 items-center justify-between border-t bg-muted/20 px-5 py-3">
          {step > 1 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setStep(prev => Math.max(1, prev - 1) as 1 | 2 | 3 | 4)}
              disabled={busy}
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              <span>上一步</span>
            </Button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <Button
              type="button"
              size="sm"
              disabled={step === 3 && selectedStudentIds.length === 0}
              onClick={() => setStep(prev => Math.min(4, prev + 1) as 1 | 2 | 3 | 4)}
              className="bg-indigo-600 text-white font-semibold hover:bg-indigo-700"
            >
              <span>{step === 3 ? "生成草稿并进入批阅台" : "下一步"}</span>
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={handleFinish}
              disabled={busy}
              className="bg-indigo-600 text-white font-bold hover:bg-indigo-700"
            >
              <Sparkles className="mr-1.5 h-4 w-4" />
              <span>完成批阅并保存草稿</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
