"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Student = { id: string; name: string; classId: string; className: string };
const limit = 30;

export function ReportStudentPicker({
  students,
  selected,
  onChange
}: {
  students: Student[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [classId, setClassId] = useState("");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
  const classes = useMemo(
    () => [...new Map(students.map(student => [student.classId, student.className])).entries()],
    [students]
  );
  const selectedIds = new Set(selected);
  const chosen = students.filter(student => selectedIds.has(student.id));
  const visible = students.filter(
    student =>
      (!classId || student.classId === classId) &&
      (!onlySelected || selectedIds.has(student.id)) &&
      `${student.name} ${student.className}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  );
  const remaining = visible.filter(student => !selectedIds.has(student.id));
  const visibleSelected = visible.filter(student => selectedIds.has(student.id));

  function toggle(id: string) {
    setNotice("");
    if (selectedIds.has(id)) onChange(selected.filter(current => current !== id));
    else if (selected.length < limit) onChange([...selected, id]);
    else setNotice("一次最多选择 30 位学生，请先移除已选学生。");
  }

  function selectVisible() {
    const available = limit - selected.length;
    onChange([...selected, ...remaining.slice(0, available).map(student => student.id)]);
    setNotice(
      remaining.length > available ? `已按名单顺序选择 ${available} 人，达到 30 人上限；其余学生可分批生成。` : ""
    );
  }

  return (
    <section className="space-y-3 rounded-xl border bg-background p-3 sm:p-4" aria-label="选择报告学生">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">
          选择学生{" "}
          <span className="text-sm font-normal text-muted-foreground">
            已选 {selected.length} / {limit} 人
          </span>
        </h3>
        <Button
          size="sm"
          variant="ghost"
          disabled={!selected.length}
          onClick={() => {
            onChange([]);
            setNotice("");
          }}
        >
          清空已选
        </Button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          aria-label="按班级筛选学生"
          className="h-9 rounded-md border bg-background px-3 text-sm sm:w-44"
          value={classId}
          onChange={event => setClassId(event.target.value)}
        >
          <option value="">全部班级</option>
          {classes.map(([id, name]) => (
            <option key={id} value={id}>
              {name || "未分班"}
            </option>
          ))}
        </select>
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden="true" className="absolute left-3 top-3.5 sm:top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="搜索学生姓名或班级"
            placeholder="搜索学生姓名或班级"
            className="pl-9 pr-12"
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
          {query && (
            <button
              type="button"
              aria-label="清空学生搜索"
              className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded text-muted-foreground hover:bg-muted sm:h-9 sm:w-9"
              onClick={() => setQuery("")}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Button
          size="sm"
          variant="outline"
          disabled={!remaining.length || selected.length >= limit}
          onClick={selectVisible}
        >
          选择筛选结果{remaining.length ? `（${Math.min(remaining.length, limit - selected.length)} 人）` : ""}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!visibleSelected.length}
          onClick={() => {
            const ids = new Set(visible.map(student => student.id));
            onChange(selected.filter(id => !ids.has(id)));
            setNotice("");
          }}
        >
          取消筛选结果
        </Button>
        <label className="ml-auto flex min-h-11 items-center gap-2">
          <input
            className="h-5 w-5 shrink-0 accent-indigo-600"
            type="checkbox"
            checked={onlySelected}
            onChange={event => setOnlySelected(event.target.checked)}
          />
          仅看已选
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        筛选到 {visible.length} 人 · 切换班级或搜索会保留已选学生，每人生成一份报告。
      </p>
      <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
        {visible.map(student => (
          <label
            key={student.id}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${selectedIds.has(student.id) ? "border-indigo-200 bg-indigo-50/60" : "hover:bg-muted/50"}`}
          >
            <input
              className="h-5 w-5 shrink-0 accent-indigo-600"
              type="checkbox"
              checked={selectedIds.has(student.id)}
              disabled={!selectedIds.has(student.id) && selected.length >= limit}
              onChange={() => toggle(student.id)}
              aria-label={`选择 ${student.className} ${student.name}`}
            />
            <span className="min-w-0">
              <span className="block break-words font-medium">{student.name}</span>
              <span className="text-xs text-muted-foreground">{student.className || "未分班"}</span>
            </span>
          </label>
        ))}
        {!visible.length && (
          <p className="col-span-full py-5 text-center text-sm text-muted-foreground">
            {students.length ? "没有符合筛选条件的学生" : "暂无学生，请先在班级中添加学生。"}
          </p>
        )}
      </div>
      {chosen.length > 0 && (
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground">已选学生（点击 × 移除）</p>
          <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">
            {chosen.map(student => (
              <button
                type="button"
                key={student.id}
                onClick={() => toggle(student.id)}
                aria-label={`移除 ${student.className} ${student.name}`}
                className="flex max-w-full items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs text-indigo-700 hover:bg-indigo-100"
              >
                <span className="min-w-0 break-words">
                  {student.name} · {student.className || "未分班"}
                </span>
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-amber-700" role="status">
        {notice || (selected.length >= limit ? "已达 30 人上限，可分批生成。" : "")}
      </p>
    </section>
  );
}
