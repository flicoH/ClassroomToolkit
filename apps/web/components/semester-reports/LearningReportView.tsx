import { BookOpenText, Heart, Sparkles, Target } from "lucide-react";
import { ScoreDetailsView, type ScoreDetails } from "./ScoreDetailsView";

export type ReportEntry = { text: string; sourceRefs: string[] };
export type LearningContent = ReportEntry & {
  id: string;
  section: string;
  mastery: "unassessed" | "mastered" | "practicing" | "needs_support";
};
export type LearningReportContent = {
  summary: string;
  courseOverview: string;
  strengths: ReportEntry[];
  areasToImprove: ReportEntry[];
  homeSuggestions: ReportEntry[];
  limitations: string[];
  learningContents?: LearningContent[];
  classroomPerformance?: ReportEntry[];
  scoreDetails?: ScoreDetails;
  reportDetails?: {
    institutionName: string;
    courseTheme: string;
    lessonNumber: number | null;
    lessonDate: string | null;
  };
};
export type LearningReportData = {
  studentName: string;
  className: string;
  subject: string;
  term: string;
  period: string;
  start?: string;
  end?: string;
  courseScope?: string | null;
  content: LearningReportContent;
};

export const masteryLabels = {
  unassessed: "待评价",
  mastered: "已掌握",
  practicing: "练习中",
  needs_support: "需加强"
};
const masteryColors = {
  unassessed: "bg-slate-100 text-slate-500",
  mastered: "bg-emerald-50 text-emerald-700",
  practicing: "bg-blue-50 text-blue-700",
  needs_support: "bg-violet-100 text-violet-700"
};
const periodNames: Record<string, string> = { week: "每周学习报告", month: "每月学习报告", term: "学期学习报告" };
const periodTitles: Record<string, string> = { week: "本周", month: "本月", term: "本学期" };
function dateText(value?: string, exclusive = false) {
  if (!value) return "";
  const date = new Date(new Date(value).getTime() - (exclusive ? 1 : 0));
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
}

function Entries({ entries, empty }: { entries: ReportEntry[]; empty: string }) {
  return entries.length ? (
    <div className="space-y-3">
      {entries.map((entry, index) => (
        <p key={index} className="whitespace-pre-wrap break-words leading-8">
          {entry.text}
        </p>
      ))}
    </div>
  ) : (
    <p className="text-sm font-normal text-slate-500">{empty}</p>
  );
}

/** Shared by preview, the parent page and full-content image export. */
export function LearningReportView({ report, forImage = false }: { report: LearningReportData; forImage?: boolean }) {
  const { content } = report;
  const details = content.reportDetails;
  const sections = new Map<string, LearningContent[]>();
  for (const item of content.learningContents ?? []) {
    const items = sections.get(item.section) ?? [];
    items.push(item);
    sections.set(item.section, items);
  }
  return (
    <article className="mx-auto w-full min-w-0 max-w-4xl [overflow-wrap:anywhere] overflow-hidden rounded-3xl bg-white text-slate-900 shadow-xl shadow-violet-900/5">
      <header className="flex items-center justify-between gap-5 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 px-4 py-7 text-white sm:px-10 sm:py-12">
        <div className="min-w-0">
          <p className="mb-4 text-sm font-semibold text-indigo-100">{details?.institutionName || "课堂成长记录"}</p>
          <h1 className="text-2xl font-bold leading-snug sm:text-4xl">
            {report.studentName} ·{" "}
            {details?.lessonNumber ? `第${details.lessonNumber}次课` : (periodNames[report.period] ?? "学习报告")}
          </h1>
          <p className="mt-3 text-sm text-indigo-100 sm:text-base">
            {details?.lessonDate
              ? dateText(`${details.lessonDate}T00:00:00+08:00`)
              : [dateText(report.start), dateText(report.end, true)].filter(Boolean).join(" — ")}{" "}
            · {details?.courseTheme || report.subject}
          </p>
          <p className="mt-2 break-words text-sm text-indigo-100">{report.className}</p>
        </div>
      </header>
      <div className="space-y-4 p-3 sm:space-y-8 sm:p-9">
        <section className="rounded-2xl bg-slate-50/80 p-3 sm:p-6">
          <h2 className="mb-5 flex items-center gap-2 text-lg font-bold">
            <BookOpenText className="h-5 w-5 text-indigo-600" />
            {periodTitles[report.period]}学习内容与掌握
          </h2>
          <div className="space-y-4">
            {[...sections].map(([section, items]) => (
              <div key={section} className="rounded-2xl border border-slate-100 bg-white p-3 sm:p-5">
                <h3 className="mb-3 font-semibold text-indigo-950">{section}</h3>
                <div className="divide-y divide-slate-100">
                  {items.map(item => (
                    <div key={item.id} className="flex flex-col items-start gap-2 py-3 sm:flex-row sm:gap-3">
                      <p className="min-w-0 flex-1 whitespace-pre-wrap break-words leading-7 text-slate-700">
                        {item.text}
                      </p>
                      <span
                        className={`mt-1 shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${masteryColors[item.mastery] ?? masteryColors.unassessed}`}
                      >
                        {masteryLabels[item.mastery] ?? "待评价"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {!sections.size && <p className="text-sm text-slate-500">暂未整理逐项学习内容，请由老师补充。</p>}
          </div>
        </section>
        <section className="rounded-2xl bg-slate-50/80 p-3 sm:p-6">
          <h2 className="mb-4 text-lg font-bold">{periodTitles[report.period]}的课堂表现</h2>
          {content.classroomPerformance?.length ? (
            <div className="flex flex-wrap gap-2">
              {content.classroomPerformance.map((item, index) => (
                <span key={index} className="rounded-full bg-violet-50 px-4 py-2 text-sm text-violet-800">
                  {item.text}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">老师暂未填写具体课堂表现。</p>
          )}
        </section>
        {content.scoreDetails && (
          <section className="rounded-2xl bg-slate-50/80 p-3 sm:p-6">
            <h2 className="mb-4 text-lg font-bold">{periodTitles[report.period]}积分加减情况</h2>
            <ScoreDetailsView details={content.scoreDetails} forImage={forImage} />
          </section>
        )}
        <section className="rounded-2xl bg-slate-50/80 p-3 sm:p-6">
          <h2 className="mb-4 text-lg font-bold">老师想对你说</h2>
          <p className="whitespace-pre-wrap break-words leading-8 text-slate-700">{content.summary}</p>
        </section>
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-2xl border border-amber-100 bg-amber-50/70 p-3 sm:p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-800">
              <Sparkles className="h-4 w-4" />
              {periodTitles[report.period]}最值得肯定
            </h2>
            <Entries entries={content.strengths} empty="等待老师补充值得肯定的具体表现。" />
          </section>
          <section className="rounded-2xl border border-violet-100 bg-violet-50/70 p-3 sm:p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-violet-800">
              <Target className="h-4 w-4" />
              下一步重点
            </h2>
            <Entries entries={content.areasToImprove} empty="等待老师补充下一阶段的练习重点。" />
          </section>
        </div>
        <section className="rounded-2xl bg-slate-50/80 p-3 sm:p-6">
          <h2 className="mb-4 text-lg font-bold">回家可以这样练</h2>
          <div className="text-slate-700">
            <Entries entries={content.homeSuggestions} empty="老师暂未安排家庭练习。" />
          </div>
        </section>
      </div>
      <footer className="flex items-center justify-center gap-2 border-t border-slate-100 px-5 py-5 text-xs text-slate-400">
        <Heart className="h-4 w-4 text-rose-400" />
        由老师整理，与孩子一起回顾成长
      </footer>
    </article>
  );
}
