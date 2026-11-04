"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Sparkles, Clock, Cloud, Play, CheckCircle2, Trash2, Edit3, Plus, X, FileText } from "lucide-react";
import request from "@/lib/request";
import type { Student, StageScheduledTask, Subject, Term } from "./types";

export type StageReportSchedulerViewProps = {
  students: Student[];
  subjects: Subject[];
  activeTerm?: Term | null;
  onReportsChanged: () => void;
  onNavigateToDashboard: () => void;
  onNavigateToCompose?: () => void;
  initialTasks?: StageScheduledTask[];
  onActiveTaskCountChange?: (count: number) => void;
};

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getRecentMonthRange(now = new Date()) {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end.getFullYear(), end.getMonth() - 1, 1);
  const lastDayOfPreviousMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  start.setDate(Math.min(end.getDate(), lastDayOfPreviousMonth));
  return { start: formatLocalDate(start), end: formatLocalDate(end) };
}

type ScheduledTaskResponse = Omit<
  StageScheduledTask,
  "schedDate" | "schedTime" | "executeTimestamp" | "isCloudDaemon"
> & {
  executeAt: string;
  repeatType?: "none" | "weekly" | "monthly";
  stageCustomName?: string;
};

function normalizeDateStr(val?: string): string {
  if (!val) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  try {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(d);
      const y = parts.find(p => p.type === "year")?.value || "";
      const m = parts.find(p => p.type === "month")?.value || "";
      const day = parts.find(p => p.type === "day")?.value || "";
      return `${y}-${m}-${day}`;
    }
  } catch {
    // ignore
  }
  return val.slice(0, 10);
}

function fromScheduledTaskResponse(task: ScheduledTaskResponse): StageScheduledTask {
  const executeAt = new Date(task.executeAt || Date.now());
  const stageCustomName =
    task.stageCustomName ||
    (task as { stageTitle?: string }).stageTitle ||
    (task as { customStageName?: string }).customStageName ||
    "";
  return {
    ...task,
    startDate: normalizeDateStr(task.startDate),
    endDate: normalizeDateStr(task.endDate),
    studentIds: Array.isArray(task.studentIds) ? task.studentIds : [],
    studentNames: task.studentNames || "",
    schedDate: formatLocalDate(executeAt),
    schedTime: `${String(executeAt.getHours()).padStart(2, "0")}:${String(executeAt.getMinutes()).padStart(2, "0")}`,
    executeTimestamp: executeAt.getTime(),
    repeatType: task.repeatType || "none",
    stageCustomName,
    isCloudDaemon: true
  };
}

export function StageReportSchedulerView({
  students,
  subjects,
  activeTerm,
  onReportsChanged,
  onNavigateToDashboard,
  initialTasks = [],
  onActiveTaskCountChange
}: StageReportSchedulerViewProps) {
  // 任务队列
  const [tasks, setTasks] = useState<StageScheduledTask[]>(() => {
    const seen = new Set<string>();
    return initialTasks.filter(task => {
      if (!task?.id || seen.has(task.id)) return false;
      seen.add(task.id);
      return true;
    });
  });
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  // 表单状态
  const initialRange = getRecentMonthRange();
  const [taskName, setTaskName] = useState("阶段成长汇总");
  const [selectedClassId, setSelectedClassId] = useState<string>("all");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(initialRange.start);
  const [endDate, setEndDate] = useState(initialRange.end);
  const [schedDate, setSchedDate] = useState(initialRange.end);
  const [schedTime, setSchedTime] = useState("20:00");
  const [periodPreset, setPeriodPreset] = useState<"recent-month" | "current-term" | "custom">("recent-month");
  const [repeatType, setRepeatType] = useState<"none" | "weekly" | "monthly">("none");
  const [stageCustomName, setStageCustomName] = useState("");

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [hasAiReportPermission, setHasAiReportPermission] = useState<boolean | null>(null);
  const completedTaskIds = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    request
      .get<{ hasPermission: boolean }, { hasPermission: boolean }>("/api/semester-reports/ai-permission")
      .then(res => {
        if (!cancelled) {
          setHasAiReportPermission(Boolean(res?.hasPermission));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasAiReportPermission(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 保证任务列表 ID 唯一性，避免并发 SSE 同步与本地更新产生重复键
  const uniqueTasks = useMemo(() => {
    const seen = new Set<string>();
    return tasks.filter(task => {
      if (!task?.id || seen.has(task.id)) return false;
      seen.add(task.id);
      return true;
    });
  }, [tasks]);

  // 通知主视图活跃任务数
  useEffect(() => {
    const activeCount = uniqueTasks.filter(t => t.status === "pending" || t.status === "running").length;
    onActiveTaskCountChange?.(activeCount);
  }, [uniqueTasks, onActiveTaskCountChange]);

  // 显示提示
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  const onReportsChangedRef = useRef(onReportsChanged);
  useEffect(() => {
    onReportsChangedRef.current = onReportsChanged;
  });

  const showToastRef = useRef(showToast);
  useEffect(() => {
    showToastRef.current = showToast;
  });

  // 只使用当前教师接口返回的学生，不用演示班级或学生补齐空数据。
  const enrichedStudents = useMemo(() => {
    const mockMeta: Record<string, { weeklyCount: number; coverage: string; avatarBg: string }> = {
      s1: { weeklyCount: 9, coverage: "75.0%", avatarBg: "bg-indigo-500" },
      s2: { weeklyCount: 8, coverage: "66.7%", avatarBg: "bg-rose-500" },
      s3: { weeklyCount: 10, coverage: "83.3%", avatarBg: "bg-emerald-500" },
      s4: { weeklyCount: 7, coverage: "58.3%", avatarBg: "bg-amber-500" },
      s5: { weeklyCount: 9, coverage: "75.0%", avatarBg: "bg-purple-500" },
      s6: { weeklyCount: 10, coverage: "83.3%", avatarBg: "bg-sky-500" },
      s7: { weeklyCount: 8, coverage: "66.7%", avatarBg: "bg-pink-500" },
      s8: { weeklyCount: 9, coverage: "75.0%", avatarBg: "bg-teal-500" },
      s9: { weeklyCount: 0, coverage: "0%", avatarBg: "bg-slate-500" }
    };

    return students.map((s, idx) => ({
      ...s,
      weeklyCount: mockMeta[s.id]?.weeklyCount ?? 8,
      coverage: mockMeta[s.id]?.coverage ?? "66.7%",
      avatarBg: mockMeta[s.id]?.avatarBg ?? (idx % 2 === 0 ? "bg-indigo-500" : "bg-purple-500")
    }));
  }, [students]);

  const availableClasses = useMemo(() => {
    const classes = new Map<string, { id: string; name: string; count: number }>();
    enrichedStudents.forEach(student => {
      const id = student.classId || `name:${student.className}`;
      const current = classes.get(id);
      classes.set(id, { id, name: student.className, count: (current?.count ?? 0) + 1 });
    });
    return Array.from(classes.values());
  }, [enrichedStudents]);

  const belongsToClass = useCallback(
    (student: (typeof enrichedStudents)[number], classId: string) =>
      classId === "all" || (student.classId || `name:${student.className}`) === classId,
    []
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const validIds = new Set(enrichedStudents.map(student => student.id));
      setSelectedStudentIds(previous => previous.filter(id => validIds.has(id)));
      if (selectedClassId !== "all" && !availableClasses.some(item => item.id === selectedClassId)) {
        setSelectedClassId("all");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [availableClasses, enrichedStudents, selectedClassId]);

  // 根据当前选择班级过滤
  const visibleStudents = useMemo(() => {
    if (selectedClassId === "all") return enrichedStudents;
    return enrichedStudents.filter(s => belongsToClass(s, selectedClassId));
  }, [belongsToClass, enrichedStudents, selectedClassId]);

  const applyTasksUpdate = useCallback((rows: ScheduledTaskResponse[]) => {
    const seen = new Set<string>();
    const next: StageScheduledTask[] = [];
    for (const row of rows) {
      const task = fromScheduledTaskResponse(row);
      if (task?.id && !seen.has(task.id)) {
        seen.add(task.id);
        next.push(task);
      }
    }
    const newlyCompleted = next.filter(task => task.status === "completed" && !completedTaskIds.current.has(task.id));
    next.filter(task => task.status === "completed").forEach(task => completedTaskIds.current.add(task.id));
    setTasks(next);
    if (newlyCompleted.length) {
      onReportsChangedRef.current();
    }
  }, []);

  const refreshTasks = useCallback(async () => {
    try {
      const rows = await request.get<ScheduledTaskResponse[], ScheduledTaskResponse[]>(
        "/api/semester-reports/scheduled-tasks"
      );
      applyTasksUpdate(rows);
    } catch {
      // 容错处理，保留现有列表
    }
  }, [applyTasksUpdate]);

  // 采用 Server-Sent Events (SSE) 实时接收任务状态与进度推送，替代前端短轮询
  useEffect(() => {
    // 首次进入组件先请求一次基础数据做兜底渲染
    void refreshTasks().catch(() => showToastRef.current("云端定时任务加载失败，请稍后重试"));

    // 运行环境中若不支持 EventSource（例如非浏览器端）则退出
    if (typeof window === "undefined" || typeof window.EventSource === "undefined") {
      return;
    }

    const eventSource = new EventSource("/api/semester-reports/scheduled-tasks/stream");

    eventSource.onmessage = event => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type === "tasks_sync" && Array.isArray(payload.tasks)) {
          applyTasksUpdate(payload.tasks as ScheduledTaskResponse[]);
        }
      } catch {
        // 忽略非 JSON 或心跳包
      }
    };

    eventSource.onerror = () => {
      // 浏览器 EventSource 在连接中断时会自动按退避算法自动重连
    };

    return () => {
      eventSource.close();
    };
  }, [applyTasksUpdate, refreshTasks]);

  const executeTask = useCallback(
    async (task: StageScheduledTask) => {
      if (hasAiReportPermission === false) {
        showToast("您暂无 AI 汇总报告使用权限，请联系管理员开启授权");
        return;
      }
      try {
        await request.post(`/api/semester-reports/scheduled-tasks/${task.id}/execute`);
        setTasks(previous => previous.map(item => (item.id === task.id ? { ...item, status: "running" } : item)));
        showToast(`任务【${task.name}】已加入服务端生成队列`);
        await refreshTasks().catch(() => undefined);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "任务执行失败");
      }
    },
    [hasAiReportPermission, refreshTasks, showToast]
  );

  // 快捷设置时间
  function quickSetSeconds(sec: number) {
    if (hasAiReportPermission === false) {
      showToast("您暂无 AI 汇总报告使用权限，请联系管理员开启授权");
      return;
    }
    const target = new Date(Date.now() + sec * 1000);
    const fmtDate = formatLocalDate(target);
    const fmtTime = `${String(target.getHours()).padStart(2, "0")}:${String(target.getMinutes()).padStart(2, "0")}`;

    setSchedDate(fmtDate);
    setSchedTime(fmtTime);

    // 快捷创建或保存任务
    handleSaveTask(target.getTime(), `${sec}秒后自动执行 (演示)`);
  }

  function quickSetFixed(type: "today-20" | "friday-17") {
    const now = new Date();
    const d = new Date(now);
    if (type === "today-20") {
      d.setHours(20, 0, 0, 0);
      if (d <= now) d.setDate(d.getDate() + 1);
    } else if (type === "friday-17") {
      const diff = (5 - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      d.setHours(17, 0, 0, 0);
    }

    const fmtDate = formatLocalDate(d);
    const fmtTime = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    setSchedDate(fmtDate);
    setSchedTime(fmtTime);
    showToast(`已填入时间点: ${fmtDate} ${fmtTime}`);
  }

  // 保存任务（新建或修改）
  async function handleSaveTask(explicitTimestamp?: number, note?: string) {
    if (hasAiReportPermission === false) {
      showToast("您暂无 AI 汇总报告使用权限，请联系管理员开启授权");
      return;
    }
    if (selectedStudentIds.length === 0) {
      showToast("请至少勾选一位学生！");
      return;
    }
    if (selectedStudentIds.length > 200) {
      showToast("云端定时汇总任务单次最多支持 200 名学生！");
      return;
    }

    const explicitDate = explicitTimestamp ? new Date(explicitTimestamp) : null;
    const effectiveSchedDate = explicitDate ? formatLocalDate(explicitDate) : schedDate;
    const effectiveSchedTime = explicitDate
      ? `${String(explicitDate.getHours()).padStart(2, "0")}:${String(explicitDate.getMinutes()).padStart(2, "0")}`
      : schedTime;
    let targetTime = explicitTimestamp || new Date(`${effectiveSchedDate}T${effectiveSchedTime}:00`).getTime();
    if (!Number.isFinite(targetTime)) {
      showToast("请设置有效的云端自动执行时间！");
      return;
    }
    if (!startDate || !endDate || startDate > endDate) {
      showToast("阶段周期的开始日期不能晚于结束日期！");
      return;
    }
    if (endDate > effectiveSchedDate) {
      showToast("阶段周期的结束日期不能晚于云端自动执行日期！");
      return;
    }
    if (targetTime < Date.now() + 5000) {
      if (!explicitTimestamp && effectiveSchedDate === formatLocalDate(new Date())) {
        targetTime = Date.now() + 10000;
      } else {
        showToast("云端执行时间至少需晚于当前时间 5 秒！");
        return;
      }
    }
    if (!activeTerm) {
      showToast("当前学期数据尚未加载！");
      return;
    }
    if (!subjects.length) {
      showToast("请先在学期学科设置中添加至少一门学科！");
      return;
    }
    try {
      const response = await request.post<ScheduledTaskResponse, ScheduledTaskResponse>(
        "/api/semester-reports/scheduled-tasks",
        {
          name: taskName,
          stageCustomName: stageCustomName.trim(),
          classId: selectedClassId,
          termId: activeTerm.id,
          studentIds: selectedStudentIds,
          startDate,
          endDate,
          generationMode: "ai",
          executeAt: new Date(targetTime).toISOString(),
          repeatType,
          courseSelections: subjects.map(subject => ({
            subjectId: subject.id,
            courseScope: "",
            manualContent: ""
          }))
        }
      );
      const newTask = fromScheduledTaskResponse(response);
      if (editingTaskId) {
        await request.delete(`/api/semester-reports/scheduled-tasks/${editingTaskId}`);
        setTasks(previous => [
          newTask,
          ...previous.filter(task => task.id !== editingTaskId && task.id !== newTask.id)
        ]);
        cancelEditingTask();
        showToast(`✅ 已成功修改任务【${taskName}】，云端调度已更新`);
      } else {
        setTasks(previous => [newTask, ...previous.filter(task => task.id !== newTask.id)]);
        showToast(`✅ 定时任务已持久化到云端${note ? ` (${note})` : ""}`);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "定时任务保存失败");
    }
  }

  // 修改指定任务
  function editStageTask(task: StageScheduledTask) {
    setEditingTaskId(task.id);
    setTaskName(task.name);
    setStageCustomName(
      task.stageCustomName ||
        (task as { stageTitle?: string }).stageTitle ||
        (task as { customStageName?: string }).customStageName ||
        ""
    );
    const editableStudentIds = task.studentIds.filter(id => enrichedStudents.some(student => student.id === id));
    const editableClassId =
      task.classId && availableClasses.some(item => item.id === task.classId) ? task.classId : "all";
    setSelectedClassId(editableClassId);
    setSelectedStudentIds(editableStudentIds);
    setStartDate(task.startDate);
    setEndDate(task.endDate);
    setSchedDate(task.schedDate);
    setSchedTime(task.schedTime);
    setPeriodPreset("custom");
    setRepeatType(task.repeatType || "none");

    const formElement = document.getElementById("stageTaskConfigCard");
    if (formElement && typeof formElement.scrollIntoView === "function") {
      formElement.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    showToast(`已将【${task.name}】载入表单，可调整时间或学生范围`);
  }

  function cancelEditingTask() {
    setEditingTaskId(null);
    setStageCustomName("");
    setPeriodPreset("recent-month");
    setRepeatType("none");
  }

  // 取消任务
  async function cancelStageTask(taskId: string) {
    const target = tasks.find(task => task.id === taskId);
    try {
      await request.delete(`/api/semester-reports/scheduled-tasks/${taskId}`);
      setTasks(previous => previous.filter(task => task.id !== taskId));
      if (target) showToast(`已取消并移除定时任务【${target.name}】`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "取消定时任务失败");
    }
  }

  return (
    <div className="space-y-4">
      {/* 顶部 Toast 提示 */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 left-1/2 z-[9999] -translate-x-1/2 rounded-2xl bg-slate-900/90 px-4 py-2.5 text-xs font-semibold text-white shadow-xl backdrop-blur-xs transition"
        >
          {toastMessage}
        </div>
      )}

      {/* 0. 权限提示横幅 (未授权时展示) */}
      {hasAiReportPermission === false && (
        <section
          role="alert"
          aria-label="AI 报告权限提示"
          className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-amber-900 shadow-xs dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-base dark:bg-amber-900/50">
            🔒
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold">暂无 AI 汇总报告使用权限</h3>
            <p className="text-xs text-amber-800/90 dark:text-amber-300/90">
              当前教师账号尚未配置 AI 汇总报告权限。未授权状态下无法创建新的 AI
              阶段汇总定时任务或立即触发离线分析。如需开启，请联系系统管理员在管理后台【AI
              报告配置】中授权您的教师账号。
            </p>
          </div>
        </section>
      )}

      {/* 1. 云端离线守护横幅 (强调退出登录也不影响) */}
      <section className="space-y-3 rounded-2xl border border-purple-200 bg-gradient-to-r from-purple-50/90 via-indigo-50/70 to-white p-4 shadow-xs dark:border-purple-800 dark:from-purple-950/50 dark:via-indigo-950/40 dark:to-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white shadow-xs">
              <Cloud className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900 dark:text-slate-100">AI 阶段汇总定时任务中心</span>
                <span className="flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  <span>服务端离线守护 · 支持多任务</span>
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                任务由云端 Worker 独立调度，
                <strong>即使老师关闭网页、退出登录或关机离线，到达时间点系统依然自动汇总并生成草稿</strong>
                。生成结果直接存入【报告管理与分发】。
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onNavigateToDashboard}
              className="flex items-center gap-1.5 rounded-xl border bg-card px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-muted"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>📋 查看报告管理列表</span>
            </button>
          </div>
        </div>
      </section>

      {/* 2. 任务创建与修改配置表单卡片 */}
      <section id="stageTaskConfigCard" className="space-y-4 rounded-2xl border bg-card p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold sm:text-base">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-100 text-[11px] font-bold text-purple-700 dark:bg-purple-900/60 dark:text-purple-300">
                {editingTaskId ? "✏️" : "1"}
              </span>
              <span>{editingTaskId ? `正在修改定时任务: 【${taskName}】` : "新建 AI 阶段汇总定时任务"}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  editingTaskId
                    ? "bg-amber-100 text-amber-800"
                    : "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300"
                }`}
              >
                {editingTaskId ? "修改模式" : "多任务队列"}
              </span>
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              可针对不同班级或学生群体配置多个不同时间点的汇总任务；任务保存后可随时修改或取消。
            </p>
          </div>

          <div className="flex items-center gap-2">
            {editingTaskId && (
              <button
                type="button"
                id="btnCancelEditTask"
                onClick={cancelEditingTask}
                className="flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" />
                <span>取消修改</span>
              </button>
            )}
            <div className="flex items-center gap-2">
              <select
                id="stageClassFilterSelect"
                value={selectedClassId}
                onChange={e => {
                  const cls = e.target.value;
                  setSelectedClassId(cls);
                  if (cls === "all") {
                    setSelectedStudentIds(enrichedStudents.filter(s => s.weeklyCount > 0).map(s => s.id));
                  } else {
                    setSelectedStudentIds(
                      enrichedStudents.filter(s => belongsToClass(s, cls) && s.weeklyCount > 0).map(s => s.id)
                    );
                  }
                }}
                className="h-8 rounded-xl border bg-muted/40 px-2.5 text-xs font-medium"
              >
                <option value="all">全部班级 (共{enrichedStudents.length}人)</option>
                {availableClasses.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.count}人)
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  let ids: string[];
                  if (selectedClassId === "all") {
                    ids = enrichedStudents.filter(s => s.weeklyCount > 0).map(s => s.id);
                  } else {
                    ids = enrichedStudents
                      .filter(s => belongsToClass(s, selectedClassId) && s.weeklyCount > 0)
                      .map(s => s.id);
                  }
                  if (ids.length === 0) {
                    showToast("当前班级暂无有效周报学生可供选择");
                    return;
                  }
                  if (ids.length > 200) {
                    setSelectedStudentIds(ids.slice(0, 200));
                    showToast("已选中前 200 名有效学生（单次定时任务上限为 200 人）");
                  } else {
                    setSelectedStudentIds(ids);
                    showToast(`已全选有效学生 (${ids.length}人)`);
                  }
                }}
                className="rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-700 hover:bg-purple-100 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300"
              >
                全选本班
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedStudentIds([]);
                  showToast("已清空学生勾选");
                }}
                className="rounded-lg border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
              >
                清空
              </button>
            </div>
          </div>
        </div>

        {/* 任务名称与学生选择 */}
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="stageTaskNameInput" className="mb-1 block text-xs font-bold text-muted-foreground">
                任务名称（用于标识不同汇总批次）
              </label>
              <input
                type="text"
                id="stageTaskNameInput"
                value={taskName}
                onChange={e => setTaskName(e.target.value)}
                className="h-9 w-full rounded-xl border bg-muted/30 px-3 text-xs"
                placeholder="例如：一年级1班春季阶段成长汇总"
              />
            </div>
            <div>
              <label
                htmlFor="stageCustomNameInput"
                className="mb-1 flex items-center justify-between text-xs font-bold text-purple-800 dark:text-purple-300"
              >
                <span>报告“本阶段”替代文字</span>
                <span className="font-normal text-[11px] text-muted-foreground">可选</span>
              </label>
              <input
                type="text"
                id="stageCustomNameInput"
                value={stageCustomName}
                onChange={e => setStageCustomName(e.target.value)}
                className="h-9 w-full rounded-xl border border-purple-200 bg-purple-50/30 px-3 text-xs placeholder:text-muted-foreground/60 focus:border-purple-500 dark:border-purple-800 dark:bg-purple-950/20"
                placeholder="如：10月份、期中阶段（报告中本阶段将自动替换）"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-muted-foreground">
                学生挑选范围（点击下方卡片可自由多选组合）
              </label>
              <div className="flex h-9 items-center justify-between rounded-xl border bg-muted/20 px-3 text-xs">
                <span>
                  已选中 <strong className="font-bold text-purple-600">{selectedStudentIds.length}</strong> 位学生
                </span>
                <span className="text-[11px] text-muted-foreground">涵盖多学科已发布周报</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5" id="stageStudentsGrid">
            {visibleStudents.map(stu => {
              const isSelected = selectedStudentIds.includes(stu.id);
              const hasWeekly = stu.weeklyCount > 0;

              return (
                <div
                  key={stu.id}
                  onClick={() => {
                    if (!hasWeekly) {
                      showToast(`${stu.name}在阶段内无任何有效周报，无法生成阶段报告`);
                      return;
                    }
                    setSelectedStudentIds(prev => {
                      if (prev.includes(stu.id)) {
                        return prev.filter(x => x !== stu.id);
                      }
                      if (prev.length >= 200) {
                        showToast("定时任务单次最多支持 200 名学生，已达到上限");
                        return prev;
                      }
                      return [...prev, stu.id];
                    });
                  }}
                  className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 transition ${
                    !hasWeekly ? "cursor-not-allowed bg-muted/40 opacity-50" : "cursor-pointer hover:bg-muted/40"
                  } ${
                    isSelected
                      ? "border-purple-500 bg-purple-50/70 font-semibold shadow-xs ring-2 ring-purple-500/30 dark:bg-purple-950/50"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-2xs ${stu.avatarBg}`}
                    >
                      {stu.name.slice(0, 1)}
                    </span>
                    <div className="min-w-0 truncate">
                      <div className="truncate text-xs font-medium text-foreground">{stu.name}</div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        {hasWeekly ? `${stu.weeklyCount}周 (${stu.coverage})` : "无周报"}
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={!hasWeekly}
                    readOnly
                    className="h-3.5 w-3.5 cursor-pointer rounded text-purple-600 pointer-events-none"
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* 阶段日期与执行时间设定 */}
        <div className="grid gap-4 border-t pt-3 sm:grid-cols-2">
          {/* 阶段周期 */}
          <div className="space-y-2">
            <div className="flex h-7 items-center justify-between">
              <label htmlFor="stgStartDate" className="text-xs font-bold text-muted-foreground">
                阶段周期范围（周报数据源跨度）：
              </label>
              <div className="flex items-center gap-1 rounded-xl border bg-muted/40 p-0.5 text-[11px]">
                <button
                  type="button"
                  id="stgPresetMonthBtn"
                  onClick={() => {
                    setPeriodPreset("recent-month");
                    const range = getRecentMonthRange();
                    setStartDate(range.start);
                    setEndDate(range.end);
                    setSchedDate(range.end);
                    showToast("已调整阶段为近1个月");
                  }}
                  className={`rounded-lg px-2.5 py-0.5 transition ${
                    periodPreset === "recent-month"
                      ? "bg-indigo-600 font-bold text-white shadow-xs"
                      : "text-muted-foreground hover:bg-card"
                  }`}
                >
                  近1月
                </button>
                <button
                  type="button"
                  id="stgPresetTermBtn"
                  onClick={() => {
                    if (!activeTerm) {
                      showToast("当前学期数据尚未加载，请稍后重试");
                      return;
                    }
                    setPeriodPreset("current-term");
                    setStartDate(activeTerm.startDate.slice(0, 10));
                    setEndDate(activeTerm.endDate.slice(0, 10));
                    setSchedDate(activeTerm.endDate.slice(0, 10));
                    showToast(`已调整阶段为${activeTerm.name}`);
                  }}
                  className={`rounded-lg px-2.5 py-0.5 transition ${
                    periodPreset === "current-term"
                      ? "bg-indigo-600 font-bold text-white shadow-xs"
                      : "text-muted-foreground hover:bg-card"
                  }`}
                >
                  本学期
                </button>
                <button
                  type="button"
                  id="stgPresetCustomBtn"
                  onClick={() => {
                    setPeriodPreset("custom");
                    showToast("已切换为自定义日期范围");
                  }}
                  className={`rounded-lg px-2.5 py-0.5 transition ${
                    periodPreset === "custom"
                      ? "bg-indigo-600 font-bold text-white shadow-xs"
                      : "text-muted-foreground hover:bg-card"
                  }`}
                >
                  自定义
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                id="stgStartDate"
                value={startDate}
                onChange={e => {
                  setStartDate(e.target.value);
                  setPeriodPreset("custom");
                }}
                className="h-9 w-full rounded-xl border bg-muted/30 px-2.5 text-xs"
              />
              <input
                type="date"
                id="stgEndDate"
                value={endDate}
                onChange={e => {
                  const nextDate = e.target.value;
                  setEndDate(nextDate);
                  setPeriodPreset("custom");
                  if (nextDate > schedDate) setSchedDate(nextDate);
                }}
                className="h-9 w-full rounded-xl border bg-muted/30 px-2.5 text-xs"
              />
            </div>
          </div>

          {/* 定时时间点 */}
          <div className="space-y-2">
            <div className="flex h-7 items-center justify-between">
              <label htmlFor="stgSchedDateInput" className="text-xs font-bold text-purple-700 dark:text-purple-300">
                ⏰ 云端自动执行时间点：
              </label>
              <span className="text-[11px] text-muted-foreground">到期离线独立执行</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                id="stgSchedDateInput"
                value={schedDate}
                onChange={e => {
                  const nextDate = e.target.value;
                  setSchedDate(nextDate);
                  // 防止汇总范围包含尚未到来、云端执行时不可能存在的数据。
                  if (endDate > nextDate) setEndDate(nextDate);
                }}
                className="h-9 w-full rounded-xl border bg-muted/30 px-2.5 text-xs"
              />
              <input
                type="time"
                id="stgSchedTimeInput"
                value={schedTime}
                onChange={e => setSchedTime(e.target.value)}
                className="h-9 w-full rounded-xl border bg-muted/30 px-2.5 text-xs"
              />
            </div>
          </div>
        </div>

        {/* 循环重复执行设置 */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-purple-200/80 bg-purple-50/50 p-2.5 dark:border-purple-900/60 dark:bg-purple-950/20">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-purple-900 dark:text-purple-200">🔁 任务循环执行模式：</span>
            <span className="text-[11px] text-muted-foreground">
              {repeatType === "none"
                ? "单次执行（到期后生成草稿并归档）"
                : repeatType === "weekly"
                  ? "每周在所选时间点自动汇总并生成草稿，周期自动顺延"
                  : "每月在所选时间点自动汇总并生成草稿，周期自动顺延"}
            </span>
          </div>
          <div className="flex items-center gap-1 rounded-xl border bg-card p-0.5 text-[11px]">
            <button
              type="button"
              id="stgRepeatNoneBtn"
              onClick={() => {
                setRepeatType("none");
                showToast("已设为单次执行（不重复）");
              }}
              className={`rounded-lg px-2.5 py-1 transition ${
                repeatType === "none"
                  ? "bg-purple-600 font-bold text-white shadow-xs"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              单次执行
            </button>
            <button
              type="button"
              id="stgRepeatWeeklyBtn"
              onClick={() => {
                setRepeatType("weekly");
                showToast("已开启每周循环执行");
              }}
              className={`rounded-lg px-2.5 py-1 transition ${
                repeatType === "weekly"
                  ? "bg-purple-600 font-bold text-white shadow-xs"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              每周重复
            </button>
            <button
              type="button"
              id="stgRepeatMonthlyBtn"
              onClick={() => {
                setRepeatType("monthly");
                showToast("已开启每月循环执行");
              }}
              className={`rounded-lg px-2.5 py-1 transition ${
                repeatType === "monthly"
                  ? "bg-purple-600 font-bold text-white shadow-xs"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              每月重复
            </button>
          </div>
        </div>

        {/* 快捷选项与保存按钮 */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-[11px] text-muted-foreground">快捷设定：</span>
            <button
              type="button"
              disabled={hasAiReportPermission === false}
              onClick={() => quickSetSeconds(15)}
              className="rounded-xl border border-purple-300 bg-purple-50 px-2.5 py-1 text-xs font-bold text-purple-700 hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ⚡ 15秒后自动生成 (演示)
            </button>
            <button
              type="button"
              disabled={hasAiReportPermission === false}
              onClick={() => quickSetFixed("today-20")}
              className="rounded-xl border bg-muted/40 px-2 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              今天 20:00
            </button>
            <button
              type="button"
              disabled={hasAiReportPermission === false}
              onClick={() => quickSetFixed("friday-17")}
              className="rounded-xl border bg-muted/40 px-2 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              周五 17:00
            </button>
          </div>

          <button
            type="button"
            id="btnSaveStageTask"
            disabled={hasAiReportPermission === false}
            title={hasAiReportPermission === false ? "暂无 AI 汇总报告使用权限" : undefined}
            onClick={() => handleSaveTask()}
            className={`flex items-center gap-1.5 rounded-xl bg-purple-600 px-5 py-2.5 text-xs font-bold text-white shadow-md transition ${
              hasAiReportPermission === false ? "cursor-not-allowed opacity-50" : "hover:bg-purple-700 active:scale-95"
            }`}
          >
            <Sparkles className="h-4 w-4" />
            <span>{editingTaskId ? "保存任务修改" : "保存并加入云端定时守护队列"}</span>
          </button>
        </div>
      </section>

      {/* 3. 云端定时任务看板 (展示多个定时任务，支持修改、立即执行、取消) */}
      <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold sm:text-base">
              <Clock className="h-5 w-5 text-indigo-600" />
              <span>云端定时汇总任务队列</span>
              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                共 <span id="scheduledTasksListCount">{uniqueTasks.length}</span> 个任务
              </span>
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              每个任务到点由云端独立执行；
              <strong>生成的报告草稿直接沉淀至【报告管理与分发】列表，点击微调/发布即可</strong>。
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              cancelEditingTask();
              setTaskName(`新阶段成长汇总任务 (${uniqueTasks.length + 1})`);
              showToast("已重置表单，可输入新任务参数");
            }}
            className="flex items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>新建定时任务</span>
          </button>
        </div>

        {/* 任务卡片列表 */}
        <div
          className="divide-y overflow-hidden rounded-xl border"
          id="stageTasksListContainer"
          role="list"
          data-view-mode="list"
        >
          {uniqueTasks.length === 0 ? (
            <div className="rounded-2xl border bg-muted/20 p-8 text-center text-xs text-muted-foreground">
              暂无云端定时任务。请在上发表单配置学生与时间后加入队列。
            </div>
          ) : (
            uniqueTasks.map(task => {
              const isPending = task.status === "pending";
              const isRunning = task.status === "running";
              const isCompleted = task.status === "completed";
              const now = Date.now();
              const diffSecs = Math.max(0, Math.floor((task.executeTimestamp - now) / 1000));

              let timeDesc = "";
              if (isCompleted) {
                timeDesc = "✅ 已自动完成生成并转入草稿箱";
              } else if (isRunning) {
                timeDesc = `生成中 ${task.completedCount ?? 0}/${task.totalCount ?? task.studentIds.length}`;
              } else if (diffSecs <= 60 && diffSecs > 0) {
                timeDesc = `⏰ 倒计时中 (${diffSecs} 秒后执行)`;
              } else {
                timeDesc = `⏰ 预定时间: ${task.schedDate} ${task.schedTime}`;
              }

              const borderClass = isPending
                ? diffSecs <= 60
                  ? "border-purple-300 bg-purple-50/30 dark:border-purple-700 dark:bg-purple-950/20"
                  : "border-border bg-card"
                : isCompleted
                  ? "border-emerald-200 bg-emerald-50/20 dark:border-emerald-800"
                  : "border-slate-200";

              return (
                <div key={task.id} role="listitem" className={`space-y-2.5 p-4 transition ${borderClass}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          isCompleted ? "bg-emerald-500" : diffSecs <= 60 ? "animate-ping bg-purple-600" : "bg-blue-500"
                        }`}
                      />
                      <span className="text-xs font-bold text-foreground sm:text-sm">{task.name}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          isCompleted
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300"
                        }`}
                      >
                        {timeDesc}
                      </span>
                      <span className="rounded border bg-muted/40 px-1.5 py-0.2 text-[10px] text-muted-foreground">
                        ☁️ 服务端离线守护
                      </span>
                      {task.repeatType && task.repeatType !== "none" ? (
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-900/60 dark:text-purple-300">
                          🔁 {task.repeatType === "weekly" ? "每周循环" : "每月循环"}
                        </span>
                      ) : (
                        <span className="rounded border bg-muted/20 px-1.5 py-0.2 text-[10px] text-muted-foreground">
                          单次
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isPending ? (
                        <>
                          <button
                            type="button"
                            id={`btn-edit-task-${task.id}`}
                            onClick={() => editStageTask(task)}
                            className="flex items-center gap-1 rounded-lg border bg-muted/30 px-2.5 py-1 text-xs font-medium transition hover:bg-muted"
                          >
                            <Edit3 className="h-3 w-3 text-indigo-600" />
                            <span>修改任务</span>
                          </button>
                          <button
                            type="button"
                            id={`btn-execute-task-${task.id}`}
                            disabled={hasAiReportPermission === false}
                            title={hasAiReportPermission === false ? "暂无 AI 汇总报告使用权限" : undefined}
                            onClick={() => executeTask(task)}
                            className={`flex items-center gap-1 rounded-lg border border-purple-300 bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-700 transition ${
                              hasAiReportPermission === false ? "cursor-not-allowed opacity-50" : "hover:bg-purple-100"
                            }`}
                          >
                            <Play className="h-3 w-3" />
                            <span>立即执行</span>
                          </button>
                          <button
                            type="button"
                            id={`btn-cancel-task-${task.id}`}
                            onClick={() => cancelStageTask(task.id)}
                            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-rose-500 transition hover:bg-rose-50"
                          >
                            <Trash2 className="h-3 w-3" />
                            <span>取消</span>
                          </button>
                        </>
                      ) : isCompleted ? (
                        <button
                          type="button"
                          onClick={onNavigateToDashboard}
                          className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white shadow-2xs hover:bg-emerald-700"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>前往报告管理查看</span>
                        </button>
                      ) : (
                        <span className="rounded-lg border bg-muted/30 px-3 py-1 text-xs font-medium text-muted-foreground">
                          {isRunning ? "正在生成报告…" : "任务处理失败"}
                        </span>
                      )}
                    </div>
                  </div>

                  {isRunning ? (
                    <div className="space-y-1" aria-label={`${task.name}执行进度`}>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>
                          已完成 {task.completedCount ?? 0} / {task.totalCount ?? task.studentIds.length} 位学生
                        </span>
                        <span>{task.progressPercent ?? 0}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-purple-100 dark:bg-purple-950">
                        <div
                          className="h-full rounded-full bg-purple-600 transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(0, task.progressPercent ?? 0))}%` }}
                        />
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <span>
                      🎯 目标对象:{" "}
                      <strong className="text-foreground">
                        {task.className || "全班"} · 共 {task.studentIds?.length ?? 0} 人
                      </strong>{" "}
                      {task.studentNames ? `(${task.studentNames})` : ""}
                    </span>
                    <span>
                      📅 阶段跨度: {task.startDate} 至 {task.endDate}
                    </span>
                    {task.stageCustomName ? (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                        🏷️ 替换“本阶段”为: <strong>{task.stageCustomName}</strong>
                      </span>
                    ) : null}
                    <span>
                      📦 产出归宿:{" "}
                      <strong className="text-indigo-600 dark:text-indigo-400">
                        直接沉淀为「待发布草稿」存入报告管理与分发
                      </strong>
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
