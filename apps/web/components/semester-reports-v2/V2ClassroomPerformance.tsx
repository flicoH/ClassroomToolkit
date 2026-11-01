"use client";

import { useMemo } from "react";
import { defaultPerformanceConfig, type PerformanceField } from "@/components/semester-reports/performance-config";

export type PerformanceRating = {
  subjectId?: string;
  label: string;
  value: string;
};

export type V2Subject = {
  id: string;
  name: string;
  performanceConfig?: PerformanceField[] | null;
};

/**
 * V2 报告课堂表现专用选择组件
 *
 * 设计意图与安全边界：
 * 1. 严格使用预设胶囊按钮，禁止自由手写文本框，保证评价语言规范、积极且格式统一；
 * 2. 支持单项胶囊反选（点击已选中标签自动取消置空），未选维度不在最终报告长图中留空白或占位符；
 * 3. 维度状态严格按 `subjectId + label` 隔离，每门学科独立维护最多 12 项评价。
 */
export function V2ClassroomPerformance({
  subjects,
  activeSubjectId,
  onSelectSubject,
  ratings,
  onChange,
  disabled = false,
  hideSubjectTabs = false
}: {
  subjects: V2Subject[];
  activeSubjectId?: string;
  onSelectSubject?: (subjectId: string) => void;
  ratings: PerformanceRating[];
  onChange: (nextRatings: PerformanceRating[]) => void;
  disabled?: boolean;
  hideSubjectTabs?: boolean;
}) {
  const currentSubject = useMemo(() => {
    if (!subjects.length) return null;
    return subjects.find(s => s.id === activeSubjectId) || subjects[0]!;
  }, [subjects, activeSubjectId]);

  const configuredFields: PerformanceField[] = useMemo(() => {
    if (!currentSubject) return [];
    return currentSubject.performanceConfig && currentSubject.performanceConfig.length > 0
      ? currentSubject.performanceConfig
      : defaultPerformanceConfig();
  }, [currentSubject]);

  const subjectRatingsMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!currentSubject) return map;
    for (const r of ratings) {
      if (r.subjectId === currentSubject.id) {
        map.set(r.label, r.value);
      }
    }
    return map;
  }, [ratings, currentSubject]);

  function handleSelectOption(fieldLabel: string, optionValue: string) {
    if (disabled || !currentSubject) return;

    const currentValue = subjectRatingsMap.get(fieldLabel) || "";
    // 如果点击已选中的选项，反选取消（置为暂不评价）
    const nextValue = currentValue === optionValue ? "" : optionValue;

    const filtered = ratings.filter(r => !(r.subjectId === currentSubject.id && r.label === fieldLabel));

    if (nextValue.trim()) {
      onChange([...filtered, { subjectId: currentSubject.id, label: fieldLabel, value: nextValue.trim() }]);
    } else {
      onChange(filtered);
    }
  }

  function handleClearRating(fieldLabel: string) {
    if (disabled || !currentSubject) return;
    const filtered = ratings.filter(r => !(r.subjectId === currentSubject.id && r.label === fieldLabel));
    onChange(filtered);
  }

  if (!subjects.length || !currentSubject) {
    return (
      <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
        暂无选中学科，请先为报告添加至少一门学科。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 学科切换标签页（多学科时展示，若外部已渲染切换器则隐藏） */}
      {!hideSubjectTabs && subjects.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="课堂表现学科切换">
          {subjects.map(sub => {
            const isSelected = sub.id === currentSubject.id;
            return (
              <button
                key={sub.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                disabled={disabled}
                onClick={() => onSelectSubject?.(sub.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  isSelected
                    ? "bg-indigo-600 text-white shadow-2xs"
                    : "border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {sub.name}
              </button>
            );
          })}
        </div>
      )}

      {/* 对应学科的评价维度列表 */}
      <div className="space-y-2.5" data-testid="v2-performance-fields-container">
        {configuredFields.map(field => {
          const selectedVal = subjectRatingsMap.get(field.label) || "";

          return (
            <div
              key={field.label}
              className="space-y-2 rounded-xl border bg-background/50 p-2.5 text-xs transition"
              data-testid={`perf-dimension-${field.label}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">{field.label}</span>
                <span
                  className={`text-[11px] ${selectedVal ? "font-semibold text-indigo-600 dark:text-indigo-400" : "text-muted-foreground"}`}
                >
                  {selectedVal ? `已选：${selectedVal}` : "未选择（暂不评价）"}
                </span>
              </div>

              {/* 纯胶囊单选按钮组：严禁任何文本输入框，只能选择后台设置好的预设值 */}
              <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={field.label}>
                <button
                  type="button"
                  disabled={disabled}
                  aria-checked={!selectedVal}
                  role="radio"
                  onClick={() => handleClearRating(field.label)}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
                    !selectedVal
                      ? "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200 font-semibold"
                      : "border bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  暂不评价
                </button>

                {field.options.map(option => {
                  const isChecked = selectedVal === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={disabled}
                      aria-checked={isChecked}
                      role="radio"
                      onClick={() => handleSelectOption(field.label, option)}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                        isChecked
                          ? "bg-indigo-600 text-white font-semibold shadow-2xs"
                          : "border bg-background text-foreground hover:border-indigo-400 hover:text-indigo-600 dark:hover:border-indigo-500"
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
