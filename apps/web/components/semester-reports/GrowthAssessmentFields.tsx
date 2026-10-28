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
  studentName = ""
}: {
  value?: GrowthAssessment;
  onChange: (value: GrowthAssessment) => void;
  studentName?: string;
}) {
  const current = value ?? emptyGrowthAssessment();
  return (
    <section className="space-y-3 rounded-xl border bg-sky-50/30 p-3">
      <h3 className="font-semibold">学习习惯与能力成长总结</h3>
      <p className="text-xs text-muted-foreground">分别填写这位学生的实际观察，留空可在草稿中补充。</p>
      {growthDimensions.map(([key, label]) => (
        <label key={key} className="block space-y-2 text-sm font-semibold">
          {label}
          <textarea
            aria-label={`${studentName ? `${studentName} ` : ""}${label}`}
            className="min-h-24 w-full rounded-lg border bg-background p-3 font-normal"
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
export function GrowthAssessmentView({ value, periodTitle }: { value?: GrowthAssessment; periodTitle: string }) {
  return (
    <section className="rounded-2xl border border-sky-100 bg-white p-3 sm:p-6">
      <h2 className="mb-5 text-lg font-bold text-sky-900">{periodTitle}学习习惯与能力成长总结</h2>
      <div aria-label="学习习惯与能力成长总结" className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {growthDimensions.map(([key, label]) => (
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
              {key !== "overallUnderstanding" && value?.[key] && (
                <span className="font-semibold text-sky-700">成长亮点：</span>
              )}
              {value?.[key] || "老师暂未填写。"}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
