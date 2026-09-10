/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 * **********************************************************************************************
 */
"use client";

import type { DragEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Grid3X3, Loader2, Move, Plus, RotateCcw, Shuffle, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import request from "@/lib/request";
import { cn } from "@/lib/utils";

interface Student {
  id: string;
  name: string;
  studentNo: string;
}

interface Seat {
  id: string;
  row: number;
  col: number;
  studentId: string | null;
}

interface SeatingChartData {
  id: string;
  classId?: string;
  className: string;
  rows: number;
  cols: number;
  students: Student[];
  seats: Seat[];
}

interface ClassRoom {
  id: string;
  name: string;
  students: Student[];
  groups: string[];
}

/** 获取姓名首字作为座位和学生列表里的头像占位。 */
function getInitial(name: string) {
  return name.slice(0, 1) || "学";
}

const SEATING_DRAG_MIME = "application/x-classroom-toolkit-seat";

interface SeatingDragPayload {
  studentId: string;
  sourceSeatId?: string | null;
}

/** 座位表主界面，负责班级同步、座位布局调整和拖拽排座。 */
export function SeatingChart() {
  const [chart, setChart] = useState<SeatingChartData | null>(null);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [activeClassId, setActiveClassId] = useState("");
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [draggingStudentId, setDraggingStudentId] = useState<string | null>(null);
  const [draggingSeatId, setDraggingSeatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  const students = chart?.students ?? [];
  const seats = chart?.seats ?? [];
  const rows = chart?.rows ?? 4;
  const cols = chart?.cols ?? 4;
  const loadingSeats = Array.from({ length: rows * cols }, (_, index) => index);
  const studentMap = useMemo(() => new Map(students.map(student => [student.id, student])), [students]);
  const seatedIds = new Set(seats.map(seat => seat.studentId).filter(Boolean));
  const unseatedStudents = students.filter(student => !seatedIds.has(student.id));

  /** 将学生管理模块的班级学生转换为座位表使用的学生结构。 */
  const toSeatingStudents = (classRoom: ClassRoom): Student[] =>
    classRoom.students.map(student => ({
      id: student.studentNo,
      name: student.name,
      studentNo: student.studentNo
    }));

  /** 优先按班级 ID 查找座位表，兼容旧数据里只保存班级名称的记录。 */
  const findChartForClass = (charts: SeatingChartData[], classRoom: ClassRoom) => {
    return (
      charts.find(item => item.classId === classRoom.id) ??
      charts.find(item => !item.classId && item.className === classRoom.name)
    );
  };

  /** 把座位表绑定到最新班级数据，保证学生名单和班级信息同步。 */
  const syncChartWithClass = async (nextChart: SeatingChartData, classRoom: ClassRoom) => {
    return request<SeatingChartData, SeatingChartData>({
      url: `/api/seating-charts/${nextChart.id}/classroom`,
      method: "PATCH",
      data: {
        classId: classRoom.id,
        className: classRoom.name,
        students: toSeatingStudents(classRoom)
      }
    });
  };

  /** 当前班级没有座位表时，按现有行列配置创建一份新座位表。 */
  const createChartForClass = async (classRoom: ClassRoom) => {
    return request<SeatingChartData, SeatingChartData>({
      url: "/api/seating-charts",
      method: "POST",
      data: {
        classId: classRoom.id,
        className: classRoom.name,
        rows: chart?.rows ?? 4,
        cols: chart?.cols ?? 4,
        students: toSeatingStudents(classRoom)
      }
    });
  };

  /** 加载班级与座位表，并为当前或指定班级准备可编辑座位数据。 */
  const loadChart = async (preferredClassId?: string) => {
    setLoading(true);
    try {
      const nextClasses = await request<ClassRoom[], ClassRoom[]>("/api/classes");
      const charts = await request<SeatingChartData[], SeatingChartData[]>("/api/seating-charts").catch(() => []);
      setClasses(nextClasses);
      const nextClass =
        nextClasses.find(classRoom => classRoom.id === preferredClassId) ??
        nextClasses.find(classRoom => classRoom.id === activeClassId) ??
        nextClasses[0];
      if (!nextClass) {
        setActiveClassId("");
        setChart(null);
        return;
      }
      setActiveClassId(nextClass.id);
      const matchedChart = findChartForClass(charts, nextClass);
      const nextChart = matchedChart
        ? await syncChartWithClass(matchedChart, nextClass)
        : await createChartForClass(nextClass);
      setChart(nextChart);
      setSelectedSeatId(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadChart();
  }, []);

  /** 切换班级后重新加载对应座位表。 */
  const switchClass = (classId: string) => {
    setActiveClassId(classId);
    void loadChart(classId);
  };

  /** 调整行列时重建座位，同时尽量保留原座位上的学生。 */
  const rebuildSeats = async (nextRows: number, nextCols: number) => {
    if (!chart || loading) return;
    setLoading(true);
    try {
      const nextChart = await request<SeatingChartData, SeatingChartData>({
        url: `/api/seating-charts/${chart.id}/resize`,
        method: "PATCH",
        data: { rows: nextRows, cols: nextCols }
      });
      setChart(nextChart);
      setSelectedSeatId(null);
    } finally {
      setLoading(false);
    }
  };

  /** 删除行会丢失最后一行座位，因此需要确认。 */
  const deleteRow = () => {
    setConfirmAction({
      title: "删除行",
      description: "确定删除一行座位吗？超出座位中的学生会变为未安排。",
      onConfirm: () => rebuildSeats(Math.max(2, rows - 1), cols)
    });
  };

  /** 删除列会丢失最后一列座位，因此需要确认。 */
  const deleteColumn = () => {
    setConfirmAction({
      title: "删除列",
      description: "确定删除一列座位吗？超出座位中的学生会变为未安排。",
      onConfirm: () => rebuildSeats(rows, Math.max(2, cols - 1))
    });
  };

  /** 随机排座会覆盖当前座位安排。 */
  const shuffleSeats = async () => {
    if (!chart || loading) return;
    setLoading(true);
    try {
      const nextChart = await request<SeatingChartData, SeatingChartData>({
        url: `/api/seating-charts/${chart.id}/shuffle`,
        method: "POST"
      });
      setChart(nextChart);
      setSelectedSeatId(null);
    } finally {
      setLoading(false);
    }
  };

  /** 清空单个座位，同样走二次确认。 */
  const clearSeat = (seatId: string) => {
    const seat = seats.find(item => item.id === seatId);
    const student = seat?.studentId ? studentMap.get(seat.studentId) : null;
    setConfirmAction({
      title: "清空座位",
      description: `确定清空${student ? `「${student.name}」的` : "当前"}座位吗？`,
      onConfirm: async () => {
        if (!chart || loading) return;
        setLoading(true);
        try {
          const nextChart = await request<SeatingChartData, SeatingChartData>({
            url: `/api/seating-charts/${chart.id}/seats/${seatId}/clear`,
            method: "POST"
          });
          setChart(nextChart);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  /** 执行当前确认弹窗里的操作并关闭确认弹窗。 */
  const confirmCurrentAction = async () => {
    await confirmAction?.onConfirm();
    setConfirmAction(null);
  };

  /** 将学生放入目标座位；如果来源是另一个座位，则支持移动/交换。 */
  const assignStudent = async (seatId: string, studentId: string, sourceSeatId?: string | null) => {
    if (!chart || loading) return;
    setLoading(true);
    try {
      const nextChart = await request<SeatingChartData, SeatingChartData>({
        url: `/api/seating-charts/${chart.id}/seats/${seatId}`,
        method: "PATCH",
        data: { studentId, sourceSeatId }
      });
      setChart(nextChart);
      setDraggingStudentId(null);
      setDraggingSeatId(null);
    } finally {
      setLoading(false);
    }
  };

  /** 开始拖拽学生时写入自定义 MIME 数据，方便座位间移动和交换。 */
  const startStudentDrag = (event: DragEvent<HTMLElement>, studentId: string, sourceSeatId?: string | null) => {
    const payload: SeatingDragPayload = { studentId, sourceSeatId };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(SEATING_DRAG_MIME, JSON.stringify(payload));
    event.dataTransfer.setData("text/plain", studentId);
    setDraggingStudentId(studentId);
    setDraggingSeatId(sourceSeatId ?? null);
  };

  /** 读取拖拽数据；当自定义 MIME 丢失时回退到 text/plain 和组件状态。 */
  const readStudentDrag = (event: DragEvent<HTMLElement>): SeatingDragPayload | null => {
    const rawPayload = event.dataTransfer.getData(SEATING_DRAG_MIME);
    if (rawPayload) {
      try {
        const payload = JSON.parse(rawPayload) as Partial<SeatingDragPayload>;
        if (payload.studentId) return { studentId: payload.studentId, sourceSeatId: payload.sourceSeatId ?? null };
      } catch {
        return null;
      }
    }

    const fallbackStudentId = event.dataTransfer.getData("text/plain") || draggingStudentId;
    if (!fallbackStudentId) return null;
    return { studentId: fallbackStudentId, sourceSeatId: draggingSeatId };
  };

  /** 拖拽已安排学生到另一个座位时，空座移动，有人则交换。 */
  const moveOrSwapSeat = (event: DragEvent<HTMLElement>, targetSeatId: string) => {
    event.preventDefault();
    const payload = readStudentDrag(event);
    if (!payload) return;

    void assignStudent(targetSeatId, payload.studentId, payload.sourceSeatId);
  };

  const selectedSeat = seats.find(seat => seat.id === selectedSeatId);

  return (
    <>
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100 lg:flex-row">
        <section className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900 sm:px-6 sm:py-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white">
                  <Grid3X3 className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">座位表</h1>
                  <p className="text-sm text-slate-400">
                    {loading ? "加载中" : `${chart?.className ?? "暂无班级"} · ${students.length} 名学生`}
                  </p>
                </div>
              </div>

              <div className="flex w-full gap-2 overflow-x-auto pb-1 [&>button]:shrink-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:pb-0">
                {classes.map(classRoom => (
                  <Button
                    key={classRoom.id}
                    variant={activeClassId === classRoom.id ? "default" : "outline"}
                    onClick={() => switchClass(classRoom.id)}
                    disabled={loading}
                    className={cn(activeClassId === classRoom.id && "bg-blue-600 hover:bg-blue-700")}
                  >
                    {classRoom.name}
                  </Button>
                ))}
                <Button variant="outline" onClick={deleteRow} disabled={loading || !chart}>
                  删除行
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void rebuildSeats(rows + 1, cols)}
                  disabled={loading || !chart}
                >
                  <Plus className="h-4 w-4" />
                  添加行
                </Button>
                <Button variant="outline" onClick={deleteColumn} disabled={loading || !chart}>
                  删除列
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void rebuildSeats(rows, cols + 1)}
                  disabled={loading || !chart}
                >
                  <Plus className="h-4 w-4" />
                  添加列
                </Button>
                <Button variant="outline" onClick={() => void rebuildSeats(rows, cols)} disabled={loading || !chart}>
                  <RotateCcw className="h-4 w-4" />
                  重置
                </Button>
                <Button
                  className="bg-blue-600 font-bold hover:bg-blue-700"
                  onClick={() => void shuffleSeats()}
                  disabled={loading || !chart}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shuffle className="h-4 w-4" />}
                  随机排座
                </Button>
              </div>
            </div>
          </header>

          <main className="flex min-h-0 flex-1 flex-col overflow-auto p-3 sm:p-6">
            <div className="mx-auto mb-4 w-[min(560px,100%)] rounded-full bg-slate-800 px-6 py-3 text-center text-sm font-bold text-white shadow-lg sm:mb-6">
              讲台
            </div>

            <div className="relative mx-auto w-full max-w-[860px] overflow-x-auto rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900 sm:p-5">
              <div
                className="grid min-w-max gap-2 sm:gap-3"
                style={{
                  gridTemplateColumns: `repeat(${cols}, minmax(76px, 1fr))`
                }}
              >
                {loading && !chart
                  ? loadingSeats.map(item => (
                      <div
                        key={item}
                        className="min-h-[92px] animate-pulse rounded-xl border border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/60"
                      />
                    ))
                  : seats.map(seat => {
                      const student = seat.studentId ? studentMap.get(seat.studentId) : null;
                      const isSelected = selectedSeatId === seat.id;
                      return (
                        <button
                          key={seat.id}
                          draggable={Boolean(student) && !loading}
                          disabled={loading}
                          onClick={() => setSelectedSeatId(seat.id)}
                          onDragStart={event => {
                            if (!student) return;
                            startStudentDrag(event, student.id, seat.id);
                          }}
                          onDragEnd={() => {
                            setDraggingStudentId(null);
                            setDraggingSeatId(null);
                          }}
                          onDragOver={event => {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                          }}
                          onDrop={event => moveOrSwapSeat(event, seat.id)}
                          className={cn(
                            "min-h-[84px] rounded-xl border p-2 text-center transition sm:min-h-[92px] sm:p-3",
                            isSelected
                              ? "border-blue-400 bg-blue-50 shadow-md dark:border-blue-700 dark:bg-blue-950/50"
                              : student
                                ? "border-slate-100 bg-white shadow-sm hover:border-blue-200 dark:border-slate-800 dark:bg-slate-950"
                                : "border-dashed border-slate-200 bg-slate-50 text-slate-300 dark:border-slate-800 dark:bg-slate-950/60"
                          )}
                        >
                          {student ? (
                            <>
                              <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                {getInitial(student.name)}
                              </div>
                              <div className="truncate font-bold">{student.name}</div>
                              <div className="mt-1 text-xs font-semibold text-slate-400">#{student.studentNo}</div>
                            </>
                          ) : (
                            <div className="flex h-full min-h-[66px] items-center justify-center text-sm font-semibold">
                              空座位
                            </div>
                          )}
                        </button>
                      );
                    })}
              </div>
              {loading && chart && (
                <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/70 text-sm font-bold text-blue-600 backdrop-blur-[1px] dark:bg-slate-900/70 dark:text-blue-300">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  正在更新座位表...
                </div>
              )}
            </div>
          </main>
        </section>

        <aside className="max-h-[34dvh] w-full shrink-0 overflow-y-auto border-t border-slate-200 bg-white/90 p-4 dark:border-slate-800 dark:bg-slate-900/90 lg:max-h-none lg:w-[260px] lg:border-l lg:border-t-0">
          <div className="mb-4 flex items-center gap-2 font-bold">
            <Users className="h-5 w-5 text-blue-600" />
            未安排学生
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:block lg:space-y-2">
            {unseatedStudents.map(student => (
              <button
                key={student.id}
                draggable={!loading}
                disabled={loading}
                onDragStart={event => startStudentDrag(event, student.id)}
                onDragEnd={() => {
                  setDraggingStudentId(null);
                  setDraggingSeatId(null);
                }}
                onClick={() => selectedSeat && void assignStudent(selectedSeat.id, student.id)}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-blue-950/40"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white font-bold text-blue-700 dark:bg-slate-900 dark:text-blue-300">
                  {getInitial(student.name)}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">{student.name}</div>
                  <div className="text-xs text-slate-400">{student.studentNo}</div>
                </div>
              </button>
            ))}
            {unseatedStudents.length === 0 && (
              <div className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-400 dark:bg-slate-950">
                {loading ? "正在加载学生..." : "全部学生已安排"}
              </div>
            )}
          </div>

          <div className="mt-6 rounded-xl bg-blue-50 p-4 text-sm text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
            <div className="mb-2 flex items-center gap-2 font-bold">
              <Move className="h-4 w-4" />
              操作提示
            </div>
            <p>点击座位后，可从右侧选择学生；也可以拖动学生到空座位。</p>
          </div>

          {selectedSeat && (
            <div className="mt-4 rounded-xl border border-slate-100 p-4 dark:border-slate-800">
              <div className="text-sm font-bold">当前座位</div>
              <div className="mt-1 text-xs text-slate-400">
                第 {selectedSeat.row + 1} 排 · 第 {selectedSeat.col + 1} 列
              </div>
              <Button
                variant="outline"
                className="mt-3 w-full text-rose-500 hover:text-rose-600"
                onClick={() => clearSeat(selectedSeat.id)}
                disabled={loading || !selectedSeat.studentId}
              >
                <Trash2 className="h-4 w-4" />
                清空座位
              </Button>
            </div>
          )}
        </aside>
      </div>
      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.title ?? ""}
        description={confirmAction?.description ?? ""}
        confirmText="确认"
        onConfirm={confirmCurrentAction}
        onCancel={() => setConfirmAction(null)}
      />
    </>
  );
}
