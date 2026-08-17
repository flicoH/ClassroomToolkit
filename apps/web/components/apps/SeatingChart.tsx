/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 * **********************************************************************************************
 */
"use client";

import { useMemo, useState } from "react";
import { Grid3X3, Move, Plus, RotateCcw, Shuffle, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
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

const students: Student[] = [
  { id: "2026001", name: "周杰伦", studentNo: "2026001" },
  { id: "2026002", name: "周杰伦", studentNo: "2026002" },
  { id: "2026003", name: "周杰伦", studentNo: "2026003" },
  { id: "2026004", name: "林俊杰", studentNo: "2026004" },
  { id: "2026005", name: "孙燕姿", studentNo: "2026005" },
  { id: "2026006", name: "王心凌", studentNo: "2026006" },
  { id: "2026007", name: "李宇春", studentNo: "2026007" },
  { id: "2026008", name: "周笔畅", studentNo: "2026008" }
];

/** 根据行列数生成座位格；已有学生会按顺序保留到新座位表中。 */
function createSeats(rows: number, cols: number, sourceStudents = students): Seat[] {
  return Array.from({ length: rows * cols }, (_, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    return {
      id: `seat-${row}-${col}`,
      row,
      col,
      studentId: sourceStudents[index]?.id ?? null
    };
  });
}

function getInitial(name: string) {
  return name.slice(0, 1) || "学";
}

function shuffleStudentIds(source: Student[]) {
  const result = source.map(student => student.id);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

export function SeatingChart() {
  const [rows, setRows] = useState(4);
  const [cols, setCols] = useState(4);
  const [seats, setSeats] = useState<Seat[]>(() => createSeats(4, 4));
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [draggingStudentId, setDraggingStudentId] = useState<string | null>(null);
  const [draggingSeatId, setDraggingSeatId] = useState<string | null>(null);

  const studentMap = useMemo(() => new Map(students.map(student => [student.id, student])), []);
  const seatedIds = new Set(seats.map(seat => seat.studentId).filter(Boolean));
  const unseatedStudents = students.filter(student => !seatedIds.has(student.id));

  /** 调整行列时重建座位，同时尽量保留原座位上的学生。 */
  const rebuildSeats = (nextRows: number, nextCols: number) => {
    const assignedIds = seats.map(seat => seat.studentId).filter(Boolean) as string[];
    const nextSeats = Array.from({ length: nextRows * nextCols }, (_, index) => {
      const row = Math.floor(index / nextCols);
      const col = index % nextCols;
      return {
        id: `seat-${row}-${col}`,
        row,
        col,
        studentId: assignedIds[index] ?? null
      };
    });
    setRows(nextRows);
    setCols(nextCols);
    setSeats(nextSeats);
    setSelectedSeatId(null);
  };

  /** 删除行会丢失最后一行座位，因此需要确认。 */
  const deleteRow = () => {
    if (!window.confirm("确定删除一行座位吗？超出座位中的学生会变为未安排。")) return;
    rebuildSeats(Math.max(2, rows - 1), cols);
  };

  const deleteColumn = () => {
    if (!window.confirm("确定删除一列座位吗？超出座位中的学生会变为未安排。")) return;
    rebuildSeats(rows, Math.max(2, cols - 1));
  };

  /** 随机排座会覆盖当前座位安排。 */
  const shuffleSeats = () => {
    const shuffledIds = shuffleStudentIds(students);
    setSeats(current => current.map((seat, index) => ({ ...seat, studentId: shuffledIds[index] ?? null })));
    setSelectedSeatId(null);
  };

  /** 清空单个座位，同样走二次确认。 */
  const clearSeat = (seatId: string) => {
    const seat = seats.find(item => item.id === seatId);
    const student = seat?.studentId ? studentMap.get(seat.studentId) : null;
    if (!window.confirm(`确定清空${student ? `「${student.name}」的` : "当前"}座位吗？`)) return;
    setSeats(current => current.map(seat => (seat.id === seatId ? { ...seat, studentId: null } : seat)));
  };

  /** 将学生放入目标座位；如果来源是另一个座位，则支持移动/交换。 */
  const assignStudent = (seatId: string, studentId: string, fromSeatId?: string | null) => {
    setSeats(current =>
      current.map(seat => {
        if (seat.id === seatId) return { ...seat, studentId };
        if (fromSeatId && seat.id === fromSeatId) return { ...seat, studentId: null };
        if (!fromSeatId && seat.studentId === studentId) return { ...seat, studentId: null };
        return seat;
      })
    );
    setDraggingStudentId(null);
    setDraggingSeatId(null);
  };

  /** 拖拽已安排学生到另一个座位时，空座移动，有人则交换。 */
  const moveOrSwapSeat = (targetSeatId: string) => {
    if (!draggingStudentId) return;

    setSeats(current => {
      const sourceSeat = draggingSeatId ? current.find(seat => seat.id === draggingSeatId) : undefined;
      const targetSeat = current.find(seat => seat.id === targetSeatId);
      if (!targetSeat) return current;

      return current.map(seat => {
        if (seat.id === targetSeatId) {
          return { ...seat, studentId: draggingStudentId };
        }
        if (sourceSeat && seat.id === sourceSeat.id) {
          return { ...seat, studentId: targetSeat.studentId };
        }
        if (!sourceSeat && seat.studentId === draggingStudentId) {
          return { ...seat, studentId: null };
        }
        return seat;
      });
    });

    setDraggingStudentId(null);
    setDraggingSeatId(null);
  };

  const selectedSeat = seats.find(seat => seat.id === selectedSeatId);

  return (
    <div className="flex min-h-full bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white px-6 py-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white">
                <Grid3X3 className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">座位表</h1>
                <p className="text-sm text-slate-400">一年级 · {students.length} 名学生</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={deleteRow}>
                删除行
              </Button>
              <Button variant="outline" onClick={() => rebuildSeats(rows + 1, cols)}>
                <Plus className="h-4 w-4" />
                添加行
              </Button>
              <Button variant="outline" onClick={deleteColumn}>
                删除列
              </Button>
              <Button variant="outline" onClick={() => rebuildSeats(rows, cols + 1)}>
                <Plus className="h-4 w-4" />
                添加列
              </Button>
              <Button variant="outline" onClick={() => setSeats(createSeats(rows, cols))}>
                <RotateCcw className="h-4 w-4" />
                重置
              </Button>
              <Button className="bg-blue-600 font-bold hover:bg-blue-700" onClick={shuffleSeats}>
                <Shuffle className="h-4 w-4" />
                随机排座
              </Button>
            </div>
          </div>
        </header>

        <main className="flex flex-1 flex-col overflow-auto p-6">
          <div className="mx-auto mb-6 w-[min(560px,100%)] rounded-full bg-slate-800 px-6 py-3 text-center text-sm font-bold text-white shadow-lg">
            讲台
          </div>

          <div className="mx-auto w-full max-w-[860px] rounded-2xl bg-white p-5 shadow-sm dark:bg-slate-900">
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(90px, 1fr))`
              }}
            >
              {seats.map(seat => {
                const student = seat.studentId ? studentMap.get(seat.studentId) : null;
                const isSelected = selectedSeatId === seat.id;
                return (
                  <button
                    key={seat.id}
                    draggable={Boolean(student)}
                    onClick={() => setSelectedSeatId(seat.id)}
                    onDragStart={() => {
                      if (!student) return;
                      setDraggingStudentId(student.id);
                      setDraggingSeatId(seat.id);
                    }}
                    onDragEnd={() => {
                      setDraggingStudentId(null);
                      setDraggingSeatId(null);
                    }}
                    onDragOver={event => event.preventDefault()}
                    onDrop={() => moveOrSwapSeat(seat.id)}
                    className={cn(
                      "min-h-[92px] rounded-xl border p-3 text-center transition",
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
          </div>
        </main>
      </section>

      <aside className="w-[260px] shrink-0 border-l border-slate-200 bg-white/90 p-4 dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mb-4 flex items-center gap-2 font-bold">
          <Users className="h-5 w-5 text-blue-600" />
          未安排学生
        </div>
        <div className="space-y-2">
          {unseatedStudents.map(student => (
            <button
              key={student.id}
              draggable
              onDragStart={() => setDraggingStudentId(student.id)}
              onDragEnd={() => {
                setDraggingStudentId(null);
                setDraggingSeatId(null);
              }}
              onClick={() => selectedSeat && assignStudent(selectedSeat.id, student.id)}
              className="flex w-full items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-blue-950/40"
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
              全部学生已安排
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
              disabled={!selectedSeat.studentId}
            >
              <Trash2 className="h-4 w-4" />
              清空座位
            </Button>
          </div>
        )}
      </aside>
    </div>
  );
}
