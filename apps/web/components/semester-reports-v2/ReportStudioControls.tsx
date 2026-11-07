"use client";

import type { ChangeEventHandler } from "react";
import { Upload } from "lucide-react";

export type ReportWizardStep = 1 | 2 | 3 | 4;

const steps = [
  [1, "周期与基础"],
  [2, "学科与内容来源"],
  [3, "选择学生"],
  [4, "课堂评价与生成"]
] as const;

export function ReportWizardSteps({
  step,
  onChange,
  hasSubjects,
  hasStudents
}: {
  step: ReportWizardStep;
  onChange: (step: ReportWizardStep) => void;
  hasSubjects: boolean;
  hasStudents: boolean;
}) {
  return (
    <nav
      aria-label="报告填写步骤"
      className="grid grid-cols-4 gap-2 rounded-2xl border bg-card p-2 text-xs font-medium"
    >
      {steps.map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-current={step === value ? "step" : undefined}
          disabled={(value >= 3 && !hasSubjects) || (value === 4 && !hasStudents)}
          onClick={() => onChange(value)}
          className={`rounded-xl px-2 py-2.5 text-center transition disabled:cursor-not-allowed disabled:opacity-40 ${
            step === value ? "bg-indigo-600 font-bold text-white shadow-xs" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          {value}. {label}
        </button>
      ))}
    </nav>
  );
}

export function CoursePdfUpload({
  disabled,
  uploading,
  onChange
}: {
  disabled?: boolean;
  uploading?: boolean;
  onChange: ChangeEventHandler<HTMLInputElement>;
}) {
  return (
    <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50/30 p-5 text-center transition hover:bg-indigo-50/60 focus-within:ring-2 focus-within:ring-ring has-disabled:cursor-not-allowed has-disabled:opacity-60 dark:border-indigo-700 dark:bg-indigo-950/20">
      <Upload className="h-8 w-8 text-indigo-500" aria-hidden="true" />
      <span className="mt-1 text-xs font-bold text-indigo-700 dark:text-indigo-300">
        {uploading ? "正在上传课程 PDF…" : "选择课程 PDF（最大 30MB）"}
      </span>
      <span className="text-[11px] text-muted-foreground">上传后自动解析，核对章节后用于报告</span>
      <input
        type="file"
        accept=".pdf,application/pdf"
        aria-label="选择课程 PDF"
        className="sr-only"
        disabled={disabled}
        onChange={onChange}
      />
    </label>
  );
}
