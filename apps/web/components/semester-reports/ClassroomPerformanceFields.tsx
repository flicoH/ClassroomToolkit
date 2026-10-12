"use client";
import { useId } from "react";
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
  subjects?: Array<{ subjectId: string; name: string }>;
  subject: string;
  value: PerformanceRating[];
  onChange: (value: PerformanceRating[]) => void;
}) {
  const id = useId();
  const groups: Array<{ subjectId?: string; name: string }> =
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
            {[
              ...performances,
              ...value
                .filter(
                  item =>
                    item.subjectId === group.subjectId &&
                    !performances.some(
                      ([label]) =>
                        (label === "英语开口" && !group.name.includes("英") ? "学科表达" : label) === item.label
                    )
                )
                .map(item => [item.label, []] as [string, string[]])
            ].map(([original, options], index) => {
              const label = original === "英语开口" && !group.name.includes("英") ? "学科表达" : original;
              const listId = `${id}-${groupIndex}-${index}`;
              return (
                <label key={label} className="space-y-1 text-sm">
                  {label}
                  <Input
                    aria-label={`${group.name} ${label}`}
                    list={listId}
                    maxLength={100}
                    placeholder="选择或填写实际表现"
                    value={value.find(item => item.subjectId === group.subjectId && item.label === label)?.value ?? ""}
                    onChange={event =>
                      onChange([
                        ...value.filter(item => !(item.subjectId === group.subjectId && item.label === label)),
                        ...(event.target.value
                          ? [
                              {
                                ...(group.subjectId ? { subjectId: group.subjectId } : {}),
                                label,
                                value: event.target.value
                              }
                            ]
                          : [])
                      ])
                    }
                  />
                  <datalist id={listId}>
                    {options.map(option => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                </label>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
