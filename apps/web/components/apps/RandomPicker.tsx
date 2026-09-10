/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 * **********************************************************************************************
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { History, Play, RotateCcw, Shuffle, Sparkles, UserRoundCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import request from "@/lib/request";
import { cn } from "@/lib/utils";

interface Student {
  id: string;
  name: string;
  studentNo: string;
}

interface ClassGroup {
  id: string;
  name: string;
  students: Student[];
}

interface PickHistory {
  id: string;
  classId: string;
  selectedCount: number;
  students: Student[];
  createdAt: string;
}

const fallbackClass: ClassGroup = { id: "", name: "暂无班级", students: [] };

/** 获取姓名首字作为头像占位。 */
function getInitial(name: string) {
  return name.slice(0, 1) || "学";
}

/** 随机点名主界面，负责班级切换、抽取动画和历史记录展示。 */
export function RandomPicker() {
  const [classes, setClasses] = useState<ClassGroup[]>([]);
  const [activeClassId, setActiveClassId] = useState("");
  const [selectedCount, setSelectedCount] = useState(1);
  const [isRolling, setIsRolling] = useState(false);
  const [previewStudent, setPreviewStudent] = useState<Student | null>(null);
  const [pickedStudents, setPickedStudents] = useState<Student[]>([]);
  const [history, setHistory] = useState<PickHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishTimerRef = useRef<number | null>(null);

  const activeClass = classes.find(item => item.id === activeClassId) ?? classes[0] ?? fallbackClass;

  // 抽取人数不能超过当前班级人数。
  const availableCounts = useMemo(() => {
    return [1, 2, 3, 4].filter(count => count <= activeClass.students.length);
  }, [activeClass.students.length]);

  /** 清理滚动动画定时器，防止重复启动后残留多个 interval。 */
  const stopRolling = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (finishTimerRef.current) {
      clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
    setIsRolling(false);
  };

  /** 从后端加载可点名班级和最近点名历史。 */
  const loadPickerData = async () => {
    setLoading(true);
    try {
      const [nextClasses, nextHistory] = await Promise.all([
        request<ClassGroup[], ClassGroup[]>("/api/random-picker/classes"),
        request<PickHistory[], PickHistory[]>("/api/random-picker/histories")
      ]);
      setClasses(nextClasses);
      setHistory(nextHistory.slice(0, 6));
      const nextClass = nextClasses.find(item => item.id === activeClassId) ?? nextClasses[0];
      setActiveClassId(nextClass?.id ?? "");
      setPreviewStudent(nextClass?.students[0] ?? null);
    } finally {
      setLoading(false);
    }
  };

  /** 真正生成点名结果，并写入最近记录。 */
  const pickStudents = async () => {
    stopRolling();
    if (!activeClass.id || !activeClass.students.length) return;
    const record = await request<PickHistory, PickHistory>({
      url: "/api/random-picker/pick",
      method: "POST",
      data: { classId: activeClass.id, selectedCount }
    });
    setPickedStudents(record.students);
    setPreviewStudent(record.students[0] ?? null);
    setHistory(current => [record, ...current].slice(0, 6));
  };

  /** 先快速滚动预览学生，再延迟落定结果，模拟抽取动画。 */
  const startRolling = () => {
    if (isRolling) {
      void pickStudents();
      return;
    }

    setPickedStudents([]);
    setIsRolling(true);
    timerRef.current = setInterval(() => {
      const next = activeClass.students[Math.floor(Math.random() * activeClass.students.length)];
      setPreviewStudent(next ?? null);
    }, 72);

    finishTimerRef.current = window.setTimeout(() => void pickStudents(), 1800);
  };

  useEffect(() => {
    void loadPickerData();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    };
  }, []);

  /** 清空本轮抽取结果，并恢复当前班级第一个学生为预览。 */
  const reset = () => {
    stopRolling();
    setPickedStudents([]);
    setPreviewStudent(activeClass.students[0] ?? null);
  };

  /** 切换班级时重置抽取结果，避免旧班级学生残留在预览区。 */
  const handleClassChange = (classId: string) => {
    stopRolling();
    const nextClass = classes.find(item => item.id === classId) ?? fallbackClass;
    setActiveClassId(classId);
    setPickedStudents([]);
    setPreviewStudent(nextClass.students[0] ?? null);
    setSelectedCount(1);
  };

  const spotlightStudent = pickedStudents[0] ?? previewStudent;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100 md:flex-row">
      <aside className="flex max-h-[34dvh] min-h-0 w-full shrink-0 flex-col border-b border-slate-200 bg-white/90 p-3 dark:border-slate-800 dark:bg-slate-900/90 md:h-full md:max-h-none md:w-[220px] md:border-b-0 md:border-r md:p-4">
        <div className="mb-3 flex shrink-0 items-center gap-3 md:mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
            <Shuffle className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-bold">随机点名</h2>
            <p className="text-xs text-slate-400">课堂互动抽取</p>
          </div>
        </div>

        <div className="flex min-h-0 gap-2 overflow-x-auto pb-1 md:block md:space-y-2 md:overflow-x-visible md:overflow-y-auto md:pb-0">
          {classes.map(classGroup => (
            <button
              key={classGroup.id}
              onClick={() => handleClassChange(classGroup.id)}
              disabled={isRolling}
              className={cn(
                "w-[160px] shrink-0 rounded-xl border p-3 text-left transition md:w-full",
                activeClassId === classGroup.id
                  ? "border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300"
                  : "border-transparent hover:bg-slate-50 dark:hover:bg-slate-800"
              )}
            >
              <div className="font-bold">{classGroup.name}</div>
              <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                <Users className="h-3.5 w-3.5" />
                {classGroup.students.length} 名学生
              </div>
            </button>
          ))}
        </div>

        <div className="mt-3 shrink-0 md:mt-6">
          <div className="mb-2 text-xs font-bold text-slate-500">抽取人数</div>
          <div className="grid grid-cols-4 gap-2 md:grid-cols-2">
            {availableCounts.map(count => (
              <button
                key={count}
                onClick={() => setSelectedCount(count)}
                disabled={isRolling}
                className={cn(
                  "h-10 rounded-lg border text-sm font-bold transition",
                  selectedCount === count
                    ? "border-blue-500 bg-blue-600 text-white"
                    : "border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-950"
                )}
              >
                {count} 人
              </button>
            ))}
          </div>
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900 sm:px-6 sm:py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">{activeClass.name}</h1>
              <p className="text-sm text-slate-400">从 {activeClass.students.length} 名学生中随机抽取</p>
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <Button variant="outline" onClick={reset}>
                <RotateCcw className="h-4 w-4" />
                重置
              </Button>
              <Button className="flex-1 bg-blue-600 font-bold hover:bg-blue-700 sm:flex-none" onClick={startRolling}>
                <Play className="h-4 w-4" />
                {isRolling ? "停止" : "开始点名"}
              </Button>
            </div>
          </div>
        </header>

        <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto p-4 sm:p-6 lg:grid-cols-[1fr_260px]">
          <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl bg-white p-5 shadow-sm dark:bg-slate-900 sm:min-h-[420px] sm:p-6">
            <div
              className={cn(
                "relative flex h-44 w-44 items-center justify-center rounded-full bg-blue-50 text-6xl font-black text-blue-700 transition-all duration-200 dark:bg-blue-950 dark:text-blue-300",
                isRolling && "scale-105 shadow-2xl shadow-blue-500/20"
              )}
            >
              <Sparkles className="absolute right-7 top-8 h-6 w-6 text-blue-400" />
              {spotlightStudent ? getInitial(spotlightStudent.name) : "?"}
            </div>
            <div className="mt-7 text-center">
              <div className="text-3xl font-black tracking-wide sm:text-4xl">
                {spotlightStudent ? spotlightStudent.name : "准备点名"}
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-400">
                {spotlightStudent ? `#${spotlightStudent.studentNo}` : "点击开始随机抽取"}
              </div>
            </div>

            {pickedStudents.length > 1 && (
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                {pickedStudents.map(student => (
                  <div
                    key={student.id}
                    className="rounded-full bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                  >
                    {student.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          <aside className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900 sm:p-5">
            <div className="mb-4 flex items-center gap-2 font-bold">
              <History className="h-5 w-5 text-blue-600" />
              点名记录
            </div>
            <div className="space-y-3">
              {history.map((record, index) => (
                <div key={record.id} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
                  <div className="mb-2 text-xs font-semibold text-slate-400">第 {history.length - index} 次</div>
                  <div className="flex flex-wrap gap-2">
                    {record.students.map(student => (
                      <span
                        key={student.id}
                        className="rounded-full bg-white px-2.5 py-1 text-xs font-bold dark:bg-slate-900"
                      >
                        {student.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {!loading && history.length === 0 && (
                <div className="flex min-h-[180px] flex-col items-center justify-center text-center text-sm text-slate-400">
                  <UserRoundCheck className="mb-3 h-8 w-8" />
                  暂无记录
                </div>
              )}
            </div>
          </aside>
        </main>
      </section>
    </div>
  );
}
