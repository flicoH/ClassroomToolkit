/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 * **********************************************************************************************
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  BookOpenCheck,
  Check,
  ClipboardList,
  Grid2X2,
  LayoutGrid,
  ListChecks,
  Plus,
  Search,
  Settings,
  Trash2,
  Users
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import request from "@/lib/request";
import { cn } from "@/lib/utils";

type TaskType = "status" | "score";
type TaskView = "list" | "detail" | "create" | "edit";
type StudentStatus = "未完成" | "已完成" | "需订正";

interface Student {
  id: string;
  name: string;
  studentNo: string;
  status: StudentStatus;
  score?: number;
}

interface TaskItem {
  id: string;
  title: string;
  className: string;
  type: TaskType;
  statusCount: number;
  createdAt: string;
  students: Student[];
}

interface ClassStudent {
  id: string;
  name: string;
  studentNo: string;
}

interface ClassRoom {
  id: string;
  name: string;
  students: ClassStudent[];
  groups: string[];
}

const statusStyles: Record<StudentStatus, { text: string; bg: string; bar: string }> = {
  未完成: {
    text: "text-sky-700 dark:text-sky-300",
    bg: "bg-sky-50 dark:bg-sky-950/40",
    bar: "bg-sky-400"
  },
  已完成: {
    text: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    bar: "bg-emerald-500"
  },
  需订正: {
    text: "text-rose-700 dark:text-rose-300",
    bg: "bg-rose-50 dark:bg-rose-950/40",
    bar: "bg-rose-500"
  }
};

const statusOrder: StudentStatus[] = ["未完成", "已完成", "需订正"];

/** 汇总单个任务的完成比例和各状态人数，用于列表卡片和详情统计。 */
function getTaskStats(task: TaskItem) {
  const total = task.students.length;
  const done = task.students.filter(student => student.status === "已完成").length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const statusPercents = statusOrder.map(status => {
    const count = task.students.filter(student => student.status === status).length;
    return {
      status,
      count,
      percent: total > 0 ? Math.round((count / total) * 100) : 0
    };
  });

  return { total, done, percent, statusPercents };
}

function getInitial(name: string) {
  return name.slice(0, 1) || "学";
}

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
  const [draftStatusCount, setDraftStatusCount] = useState(2);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskDeleteId, setTaskDeleteId] = useState<string | null>(null);

  const activeTask = tasks.find(task => task.id === activeTaskId) ?? tasks[0];
  const draftClass = classes.find(classRoom => classRoom.id === draftClassId);

  const refreshClasses = async () => {
    const nextClasses = await request<ClassRoom[], ClassRoom[]>("/api/classes");
    setClasses(nextClasses);
    setDraftClassId(current =>
      nextClasses.some(classRoom => classRoom.id === current) ? current : (nextClasses[0]?.id ?? "")
    );
    return nextClasses;
  };

  const loadTasks = async () => {
    setLoading(true);
    try {
      const [nextTasks, nextClasses] = await Promise.all([
        request<TaskItem[], TaskItem[]>("/api/task-stats"),
        request<ClassRoom[], ClassRoom[]>("/api/classes")
      ]);
      setTasks(nextTasks);
      setClasses(nextClasses);
      setActiveTaskId(current => (nextTasks.some(task => task.id === current) ? current : (nextTasks[0]?.id ?? "")));
      setDraftClassId(current =>
        nextClasses.some(classRoom => classRoom.id === current) ? current : (nextClasses[0]?.id ?? "")
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTasks();
  }, []);

  // 详情页学生列表支持搜索和状态筛选，避免修改原始任务数据。
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
    const availableClasses = classes.some(classRoom => classRoom.id === draftClassId)
      ? classes
      : await refreshClasses();
    const selectedClass = availableClasses.find(classRoom => classRoom.id === draftClassId) ?? availableClasses[0];
    if (!selectedClass) return;
    const freshClass = await request<ClassRoom, ClassRoom>(`/api/classes/${selectedClass.id}`);
    setClasses(current =>
      current.some(classRoom => classRoom.id === freshClass.id)
        ? current.map(classRoom => (classRoom.id === freshClass.id ? freshClass : classRoom))
        : [freshClass, ...current]
    );
    setDraftClassId(freshClass.id);
    const nextTask = await request<TaskItem, TaskItem>({
      url: "/api/task-stats",
      method: "POST",
      data: {
        title,
        className: freshClass.name,
        type: draftType,
        statusCount: draftStatusCount,
        students: freshClass.students.map(student => ({
          id: student.id,
          name: student.name,
          studentNo: student.studentNo,
          status: "未完成" as StudentStatus
        }))
      }
    });

    setTasks(current => [nextTask, ...current]);
    setActiveTaskId(nextTask.id);
    setDraftTitle("");
    setEditingTaskId(null);
    setView("detail");
  };

  const openEditTask = (task: TaskItem) => {
    setEditingTaskId(task.id);
    setDraftTitle(task.title);
    setDraftType(task.type);
    setDraftStatusCount(task.statusCount);
    setDraftClassId(classes.find(classRoom => classRoom.name === task.className)?.id ?? classes[0]?.id ?? "");
    setView("edit");
  };

  const handleUpdateTask = async () => {
    if (!editingTaskId) return;
    const title = draftTitle.trim() || "课后作业完成情况统计";
    const updatedTask = await request<TaskItem, TaskItem>({
      url: `/api/task-stats/${editingTaskId}`,
      method: "PATCH",
      data: {
        title,
        className: draftClass?.name ?? classes[0]?.name ?? "未选择班级",
        type: draftType,
        statusCount: draftStatusCount
      }
    });
    setTasks(current => current.map(task => (task.id === updatedTask.id ? updatedTask : task)));
    setActiveTaskId(updatedTask.id);
    setDraftTitle("");
    setEditingTaskId(null);
    setView("detail");
  };

  /** 点击学生卡片时按固定顺序轮转任务状态。 */
  const updateStudentStatus = async (studentId: string) => {
    if (!activeTask) return;
    const nextTask = await request<TaskItem, TaskItem>({
      url: `/api/task-stats/${activeTask.id}/students/${studentId}/cycle-status`,
      method: "POST"
    });
    setTasks(current => current.map(task => (task.id === nextTask.id ? nextTask : task)));
  };

  /** 删除任务是不可恢复操作，统一先做二次确认。 */
  const deleteTask = (taskId: string) => {
    setTaskDeleteId(taskId);
  };

  const openCreateTask = () => {
    setEditingTaskId(null);
    setDraftTitle("");
    setDraftType("status");
    setDraftStatusCount(2);
    void refreshClasses();
    setView("create");
  };

  const confirmDeleteTask = async () => {
    if (!taskDeleteId) return;
    await request<{ deleted: boolean }, { deleted: boolean }>({
      url: `/api/task-stats/${taskDeleteId}`,
      method: "DELETE"
    });
    setTasks(current => current.filter(task => task.id !== taskDeleteId));
    if (activeTaskId === taskDeleteId) {
      const nextTask = tasks.find(task => task.id !== taskDeleteId);
      setActiveTaskId(nextTask?.id ?? "");
      setView("list");
    }
    setTaskDeleteId(null);
  };

  const deleteTaskTitle = tasks.find(item => item.id === taskDeleteId)?.title ?? "未命名任务";

  if (view === "create" || view === "edit") {
    const editing = view === "edit";
    return (
      <div className="min-h-full bg-slate-100/80 p-5 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <div className="mx-auto flex min-h-[420px] w-full max-w-[520px] flex-col justify-center">
          <div className="rounded-2xl border border-white/80 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
            <div className="mb-7 flex items-center gap-4">
              <Button size="icon" variant="ghost" onClick={() => setView("list")} aria-label="返回">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-600 text-white shadow-sm">
                <ListChecks className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold">{editing ? "编辑任务" : "新建任务"}</h2>
                <p className="text-xs font-medium text-slate-400">Class Insight Setup</p>
              </div>
            </div>

            <div className="space-y-5">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">任务名称</span>
                <Input
                  value={draftTitle}
                  onChange={event => setDraftTitle(event.target.value)}
                  placeholder="例：课后作业完成情况统计"
                  className="h-11 border-transparent bg-slate-50 shadow-none dark:bg-slate-800"
                />
              </label>

              <div className="space-y-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">任务类型</span>
                <div className="grid grid-cols-2 rounded-lg bg-slate-50 p-1 dark:bg-slate-800">
                  {[
                    { value: "status" as TaskType, label: "状态任务", icon: Check },
                    { value: "score" as TaskType, label: "分数任务", icon: BarChart3 }
                  ].map(item => (
                    <button
                      key={item.value}
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
                      onClick={() => setDraftClassId(classRoom.id)}
                      className={cn(draftClass?.id === classRoom.id && "bg-cyan-600 hover:bg-cyan-700")}
                    >
                      {classRoom.name}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  状态数量（例：作业是否完成就是2种状态）
                </span>
                <div className="grid grid-cols-3 rounded-lg bg-slate-50 p-1 dark:bg-slate-800">
                  {[2, 3, 4].map(count => (
                    <button
                      key={count}
                      onClick={() => setDraftStatusCount(count)}
                      className={cn(
                        "h-10 rounded-md text-sm font-semibold text-slate-500 transition",
                        draftStatusCount === count &&
                          "bg-white text-cyan-700 shadow-sm dark:bg-slate-900 dark:text-cyan-300"
                      )}
                    >
                      {count} 种
                    </button>
                  ))}
                </div>
              </div>

              <Button
                className="h-12 w-full bg-cyan-600 text-base font-bold hover:bg-cyan-700"
                onClick={() => void (editing ? handleUpdateTask() : handleCreateTask())}
                disabled={!editing && (loading || classes.length === 0)}
              >
                {editing ? "保存任务" : "开始统计"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === "detail" && activeTask) {
    const stats = getTaskStats(activeTask);
    return (
      <>
        <div className="relative flex min-h-full flex-col overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
          <header className="border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <Button size="icon" variant="ghost" onClick={() => setView("list")} aria-label="返回任务列表">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-600 text-white">
                <BookOpenCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-lg font-bold">{activeTask.title}</h1>
                <p className="text-xs font-semibold uppercase text-slate-400">
                  {activeTask.className} · {stats.total} students
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
                { mode: "card" as const, label: "卡片", icon: Grid2X2 },
                { mode: "seat" as const, label: "座位表", icon: LayoutGrid }
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
              {["全部", ...statusOrder].map(status => {
                const count =
                  status === "全部"
                    ? stats.total
                    : activeTask.students.filter(student => student.status === status).length;
                return (
                  <button
                    key={status}
                    onClick={() => setActiveStatus(status as StudentStatus | "全部")}
                    className={cn(
                      "flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-bold text-slate-500 transition",
                      activeStatus === status
                        ? "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/60 dark:text-cyan-300"
                        : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                    )}
                  >
                    {status}
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] dark:bg-slate-800">
                      {count}
                    </span>
                  </button>
                );
              })}
              <Button size="sm" variant="ghost" className="h-9 shrink-0 text-slate-400">
                <Trash2 className="h-4 w-4" />
                清空统计
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-9 shrink-0 text-slate-400"
                onClick={() => openEditTask(activeTask)}
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

          <main
            className={cn(
              "grid gap-4 overflow-auto p-5 pb-28",
              displayMode === "card" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-3"
            )}
          >
            {filteredStudents.map(student => {
              const style = statusStyles[student.status];
              return (
                <button
                  key={student.id}
                  onClick={() => void updateStudentStatus(student.id)}
                  className="group min-h-[120px] rounded-xl bg-white p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-900"
                >
                  <div
                    className={cn(
                      "mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold",
                      style.bg,
                      style.text
                    )}
                  >
                    {getInitial(student.name)}
                  </div>
                  <h3 className="font-bold text-slate-700 dark:text-slate-200">{student.name}</h3>
                  <p className="mt-1 text-xs text-slate-400">#{student.studentNo}</p>
                  <Badge variant="secondary" className={cn("mt-3 border-0", style.bg, style.text)}>
                    {student.status}
                  </Badge>
                </button>
              );
            })}
          </main>

          <footer className="absolute bottom-5 left-1/2 w-[min(360px,calc(100%-48px))] -translate-x-1/2 rounded-2xl bg-white px-5 py-4 shadow-xl shadow-slate-300/60 dark:bg-slate-900 dark:shadow-black/30">
            <div className="grid grid-cols-3 gap-4">
              {stats.statusPercents.map(item => (
                <div key={item.status} className="text-center">
                  <div className={cn("text-sm font-bold", statusStyles[item.status].text)}>{item.percent}%</div>
                  <div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={cn("h-full rounded-full", statusStyles[item.status].bar)}
                      style={{ width: `${Math.max(item.percent, item.count > 0 ? 12 : 0)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </footer>
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

  return (
    <>
      <div className="min-h-full bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <header className="border-b border-slate-200 bg-white px-6 py-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-600 text-white shadow-sm">
                <ClipboardList className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold">任务统计</h1>
                <p className="text-sm font-medium text-slate-400">最近 {tasks.length} 个任务</p>
              </div>
            </div>
            <Button className="bg-cyan-600 font-bold hover:bg-cyan-700" onClick={openCreateTask}>
              <Plus className="h-4 w-4" />
              新建任务
            </Button>
          </div>
        </header>

        <main className="space-y-4 p-5">
          {tasks.map(task => {
            const stats = getTaskStats(task);
            return (
              <article
                key={task.id}
                onClick={() => {
                  setActiveTaskId(task.id);
                  setView("detail");
                }}
                className="w-full cursor-pointer rounded-2xl bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-900"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300">
                    <ClipboardList className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="truncate text-lg font-bold">{task.title}</h3>
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

                    <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-400">
                      <Badge variant="secondary" className="border-0 bg-slate-100 text-slate-400 dark:bg-slate-800">
                        {task.statusCount} 种状态
                      </Badge>
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

          {tasks.length === 0 && (
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
