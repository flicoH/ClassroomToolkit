/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 * **********************************************************************************************
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BarChart3,
  BookOpenCheck,
  Check,
  ClipboardList,
  Grid2X2,
  Info,
  LayoutGrid,
  ListChecks,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Trash2,
  Users,
  X
} from "lucide-react";
import { StudentAvatar } from "@/components/students/StudentAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import request from "@/lib/request";
import { cn } from "@/lib/utils";

export type TaskType = "status" | "score";
export type TaskView = "list" | "detail" | "create" | "edit" | "report" | "leaderboard";
export type StudentStatus = "未完成" | "已完成" | "待改正" | "待提交";
type ReviewAction = "requestCorrection" | "complete";

export interface TaskSubItem {
  id: string;
  title: string;
}

export interface Student {
  id: string;
  name: string;
  studentNo: string;
  status: StudentStatus;
  score?: number;
  photo?: string | null;
  checkedItemIds?: string[];
  needsCorrection?: boolean;
}

export interface TaskItem {
  id: string;
  title: string;
  className: string;
  type: TaskType;
  statusCount: number;
  createdAt: string;
  items?: TaskSubItem[];
  students: Student[];
}

export interface ClassStudent {
  id: string;
  name: string;
  studentNo: string;
  photo?: string | null;
}

export interface ClassRoom {
  id: string;
  name: string;
  students: ClassStudent[];
  groups: string[];
}

export const statusStyles: Record<
  StudentStatus,
  { text: string; bg: string; bar: string; badge: string; border: string; label: string }
> = {
  未完成: {
    label: "未完成（灰色）",
    text: "text-slate-600 dark:text-slate-300",
    bg: "bg-slate-100 dark:bg-slate-800",
    bar: "bg-slate-400",
    badge: "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
    border: "border-slate-200 dark:border-slate-700"
  },
  已完成: {
    label: "已完成（绿色）",
    text: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    bar: "bg-emerald-500",
    badge:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300",
    border: "border-emerald-200 dark:border-emerald-900/60"
  },
  待改正: {
    label: "待改正（红色）",
    text: "text-rose-700 dark:text-rose-300",
    bg: "bg-rose-50 dark:bg-rose-950/40",
    bar: "bg-rose-500",
    badge: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300",
    border: "border-rose-200 dark:border-rose-900/60"
  },
  待提交: {
    label: "待提交（黄色）",
    text: "text-amber-800 dark:text-amber-300",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    bar: "bg-amber-400",
    badge: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-900"
  }
};

const statusCycle: StudentStatus[] = ["已完成", "待改正", "未完成"];
const checklistStatuses: StudentStatus[] = [...statusCycle, "待提交"];
const hasChecklist = (task: TaskItem) => Boolean(task.items?.length);
const countChecked = (task: TaskItem, student: Student) =>
  task.items?.filter(item => student.checkedItemIds?.includes(item.id)).length ?? 0;

/** 将历史状态归一化为新版统一状态。 */
export function normalizeStatus(raw: string | undefined): StudentStatus {
  if (raw === "需订正" || raw === "待改正" || raw === "需修订") return "待改正";
  if (raw === "已完成" || raw === "待提交") return raw;
  return "未完成";
}

/** 按任务分配记录计数，同一学生在不同任务中的记录各计一次。 */
function getCompletionStats(students: Student[], includePending = false) {
  const total = students.length;
  const statusPercents = (includePending ? checklistStatuses : statusCycle).map(status => {
    const count = students.filter(student => student.status === status).length;
    return { status, count, percent: total ? Math.round((count / total) * 100) : 0 };
  });
  const done = statusPercents.find(item => item.status === "已完成")?.count ?? 0;
  const percent = total ? Math.round((done / total) * 100) : 0;
  return { total, done, percent, statusPercents };
}

export function getTaskStats(task: TaskItem) {
  return getCompletionStats(task.students, hasChecklist(task));
}

function StatusCounts({ stats }: { stats: ReturnType<typeof getCompletionStats> }) {
  return (
    <span className="flex flex-wrap gap-2 text-xs font-semibold">
      {stats.statusPercents.map(({ status, count }) => (
        <span key={status} className={cn("inline-flex gap-1 rounded-md border px-2 py-1", statusStyles[status].badge)}>
          <span>{status}</span> <span className="tabular-nums">{count}</span>
        </span>
      ))}
    </span>
  );
}

type RankRow = { student: Student; completed: number; unfinished: number; total: number };

function latestEntry(entries: { task: TaskItem; student: Student }[]) {
  return entries.reduce((current, entry) => (entry.task.createdAt > current.task.createdAt ? entry : current));
}

function Ranking({
  rows,
  scope,
  unit,
  photos,
  onClose
}: {
  rows: RankRow[];
  scope: string;
  unit: string;
  photos: ReadonlyMap<string, string | null | undefined>;
  onClose?: () => void;
}) {
  const [unfinished, setUnfinished] = useState(false);
  const metric = unfinished ? "unfinished" : "completed";
  const ranked = rows
    .filter(row => row[metric] > 0)
    .sort(
      (a, b) =>
        b[metric] - a[metric] ||
        a.student.studentNo.localeCompare(b.student.studentNo, "zh-CN", { numeric: true }) ||
        a.student.id.localeCompare(b.student.id)
    );
  let rank = 0;
  const metricLabel = unfinished ? `未完成${unit}` : `已完成${unit}`;
  return (
    <section aria-labelledby="task-ranking-title">
      <div className="border-b border-slate-100 p-4 dark:border-slate-800 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 id="task-ranking-title" className="text-xl font-bold">
              {unfinished ? "未完成排行榜" : "完成排行榜"}
            </h2>
            <p className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">{scope}</p>
          </div>
          {onClose && (
            <Button variant="ghost" size="icon" className="shrink-0" aria-label="关闭排行榜" onClick={onClose}>
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div
          role="group"
          aria-label="榜单类型"
          className="mt-4 inline-flex max-w-full gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
        >
          {["完成任务", "未完成任务"].map((label, index) => {
            const active = unfinished === (index === 1);
            return (
              <Button
                key={label}
                variant="ghost"
                size="sm"
                aria-pressed={active}
                onClick={() => setUnfinished(index === 1)}
                className={cn("px-3", active && "bg-white text-slate-950 shadow-sm dark:bg-slate-700 dark:text-white")}
              >
                {label}
              </Button>
            );
          })}
        </div>
      </div>
      <div
        aria-live="polite"
        className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 bg-slate-50 px-4 py-2.5 text-xs font-medium text-slate-600 dark:bg-slate-800/50 dark:text-slate-300 sm:px-5"
      >
        <span>名次</span>
        <span>学生 · {ranked.length} 人上榜</span>
        <span className="text-right">{metricLabel} / 总数</span>
      </div>
      {ranked.length === 0 ? (
        <p role="status" className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
          暂无上榜学生。
        </p>
      ) : (
        <ol
          className={cn(
            "divide-y divide-slate-100 px-4 dark:divide-slate-800 sm:px-5",
            onClose && "max-h-[50dvh] overflow-y-auto"
          )}
        >
          {ranked.map((row, index) => {
            if (ranked[index - 1]?.[metric] !== row[metric]) rank = index + 1;
            return (
              <li
                key={row.student.id}
                className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 py-3 text-sm"
              >
                <span
                  className={cn(
                    "inline-flex size-8 items-center justify-center rounded-lg font-bold tabular-nums",
                    rank <= 3
                      ? "bg-cyan-50 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200"
                      : "text-slate-600 dark:text-slate-300"
                  )}
                  aria-label={`第 ${rank} 名`}
                >
                  {rank}
                </span>
                <div className="flex min-w-0 items-center gap-2">
                  <div className="hidden shrink-0 sm:block">
                    <StudentAvatar name={row.student.name} photo={photos.get(row.student.id)} />
                  </div>
                  <div className="min-w-0">
                    <p className="break-words font-semibold">{row.student.name}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span className="break-all text-xs text-slate-500 dark:text-slate-400">
                        #{row.student.studentNo}
                      </span>
                      {onClose && (
                        <Badge variant="outline" className={statusStyles[row.student.status].badge}>
                          {row.student.status}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="min-w-12 text-right tabular-nums sm:min-w-20">
                  <span
                    className={cn(
                      "font-bold",
                      unfinished ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300"
                    )}
                  >
                    {row[metric]}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400"> / {row.total}</span>
                  <div
                    aria-hidden="true"
                    className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                  >
                    <div
                      className={cn("h-full rounded-full", unfinished ? "bg-rose-500" : "bg-emerald-500")}
                      style={{ width: `${(row[metric] / row.total) * 100}%` }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function TaskRankingDialog({
  task,
  photos,
  onClose
}: {
  task: TaskItem;
  photos: ReadonlyMap<string, string | null | undefined>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const rows = task.students.map(student => {
    const total = task.items?.length || 1;
    const checked = countChecked(task, student);
    return {
      student,
      total,
      completed: hasChecklist(task) ? checked : Number(student.status === "已完成"),
      unfinished: hasChecklist(task) ? total - checked : Number(student.status === "未完成")
    };
  });
  return (
    <dialog
      ref={dialog}
      onCancel={event => {
        event.preventDefault();
        onClose();
      }}
      aria-labelledby="task-ranking-title"
      className="m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-950/50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
    >
      <Ranking
        rows={rows}
        scope={`${task.title} · ${task.className}`}
        unit={hasChecklist(task) ? "子项" : "任务"}
        photos={photos}
        onClose={onClose}
      />
    </dialog>
  );
}

function TaskReport({
  tasks,
  onBack,
  photos,
  leaderboard = false
}: {
  tasks: TaskItem[];
  onBack: () => void;
  photos: ReadonlyMap<string, string | null | undefined>;
  leaderboard?: boolean;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [className, setClassName] = useState("");
  const classNames = useMemo(
    () => [...new Set(tasks.map(task => task.className).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN")),
    [tasks]
  );
  const invalid = Boolean(from && to && from > to);
  const { matching, students, totals } = useMemo(() => {
    // 创建日期是 YYYY-MM-DD，直接比较可包含边界且避免时区转换。
    const matching = invalid
      ? []
      : tasks.filter(
          task =>
            (!className || task.className === className) &&
            (!from || task.createdAt >= from) &&
            (!to || task.createdAt <= to)
        );
    const byStudent = new Map<string, { task: TaskItem; student: Student }[]>();
    const records: Student[] = [];
    for (const task of matching) {
      for (const student of task.students) {
        records.push(student);
        const entries = byStudent.get(student.id) ?? [];
        entries.push({ task, student });
        byStudent.set(student.id, entries);
      }
    }
    return { matching, students: [...byStudent], totals: getCompletionStats(records, matching.some(hasChecklist)) };
  }, [tasks, className, from, to, invalid]);

  return (
    <div className="min-h-full bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
        <Button size="icon" variant="ghost" onClick={onBack} aria-label="返回任务列表">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-bold">{leaderboard ? "任务排行榜" : "任务完成统计"}</h1>
      </header>
      <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-5">
        <section
          className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          aria-label="统计筛选"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="min-w-0 space-y-1 text-sm font-medium">
              <span>班级</span>
              <select
                id="task-report-class"
                value={className}
                onChange={event => setClassName(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-slate-900 md:text-sm"
              >
                <option value="">全部班级</option>
                {classNames.map(name => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0 space-y-1 text-sm font-medium">
              <span>开始日期</span>
              <Input id="task-report-from" type="date" value={from} onChange={event => setFrom(event.target.value)} />
            </label>
            <label className="min-w-0 space-y-1 text-sm font-medium">
              <span>结束日期</span>
              <Input id="task-report-to" type="date" value={to} onChange={event => setTo(event.target.value)} />
            </label>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            按任务创建日期筛选，包含起止当天。日期留空表示该侧不限。
          </p>
          {invalid && (
            <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">
              开始日期不能晚于结束日期。
            </p>
          )}
        </section>

        {!invalid && matching.length === 0 && (
          <p role="status" className="py-8 text-center text-sm text-slate-500">
            {className ? "所选班级在这个日期范围内没有任务。" : "这个日期范围内没有任务。"}
          </p>
        )}
        {leaderboard && (
          <div
            hidden={matching.length === 0}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
          >
            <Ranking
              scope={`${className || "全部班级"} · ${matching.length} 项任务`}
              unit="任务"
              photos={photos}
              rows={students.map(([, entries]) => ({
                student: latestEntry(entries).student,
                total: entries.length,
                completed: entries.filter(entry => entry.student.status === "已完成").length,
                unfinished: entries.filter(entry => entry.student.status === "未完成").length
              }))}
            />
          </div>
        )}
        {!leaderboard && matching.length > 0 && (
          <>
            <section
              className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              aria-labelledby="task-report-summary"
            >
              <h2 id="task-report-summary" className="font-bold">
                范围汇总
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {matching.length} 项任务 · {students.length} 名学生 · 已完成 {totals.done} / {totals.total} 次任务分配（
                {totals.percent}%）
              </p>
              <StatusCounts stats={totals} />
            </section>

            <section className="space-y-2" aria-labelledby="task-report-tasks">
              <h2 id="task-report-tasks" className="font-bold">
                各任务完成情况
              </h2>
              <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                {matching.map(task => {
                  const stats = getTaskStats(task);
                  return (
                    <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="break-words font-medium">{task.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {task.className} · {task.createdAt} · {stats.done}/{stats.total} 人已完成（{stats.percent}%）
                        </p>
                      </div>
                      <StatusCounts stats={stats} />
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="space-y-2" aria-labelledby="task-report-students">
              <h2 id="task-report-students" className="font-bold">
                学生任务明细
              </h2>
              {students.length === 0 && <p className="text-sm text-slate-500">范围内的任务没有学生记录。</p>}
              <div className="space-y-2">
                {students.map(([id, entries]) => {
                  const latest = latestEntry(entries);
                  const stats = getCompletionStats(
                    entries.map(entry => entry.student),
                    entries.some(entry => hasChecklist(entry.task))
                  );
                  return (
                    <details
                      key={id}
                      className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                    >
                      <summary className="cursor-pointer space-y-2 p-4">
                        <span className="ml-2 font-semibold">{latest.student.name}</span>
                        <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                          #{latest.student.studentNo} · {stats.done}/{stats.total} 项已完成（{stats.percent}%）
                        </span>
                        <StatusCounts stats={stats} />
                      </summary>
                      <ul className="divide-y divide-slate-100 border-t border-slate-100 px-4 dark:divide-slate-800 dark:border-slate-800">
                        {entries.map(({ task, student }) => (
                          <li key={task.id} className="space-y-2 py-3 text-sm">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="break-words font-medium">{task.title}</span>
                              <Badge variant="outline" className={statusStyles[student.status].badge}>
                                {student.status}
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {task.className} · {task.createdAt}
                              {student.score !== undefined && ` · 得分 ${student.score}`}
                            </p>
                            {Boolean(task.items?.length) && (
                              <ul className="space-y-1 text-xs">
                                {task.items?.map(item => (
                                  <li key={item.id} className="break-words">
                                    {item.title} · {student.checkedItemIds?.includes(item.id) ? "已勾选" : "未勾选"}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

/** 任务统计主界面，管理任务列表、详情状态切换和任务表单。 */
export function TaskStats() {
  const [view, setView] = useState<TaskView>("list");
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTaskId, setActiveTaskId] = useState("");
  const [query, setQuery] = useState("");
  const [activeStatus, setActiveStatus] = useState<StudentStatus | "全部">("全部");
  const [displayMode, setDisplayMode] = useState<"card" | "seat">("card");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftType, setDraftType] = useState<TaskType>("status");
  const [draftClassId, setDraftClassId] = useState("");
  const [draftItems, setDraftItems] = useState<string[]>([]);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskDeleteId, setTaskDeleteId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [rankingOpen, setRankingOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [updatingStudentIds, setUpdatingStudentIds] = useState<Set<string>>(new Set());
  const updatingStudentIdsRef = useRef<Set<string>>(new Set());

  const activeTask = tasks.find(task => task.id === activeTaskId) ?? tasks[0];
  const draftClass = classes.find(classRoom => classRoom.id === draftClassId) ?? classes[0];

  const studentPhotos = useMemo(
    () =>
      new Map(classes.flatMap(classroom => classroom.students.map(student => [student.id, student.photo] as const))),
    [classes]
  );

  useEffect(() => {
    void Promise.allSettled([
      request<TaskItem[], TaskItem[]>("/api/task-stats"),
      request<ClassRoom[], ClassRoom[]>("/api/classes")
    ]).then(([tasksResult, classesResult]) => {
      if (tasksResult.status === "fulfilled") {
        setTasks(
          tasksResult.value.map(task => ({
            ...task,
            students: task.students.map(student => ({
              ...student,
              status: normalizeStatus(student.status)
            }))
          }))
        );
      } else {
        setActionError("加载任务失败，请重新打开任务统计。");
      }
      if (classesResult.status === "fulfilled") setClasses(classesResult.value);
      setLoading(false);
    });
  }, []);

  const handleDraftItemsChange = (newItems: string[]) => {
    setDraftItems(newItems);
    setValidationError(null);
  };

  const addDraftItem = () => {
    handleDraftItemsChange([...draftItems, ""]);
  };

  const updateDraftItem = (index: number, value: string) => {
    const next = [...draftItems];
    next[index] = value;
    handleDraftItemsChange(next);
  };

  const removeDraftItem = (index: number) => {
    const next = draftItems.filter((_, i) => i !== index);
    handleDraftItemsChange(next);
  };

  const moveDraftItem = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= draftItems.length) return;
    const next = [...draftItems];
    const temp = next[index]!;
    next[index] = next[targetIndex]!;
    next[targetIndex] = temp;
    handleDraftItemsChange(next);
  };

  // 详情页学生列表支持搜索和状态筛选
  const filteredStudents = useMemo(() => {
    if (!activeTask) return [];
    const normalizedQuery = query.trim().toLowerCase();
    return activeTask.students.filter(student => {
      const matchesQuery =
        !normalizedQuery ||
        student.name.toLowerCase().includes(normalizedQuery) ||
        student.studentNo.toLowerCase().includes(normalizedQuery);
      const matchesStatus = activeStatus === "全部" || student.status === activeStatus;
      return matchesQuery && matchesStatus;
    });
  }, [activeStatus, activeTask, query]);

  /** 基于表单草稿创建新任务，并进入新任务详情。 */
  const handleCreateTask = async () => {
    const title = draftTitle.trim() || "课后作业完成情况统计";

    // 校验子项：去除首尾空白后须为 1-128 字符，无重复无空白
    const cleanItems: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; draftType === "status" && i < draftItems.length; i += 1) {
      const raw = draftItems[i]!.trim();
      if (!raw) {
        setValidationError(`第 ${i + 1} 个子项内容不能为空`);
        return;
      }
      if (raw.length > 128) {
        setValidationError(`第 ${i + 1} 个子项长度不能超过 128 字符`);
        return;
      }
      if (seen.has(raw)) {
        setValidationError(`子项「${raw}」重复，请修改`);
        return;
      }
      seen.add(raw);
      cleanItems.push(raw);
    }

    if (!draftClass || saving) return;
    setSaving(true);
    try {
      const nextTask = await request<TaskItem, TaskItem>({
        url: "/api/task-stats",
        method: "POST",
        data: {
          title,
          classId: draftClass.id,
          type: draftType,
          statusCount: 3,
          items: cleanItems.map(itemTitle => ({ title: itemTitle }))
        }
      });
      setTasks(current => [nextTask, ...current]);
      openDetail(nextTask.id);
    } catch {
      setValidationError("创建任务失败，请检查班级和任务内容后重试。");
    } finally {
      setSaving(false);
    }
  };

  /** 打开编辑页，并把任务当前配置填入表单草稿。 */
  const openEditTask = (task: TaskItem) => {
    setEditingTaskId(task.id);
    setDraftTitle(task.title);
    setDraftType(task.type);
    setDraftItems((task.items ?? []).map(item => item.title));
    setDraftClassId(classes.find(classRoom => classRoom.name === task.className)?.id ?? classes[0]?.id ?? "");
    setValidationError(null);
    setView("edit");
  };

  /** 保存任务基础信息修改，并回到该任务详情页。 */
  const handleUpdateTask = async () => {
    if (!editingTaskId) return;
    const title = draftTitle.trim() || "课后作业完成情况统计";
    const target = tasks.find(t => t.id === editingTaskId);
    if (!target) return;

    if (saving) return;
    setSaving(true);
    try {
      const updated = await request<TaskItem, TaskItem>({
        url: `/api/task-stats/${editingTaskId}`,
        method: "PATCH",
        data: target.items?.length
          ? { title }
          : { title, className: draftClass?.name ?? target.className, type: draftType }
      });
      setTasks(current => current.map(task => (task.id === updated.id ? updated : task)));
      openDetail(updated.id);
    } catch {
      setValidationError("保存任务失败，请重试。");
    } finally {
      setSaving(false);
    }
  };

  /** 只合并当前学生，避免其他学生的并行保存被旧响应覆盖。 */
  const saveStudent = async (studentId: string, operation?: { itemId: string } | { action: ReviewAction }) => {
    if (!activeTask || resetting) return;
    const student = activeTask.students.find(item => item.id === studentId);
    const updateKey = `${activeTask.id}:${studentId}`;
    if (!student || updatingStudentIdsRef.current.has(updateKey)) return;
    updatingStudentIdsRef.current.add(updateKey);
    setUpdatingStudentIds(new Set(updatingStudentIdsRef.current));
    setActionError(null);
    try {
      const base = `/api/task-stats/${activeTask.id}/students/${studentId}`;
      const saved =
        operation && "action" in operation
          ? await request<Student, Student>({ url: `${base}/review`, method: "PATCH", data: operation })
          : operation
            ? await request<Student, Student>({
                url: `${base}/items/${operation.itemId}`,
                method: "PATCH",
                data: { checked: !(student.checkedItemIds ?? []).includes(operation.itemId) }
              })
            : (await request<TaskItem, TaskItem>({ url: `${base}/cycle-status`, method: "POST" })).students.find(
                item => item.id === studentId
              );
      if (!saved) throw new Error("Missing saved student");
      setTasks(current =>
        current.map(task =>
          task.id !== activeTask.id
            ? task
            : {
                ...task,
                students: task.students.map(item => (item.id === studentId ? { ...item, ...saved } : item))
              }
        )
      );
    } catch {
      setActionError("进度保存失败，请重试。");
    } finally {
      updatingStudentIdsRef.current.delete(updateKey);
      setUpdatingStudentIds(new Set(updatingStudentIdsRef.current));
    }
  };

  const handleResetTaskStats = async () => {
    if (!activeTask || resetting || updatingStudentIdsRef.current.size) return;
    setResetting(true);
    setActionError(null);
    try {
      const updated = await request<TaskItem, TaskItem>({
        url: `/api/task-stats/${activeTask.id}/reset`,
        method: "POST"
      });
      setTasks(current => current.map(task => (task.id === updated.id ? updated : task)));
    } catch {
      setActionError("重置失败，请重试。");
    } finally {
      setResetOpen(false);
      setResetting(false);
    }
  };

  const openDetail = (taskId: string) => {
    setActionError(null);
    setQuery("");
    setActiveStatus("全部");
    setActiveTaskId(taskId);
    setView("detail");
  };

  /** 删除任务是不可恢复操作，统一先做二次确认。 */
  const deleteTask = (taskId: string) => {
    setTaskDeleteId(taskId);
  };

  /** 打开新建任务表单并清空上次草稿。 */
  const openCreateTask = () => {
    setEditingTaskId(null);
    setDraftTitle("");
    setDraftType("status");
    setDraftItems([]);
    setValidationError(null);
    setView("create");
  };

  /** 执行确认后的任务删除，并在必要时回到任务列表。 */
  const confirmDeleteTask = async () => {
    if (!taskDeleteId) return;
    try {
      await request<{ deleted: boolean }, { deleted: boolean }>({
        url: `/api/task-stats/${taskDeleteId}`,
        method: "DELETE"
      });
    } catch {
      setActionError("删除任务失败，请重试。");
      setTaskDeleteId(null);
      return;
    }
    setTasks(current => current.filter(task => task.id !== taskDeleteId));
    if (activeTaskId === taskDeleteId) {
      const nextTask = tasks.find(task => task.id !== taskDeleteId);
      setActiveTaskId(nextTask?.id ?? "");
      setView("list");
    }
    setTaskDeleteId(null);
  };

  const deleteTaskTitle = tasks.find(item => item.id === taskDeleteId)?.title ?? "未命名任务";

  if (view === "report" || view === "leaderboard") {
    return (
      <TaskReport
        tasks={tasks}
        photos={studentPhotos}
        leaderboard={view === "leaderboard"}
        onBack={() => setView("list")}
      />
    );
  }

  if (view === "create" || view === "edit") {
    const editing = view === "edit";
    const subitemsLocked = editing;
    const configurationLocked = editing && (activeTask?.items?.length ?? 0) > 0;

    return (
      <div className="min-h-full bg-slate-100/80 p-5 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <div className="mx-auto flex min-h-[420px] w-full max-w-[620px] flex-col justify-center">
          <div className="rounded-2xl border border-white/80 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
            <div className="mb-7 flex flex-wrap items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-600 text-white shadow-sm">
                <ListChecks className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold">{editing ? "编辑任务" : "新建任务"}</h2>
              </div>
              <Button
                variant="ghost"
                disabled={saving}
                onClick={() => setView("list")}
                aria-label="返回任务列表"
                className="ml-auto text-cyan-700 dark:text-cyan-300"
              >
                返回任务列表
              </Button>
            </div>

            <div className="space-y-5">
              {validationError && (
                <div
                  role="alert"
                  className="flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-xs font-semibold text-rose-600 dark:bg-rose-950/40 dark:text-rose-300"
                >
                  <Info className="h-4 w-4 shrink-0" />
                  <span>{validationError}</span>
                </div>
              )}

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">任务名称</span>
                <Input
                  value={draftTitle}
                  onChange={event => {
                    setDraftTitle(event.target.value);
                    setValidationError(null);
                  }}
                  maxLength={128}
                  placeholder="例：课后作业完成情况统计"
                  className="h-11 border-transparent bg-slate-50 shadow-none dark:bg-slate-800"
                />
              </label>

              {draftType === "status" && (
                <div className="space-y-2.5 rounded-xl border border-slate-200/70 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">任务内容子项</span>
                      <p className="text-xs text-slate-400">创建子项后可在统计界面逐项勾选，不加子项则为手动切换状态</p>
                    </div>
                    {!subitemsLocked && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={addDraftItem}
                        className="h-8 border-cyan-600/30 text-xs font-semibold text-cyan-700 hover:bg-cyan-50 dark:text-cyan-300"
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        添加子项
                      </Button>
                    )}
                  </div>

                  {subitemsLocked ? (
                    <div className="space-y-2 rounded-lg bg-white p-3 text-xs text-slate-500 shadow-sm dark:bg-slate-800">
                      <p className="font-semibold text-slate-600 dark:text-slate-300">已固化的子项列表（只读）：</p>
                      <ul className="list-inside list-disc space-y-1">
                        {draftItems.map((item, idx) => (
                          <li key={idx} className="truncate">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {draftItems.map((item, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <span className="w-5 text-center text-xs font-bold text-slate-400">{index + 1}</span>
                          <Input
                            value={item}
                            onChange={e => updateDraftItem(index, e.target.value)}
                            placeholder={`例如：第 ${index + 1} 题作业订正`}
                            className="h-9 flex-1 bg-white text-xs dark:bg-slate-800"
                          />
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => moveDraftItem(index, "up")}
                              disabled={index === 0}
                              className="h-8 w-8 text-slate-400"
                              aria-label="上移"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => moveDraftItem(index, "down")}
                              disabled={index === draftItems.length - 1}
                              className="h-8 w-8 text-slate-400"
                              aria-label="下移"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => removeDraftItem(index)}
                              className="h-8 w-8 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                              aria-label="删除子项"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {draftItems.length === 0 && (
                        <div className="rounded-lg border border-dashed border-slate-300 py-3 text-center text-xs text-slate-400 dark:border-slate-700">
                          暂无子项。点击右上角「添加子项」可添加如“订正第1题”、“完成阅读记录”
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">任务类型</span>
                <div className="grid grid-cols-2 rounded-lg bg-slate-50 p-1 dark:bg-slate-800">
                  {[
                    { value: "status" as TaskType, label: "状态任务", icon: Check },
                    { value: "score" as TaskType, label: "分数任务", icon: BarChart3 }
                  ].map(item => (
                    <button
                      key={item.value}
                      disabled={configurationLocked}
                      onClick={() => setDraftType(item.value)}
                      className={cn(
                        "flex h-10 items-center justify-center gap-2 rounded-md text-sm font-semibold text-slate-500 transition",
                        draftType === item.value &&
                          "bg-white text-cyan-700 shadow-sm dark:bg-slate-900 dark:text-cyan-300"
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">选择班级</span>
                <div className="flex flex-wrap gap-2">
                  {classes.map(classRoom => (
                    <Button
                      key={classRoom.id}
                      size="sm"
                      variant={draftClass?.id === classRoom.id ? "default" : "outline"}
                      disabled={configurationLocked}
                      onClick={() => setDraftClassId(classRoom.id)}
                      className={cn(draftClass?.id === classRoom.id && "bg-cyan-600 hover:bg-cyan-700")}
                    >
                      {classRoom.name}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
                <p className="font-semibold">{draftType === "status" && draftItems.length ? 4 : 3} 种任务状态</p>
                <p>
                  已完成（绿）、待改正（红）、未完成（灰）。
                  {draftType === "status" && draftItems.length > 0 && "部分勾选为待提交（黄），教师可标记待改正。"}
                </p>
              </div>
              {!editing && !loading && classes.length === 0 && (
                <p role="status" className="text-sm text-slate-500">
                  找不到可用班级，请检查学生管理中的班级或重新打开任务统计。
                </p>
              )}

              <Button
                className="h-12 w-full bg-cyan-600 text-base font-bold hover:bg-cyan-700"
                onClick={() => void (editing ? handleUpdateTask() : handleCreateTask())}
                disabled={saving || (!editing && (loading || classes.length === 0))}
              >
                {saving ? "正在保存…" : editing ? "保存任务" : "立即创建并开始统计"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === "detail" && activeTask) {
    const stats = getTaskStats(activeTask);
    const hasItems = hasChecklist(activeTask);
    const activeCycle = hasItems ? checklistStatuses : statusCycle;

    return (
      <>
        <div className="flex min-h-full flex-col bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
          <header className="border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  setResetOpen(false);
                  setView("list");
                }}
                aria-label="返回任务列表"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-600 text-white">
                <BookOpenCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="truncate text-lg font-bold">{activeTask.title}</h1>
                  <Badge variant="outline" className="text-xs">
                    {hasItems ? `${activeTask.items?.length} 个子项` : "无子项手动"}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {activeCycle.length} 态统计
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs font-semibold uppercase text-slate-400">
                  {activeTask.className} · {stats.total} 名学生 · 完成率 {stats.percent}%
                </p>
              </div>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              <div className="relative min-w-[170px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
                <Input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="查找学员/学号..."
                  className="h-10 border-transparent bg-slate-50 pl-9 shadow-none dark:bg-slate-800"
                />
              </div>
              {[
                { mode: "card" as const, label: "卡片模式 (4列)", icon: Grid2X2 },
                { mode: "seat" as const, label: "紧凑列表", icon: LayoutGrid }
              ].map(item => (
                <Button
                  key={item.mode}
                  size="sm"
                  variant={displayMode === item.mode ? "default" : "outline"}
                  onClick={() => setDisplayMode(item.mode)}
                  className={cn("h-10 shrink-0", displayMode === item.mode && "bg-cyan-600 hover:bg-cyan-700")}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Button>
              ))}
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={() => setRankingOpen(true)}>
                <BarChart3 className="h-4 w-4" />
                排名
              </Button>
              {["全部", ...activeCycle].map(status => {
                const count =
                  status === "全部"
                    ? stats.total
                    : activeTask.students.filter(student => student.status === status).length;
                return (
                  <button
                    key={status}
                    onClick={() => setActiveStatus(status as StudentStatus | "全部")}
                    className={cn(
                      "flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-bold transition",
                      activeStatus === status
                        ? "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/60 dark:text-cyan-300"
                        : "border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-900"
                    )}
                  >
                    {status}
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] dark:bg-slate-800">
                      {count}
                    </span>
                  </button>
                );
              })}
              <Button
                size="sm"
                variant="ghost"
                className="h-9 shrink-0 text-slate-400 hover:text-slate-600"
                onClick={() => setResetOpen(true)}
                disabled={resetting || updatingStudentIds.size > 0}
              >
                <RotateCcw className="h-4 w-4" />
                {hasItems ? "清空勾选" : "重置状态"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-9 shrink-0 text-slate-400 hover:text-slate-600"
                onClick={() => openEditTask(activeTask)}
                disabled={resetting || updatingStudentIds.size > 0}
              >
                <Settings className="h-4 w-4" />
                编辑任务设置
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-9 shrink-0 text-rose-500 hover:text-rose-600"
                onClick={() => deleteTask(activeTask.id)}
              >
                <Trash2 className="h-4 w-4" />
                删除任务
              </Button>
            </div>
          </header>

          {actionError && (
            <p role="alert" className="px-5 pt-3 text-sm text-rose-700 dark:text-rose-300">
              {actionError}
            </p>
          )}

          {/* 卡片模式下宽屏显示一行4列 (xl:grid-cols-4) */}
          <main
            className={cn(
              "grid gap-4 p-4 sm:p-5",
              displayMode === "card"
                ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4"
                : "grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3"
            )}
          >
            {filteredStudents.map(student => {
              const style = statusStyles[student.status];
              const updateKey = `${activeTask.id}:${student.id}`;
              const updating = updatingStudentIds.has(updateKey);
              const checkedCount = countChecked(activeTask, student);
              const totalSubItems = activeTask.items?.length ?? 0;

              return (
                <div
                  key={student.id}
                  className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  {/* 顶部/左侧区域：姓名、头像、任务名称、完成状态 */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {/* 学生头像 */}
                      <div className="shrink-0 [&>div]:h-12 [&>div]:w-12 [&>div]:text-base">
                        <StudentAvatar name={student.name} photo={studentPhotos.get(student.id)} />
                      </div>

                      {/* 姓名、学号、任务名称与总体完成状态 */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="min-w-0 break-words font-bold text-slate-800 dark:text-slate-100">
                            {student.name}
                          </span>
                          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                            #{student.studentNo}
                          </span>
                        </div>
                        <div
                          className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400"
                          title={activeTask.title}
                        >
                          {activeTask.title}
                        </div>
                        <div className="mt-2">
                          <Badge
                            variant="outline"
                            className={cn("text-xs font-semibold px-2 py-0.5 transition", style.badge)}
                          >
                            {student.status}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {hasItems && checkedCount > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={updating || resetting}
                        onClick={() =>
                          void saveStudent(student.id, {
                            action: student.needsCorrection ? "complete" : "requestCorrection"
                          })
                        }
                        className="h-8 shrink-0 px-2 text-xs"
                      >
                        {student.needsCorrection ? "已完成" : "待改正"}
                      </Button>
                    )}
                    {/* 无子项任务保留快捷状态轮转操作 */}
                    {!hasItems && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void saveStudent(student.id)}
                        disabled={updating || resetting}
                        className="text-xs shrink-0 h-8 border-cyan-200 text-cyan-700 hover:bg-cyan-50 dark:border-cyan-900 dark:text-cyan-300"
                      >
                        切换状态
                      </Button>
                    )}
                  </div>

                  {/* 右边/下方：显示任务子项（可勾选状态，状态根据子项统计） */}
                  {hasItems && (
                    <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                      <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                        <span>任务内容子项</span>
                        <span className="tabular-nums">
                          {checkedCount}/{totalSubItems} 完成
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {activeTask.items?.map(item => {
                          const isChecked = (student.checkedItemIds ?? []).includes(item.id);
                          return (
                            <label
                              key={item.id}
                              className={cn(
                                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition cursor-pointer select-none",
                                isChecked
                                  ? "bg-emerald-50/70 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                                  : "bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-slate-800/60 dark:text-slate-300"
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={updating || resetting}
                                onChange={() => void saveStudent(student.id, { itemId: item.id })}
                                className="h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
                                aria-label={`${student.name} - ${item.title}`}
                              />
                              <span
                                className={cn(
                                  "min-w-0 flex-1 break-words font-medium",
                                  isChecked && "line-through opacity-75"
                                )}
                              >
                                {item.title}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {filteredStudents.length === 0 && (
              <p className="col-span-full py-10 text-center text-sm text-slate-500">暂无符合条件的学生</p>
            )}
          </main>

          {/* 底部统计栏：展示各状态进度与完成率 */}
          <footer
            aria-label="全班完成进度统计"
            className="mx-auto mb-6 w-[calc(100%_-_2rem)] max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-800 dark:bg-slate-900 sm:p-5"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
              <span>全班完成进度统计</span>
              <span className="font-bold text-emerald-600">
                {stats.percent}% ({stats.done}/{stats.total} 人已完成)
              </span>
            </div>
            <div className={cn("grid gap-3", hasItems ? "sm:grid-cols-4" : "sm:grid-cols-3")}>
              {stats.statusPercents.map(item => (
                <div key={item.status} className="text-center">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-medium text-slate-400 truncate">{item.status}</span>
                    <span className={cn("font-bold tabular-nums", statusStyles[item.status].text)}>
                      {item.count}人（{item.percent}%）
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", statusStyles[item.status].bar)}
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </footer>
        </div>
        {rankingOpen && (
          <TaskRankingDialog task={activeTask} photos={studentPhotos} onClose={() => setRankingOpen(false)} />
        )}
        <ConfirmDialog
          open={resetOpen}
          title="重置任务进度"
          description="确定将当前任务的所有学生恢复为未完成吗？"
          confirmText="重置"
          onConfirm={handleResetTaskStats}
          onCancel={() => setResetOpen(false)}
        />
        <ConfirmDialog
          open={Boolean(taskDeleteId)}
          title="删除任务"
          description={`确定删除任务「${deleteTaskTitle}」吗？删除后不可恢复。`}
          confirmText="删除"
          onConfirm={confirmDeleteTask}
          onCancel={() => setTaskDeleteId(null)}
        />
      </>
    );
  }

  return (
    <>
      <div className="min-h-full bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <header className="border-b border-slate-200 bg-white px-6 py-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-600 text-white shadow-sm">
                <ClipboardList className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold">任务统计</h1>
                <p className="text-sm font-medium text-slate-400">最近 {tasks.length} 个任务</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={loading || Boolean(actionError && tasks.length === 0)}
                onClick={() => setView("report")}
              >
                <BarChart3 className="h-4 w-4" />
                统计
              </Button>
              <Button
                variant="outline"
                disabled={loading || Boolean(actionError && tasks.length === 0)}
                onClick={() => setView("leaderboard")}
              >
                排行榜
              </Button>
              <Button className="bg-cyan-600 font-bold hover:bg-cyan-700" onClick={openCreateTask}>
                <Plus className="h-4 w-4" />
                新建任务
              </Button>
            </div>
          </div>
        </header>

        <main className="space-y-4 p-5">
          {actionError && (
            <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">
              {actionError}
            </p>
          )}
          {loading && (
            <p role="status" className="text-sm text-slate-500">
              正在加载任务…
            </p>
          )}
          {tasks.map(task => {
            const stats = getTaskStats(task);
            const hasItems = (task.items?.length ?? 0) > 0;
            return (
              <article
                key={task.id}
                onClick={() => openDetail(task.id)}
                className="w-full cursor-pointer rounded-2xl bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-900"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300">
                    <ClipboardList className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="truncate text-lg font-bold">{task.title}</h3>
                          {hasItems ? (
                            <Badge
                              variant="outline"
                              className="text-xs border-cyan-500/40 text-cyan-700 dark:text-cyan-300"
                            >
                              含 {task.items?.length} 个子项
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              无子项手动
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-sm font-medium text-slate-400">
                          {task.className} · {stats.total} 人
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={event => {
                            event.stopPropagation();
                            deleteTask(task.id);
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-500 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                          aria-label="删除任务"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <ArrowLeft className="h-4 w-4 rotate-180 text-slate-300" />
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between text-sm font-bold">
                      <span className="text-emerald-600">
                        {stats.done} / {stats.total} 已完成
                      </span>
                      <span className="text-slate-500">{stats.percent}%</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${stats.percent}%` }} />
                    </div>

                    <div className="mt-3">
                      <StatusCounts stats={stats} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        创建于 {task.createdAt}
                      </span>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}

          {!loading && !actionError && tasks.length === 0 && (
            <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed bg-white text-slate-400 dark:border-slate-800 dark:bg-slate-900">
              <ClipboardList className="mb-3 h-10 w-10" />
              暂无任务
            </div>
          )}
        </main>
      </div>
      <ConfirmDialog
        open={Boolean(taskDeleteId)}
        title="删除任务"
        description={`确定删除任务「${deleteTaskTitle}」吗？删除后不可恢复。`}
        confirmText="删除"
        onConfirm={confirmDeleteTask}
        onCancel={() => setTaskDeleteId(null)}
      />
    </>
  );
}
