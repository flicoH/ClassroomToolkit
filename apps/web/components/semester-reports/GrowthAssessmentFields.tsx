export type HomeworkProgress = { completed: number; unfinished: number };

export type GrowthAssessment = {
  learningReadiness: string;
  communicationCooperation: string;
  independenceRules: string;
  overallUnderstanding: string;
};
export const growthDimensions: Array<[keyof GrowthAssessment, string]> = [
  ["learningReadiness", "学习准备与课堂能力"],
  ["communicationCooperation", "表达沟通与同伴合作"],
  ["independenceRules", "生活自理与规则意识"],
  ["overallUnderstanding", "综合画像理解"]
];
export function emptyGrowthAssessment(): GrowthAssessment {
  return { learningReadiness: "", communicationCooperation: "", independenceRules: "", overallUnderstanding: "" };
}
export function GrowthAssessmentFields({
  value,
  onChange,
  studentName = "",
  compact = false
}: {
  value?: Partial<GrowthAssessment>;
  onChange: (value: GrowthAssessment) => void;
  studentName?: string;
  compact?: boolean;
}) {
  const current = { ...emptyGrowthAssessment(), ...value };
  return (
    <section className={`rounded-xl border bg-sky-50/30 p-3 ${compact ? "grid gap-2.5 sm:grid-cols-2" : "space-y-3"}`}>
      <h3 className={compact ? "text-xs font-bold sm:col-span-2" : "font-semibold"}>学习习惯与能力成长总结</h3>
      <p className="text-xs text-muted-foreground sm:col-span-2">分别填写这位学生的实际观察，留空可在草稿中补充。</p>
      {growthDimensions.map(([key, label]) => (
        <label
          key={key}
          className={compact ? "block space-y-1 text-xs font-semibold" : "block space-y-2 text-sm font-semibold"}
        >
          {label}
          <textarea
            aria-label={`${studentName ? `${studentName} ` : ""}${label}`}
            className={`w-full rounded-lg border bg-background p-3 font-normal ${compact ? "min-h-16" : "min-h-24"}`}
            maxLength={800}
            value={current[key]}
            placeholder={
              key === "overallUnderstanding" ? "综合本周期观察，填写成长变化与后续关注方向" : "填写实际观察到的成长亮点"
            }
            onChange={event => onChange({ ...current, [key]: event.target.value })}
          />
        </label>
      ))}
    </section>
  );
}
export function GrowthAssessmentView({
  value,
  periodTitle,
  homeworkProgress
}: {
  value?: Partial<GrowthAssessment>;
  periodTitle: string;
  homeworkProgress?: HomeworkProgress;
}) {
  const filledDimensions = growthDimensions.filter(([key]) => Boolean(value?.[key]?.trim()));
  const hasHomework = Boolean(homeworkProgress && homeworkProgress.completed + homeworkProgress.unfinished > 0);
  if (!filledDimensions.length && !hasHomework) return null;
  return (
    <section className="rounded-2xl border border-sky-100 bg-white p-3 sm:p-6">
      <h2 className="mb-5 text-lg font-bold text-sky-900">{periodTitle}学习习惯与能力成长总结</h2>
      <div aria-label="学习习惯与能力成长总结" className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {filledDimensions.map(([key, label]) => (
          <div
            key={key}
            className={`relative min-w-0 rounded-xl py-3 pl-5 pr-3 ${key === "overallUnderstanding" ? "bg-amber-50/70" : "bg-slate-50/50"}`}
          >
            <span
              aria-hidden="true"
              className="absolute inset-y-3 left-0 w-1 rounded-full bg-gradient-to-b from-sky-500 to-amber-400"
            />
            <h3 className={`mb-2 font-semibold ${key === "overallUnderstanding" ? "text-amber-800" : "text-sky-900"}`}>
              {label}
            </h3>
            <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">
              {key !== "overallUnderstanding" && <span className="font-semibold text-sky-700">成长亮点：</span>}
              {value?.[key]?.trim()}
            </p>
          </div>
        ))}
        {hasHomework && homeworkProgress && <HomeworkProgressView progress={homeworkProgress} />}
      </div>
    </section>
  );
}

function HomeworkProgressView({ progress }: { progress: HomeworkProgress }) {
  const { completed, unfinished } = progress;
  const total = completed + unfinished;
  const completionPercent = (completed / total) * 100;
  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/50 p-4 sm:col-span-2">
      <h3 className="font-semibold text-sky-900">数学作业完成情况</h3>
      <div className="mb-2 mt-3 flex justify-between gap-2 text-sm font-semibold tabular-nums">
        <span className="text-emerald-700">已完成 {completed}</span>
        <span className="text-red-700">未完成 {unfinished}</span>
      </div>
      <div
        role="progressbar"
        aria-label="数学作业完成情况"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={completed}
        aria-valuetext={`已完成 ${completed} 项，未完成 ${unfinished} 项`}
        className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100"
      >
        <div className="bg-emerald-500" style={{ width: `${completionPercent}%` }} />
        <div className="bg-red-500" style={{ width: `${100 - completionPercent}%` }} />
      </div>
    </div>
  );
}
