"use client";
import { useId } from "react";
import { defaultPerformanceConfig, type PerformanceField, type PerformanceSubject } from "./performance-config";
import type { ReportEntry } from "./LearningReportView";
import { Input } from "@/components/ui/input";

export type PerformanceRating = { subjectId?: string; label: string; value: string };
export function performanceRatings(entries: ReportEntry[]): PerformanceRating[] {
  return entries.map((entry, index) => {
    const separator = entry.text.indexOf(" · ");
    return {
      subjectId: entry.subjectId,
      label: separator < 0 ? `原课堂记录 ${index + 1}` : entry.text.slice(0, separator),
      value: separator < 0 ? entry.text : entry.text.slice(separator + 3)
    };
  });
}

/** Preserve untouched legacy prose and references when editing another subject. */
export function performanceEntries(ratings: PerformanceRating[], previous: ReportEntry[]): ReportEntry[] {
  const oldRatings = performanceRatings(previous);
  return ratings
    .filter(item => item.value.trim())
    .map(item => {
      const index = oldRatings.findIndex(
        old => old.subjectId === item.subjectId && old.label === item.label && old.value === item.value
      );
      if (index >= 0) return previous[index]!;
      return {
        ...(item.subjectId ? { subjectId: item.subjectId } : {}),
        text: `${item.label} · ${item.value.trim()}`,
        sourceRefs: ["teacher-review"]
      };
    });
}

const performances: Array<[string, string[]]> = [
  ["课堂任务", ["独立完成", "基本完成", "需要帮助"]],
  ["看图表达", ["能说词", "能说短句", "能完整表达", "需要提示"]],
  ["听指令反应", ["能听懂并反应", "基本听懂", "需要引导"]],
  ["跟读发音", ["清晰准确", "基本跟读", "需要练习"]],
  ["英语开口", ["主动表达", "能模仿说", "需要鼓励"]],
  ["课堂参与", ["主动参与", "引导参与", "需要鼓励"]],
  ["专注情况", ["专注稳定", "基本专注", "需要提醒"]],
  ["进入状态", ["迅速进入", "逐渐进入", "需要适应"]]
];

/** The legacy group stays separate: a shared observation cannot be attributed to every subject. */
export function ClassroomPerformanceFields({
  subjects,
  subject,
  value,
  onChange
}: {
  subjects?: PerformanceSubject[];
  subject: string;
  value: PerformanceRating[];
  onChange: (value: PerformanceRating[]) => void;
}) {
  const id = useId();
  const groups: Array<{ subjectId?: string; name: string; performanceConfig?: PerformanceField[] | null }> =
    subjects === undefined
      ? [{ name: subject }]
      : [...subjects, ...(value.some(item => !item.subjectId) ? [{ name: "未分学科的原课堂表现" }] : [])];
  return (
    <div className="space-y-4">
      {groups.map((group, groupIndex) => (
        <section key={group.subjectId ?? "legacy"} className="space-y-3 rounded-xl border p-3">
          <h4 className="font-semibold">
            {group.subjectId ? `${group.name}的课堂表现` : subjects ? group.name : "本期的课堂表现"}
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {(() => {
              const configured: Array<[string, string[]]> = group.subjectId
                ? (group.performanceConfig ?? defaultPerformanceConfig()).map(field => [field.label, field.options])
                : performances.map(([label, options]) => [
                    label === "英语开口" && !group.name.includes("英") ? "学科表达" : label,
                    options
                  ]);
              // Keep previously saved categories and values visible when a teacher changes the current configuration.
              const fields = [
                ...configured,
                ...value
                  .filter(
                    item => item.subjectId === group.subjectId && !configured.some(([label]) => label === item.label)
                  )
                  .map(item => [item.label, []] as [string, string[]])
              ];
              return fields.map(([label, options], index) => {
                const listId = `${id}-${groupIndex}-${index}`;
                const selected =
                  value.find(item => item.subjectId === group.subjectId && item.label === label)?.value ?? "";
                const update = (next: string) =>
                  onChange([
                    ...value.filter(item => !(item.subjectId === group.subjectId && item.label === label)),
                    ...(next
                      ? [{ ...(group.subjectId ? { subjectId: group.subjectId } : {}), label, value: next }]
                      : [])
                  ]);
                return (
                  <label key={label} className="space-y-1 text-sm">
                    {label}
                    {group.subjectId ? (
                      <select
                        aria-label={`${group.name} ${label}`}
                        className="h-10 w-full min-w-0 rounded-md border bg-background px-2"
                        value={selected}
                        onChange={event => update(event.target.value)}
                      >
                        <option value="">暂不评价（不显示在报告中）</option>
                        {selected && !options.includes(selected) && (
                          <option value={selected}>{selected}（原记录）</option>
                        )}
                        {options.map(option => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <>
                        <Input
                          aria-label={`${group.name} ${label}`}
                          list={listId}
                          maxLength={100}
                          placeholder="选择或填写实际表现"
                          value={selected}
                          onChange={event => update(event.target.value)}
                        />
                        <datalist id={listId}>
                          {options.map(option => (
                            <option key={option} value={option} />
                          ))}
                        </datalist>
                      </>
                    )}
                  </label>
                );
              });
            })()}
          </div>
        </section>
      ))}
    </div>
  );
}
