import { GrowthAssessmentView, type GrowthAssessment } from "./GrowthAssessmentFields";
import { ReportPetView, type ReportPet } from "./ReportPetView";
import { BookOpenText, Heart, Sparkles, Target } from "lucide-react";
import { PeriodScoreChart } from "./PeriodScoreChart";
import type { ScoreDetails } from "./ScoreDetailsView";

export type ReportEntry = { subjectId?: string; text: string; sourceRefs: string[] };
export type LearningContent = ReportEntry & {
  id: string;
  section: string;
  mastery: "unassessed" | "mastered" | "practicing" | "needs_support";
};
export type LearningReportContent = {
  reportVersion?: "v2";
  studentPhoto?: string | null;
  growthAssessment?: GrowthAssessment;
  reportSubjects?: Array<{ subjectId: string; name: string }>;
  pet?: ReportPet | null;
  petAsOf?: string;
  petHistoryStatus?: "recorded" | "unavailable";
  classroomPhoto?: string | null;
  classroomPhotos?: Array<string | null>;
  classroomPhotoCaptions?: string[];
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

/** Read both fixed slots, falling back to legacy single-photo reports. */
export function reportClassroomPhotos(content: Pick<LearningReportContent, "classroomPhoto" | "classroomPhotos">) {
  return content.classroomPhotos
    ? [content.classroomPhotos[0] ?? null, content.classroomPhotos[1] ?? null]
    : [content.classroomPhoto ?? null, null];
}

/** Manual IDs survive the public API's conversion of references to Chinese labels. */
export function showsLearningMastery(item: Pick<LearningContent, "id" | "sourceRefs">) {
  return !item.id.startsWith("manual-") && !item.sourceRefs.some(ref => ref.startsWith("teacher-course:"));
}

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
const periodNames: Record<string, string> = { week: "每周成长报告", month: "每月成长报告", term: "学期成长报告" };
const periodTitles: Record<string, string> = { week: "本周", month: "本月", term: "本学期" };
function dateText(value?: string, exclusive = false) {
  if (!value) return "";
  const date = new Date(new Date(value).getTime() - (exclusive ? 1 : 0));
  if (Number.isNaN(date.getTime())) return "";
  // Safari and Node can use different locale separators; render stable numeric parts.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "numeric",
    day: "numeric"
  }).formatToParts(date);
  const values = new Map(parts.map(part => [part.type, part.value]));
  return `${values.get("year")}/${Number(values.get("month"))}/${Number(values.get("day"))}`;
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
export function LearningReportView({ report }: { report: LearningReportData; forImage?: boolean }) {
  const { content } = report;
  const details = content.reportDetails;
  const classroomPhotos = reportClassroomPhotos(content);
  const photoCount = classroomPhotos.filter(Boolean).length;
  const sections = new Map<string, LearningContent[]>();
  for (const item of content.learningContents ?? []) {
    const items = sections.get(item.section) ?? [];
    items.push(item);
    sections.set(item.section, items);
  }
  const isV2 = content.reportVersion === "v2";
  const showTeacherMessage = !isV2 || Boolean(content.summary.trim());
  const focusEntries = isV2 ? content.areasToImprove.filter(entry => entry.text.trim()) : content.areasToImprove;
  const showNextFocus = !isV2 || focusEntries.length > 0;
  const teacherMessage = (
    <section className="min-w-0 rounded-2xl bg-slate-50/80 p-3 sm:p-6">
      <h2 className="mb-4 text-lg font-bold">老师想对你说</h2>
      <p className="whitespace-pre-wrap break-words leading-8 text-slate-700">{content.summary}</p>
    </section>
  );
  // v2 places photo evidence in the white body; legacy reports keep their original header layout.
  const classroomPhotoSection = photoCount > 0 && (
    <section aria-label="课堂照片" className={isV2 ? "min-w-0" : "mt-5"}>
      <div className={`grid w-full gap-3 ${photoCount > 1 ? "max-w-xl grid-cols-2" : "max-w-sm grid-cols-1"}`}>
        {classroomPhotos.map(
          (photo, index) =>
            photo && (
              <figure
                key={index}
                className={`min-w-0 rounded-2xl p-1 ${isV2 ? "border border-slate-100 bg-slate-50" : "bg-white/10"}`}
              >
                <img
                  src={photo}
                  alt={index === 0 ? `${report.studentName}的课堂照片` : `${report.studentName}的第二张课堂照片`}
                  className="max-h-64 w-full rounded-xl object-contain"
                />
                {content.classroomPhotoCaptions?.[index]?.trim() && (
                  <figcaption
                    className={`px-2 py-2 text-center text-sm [overflow-wrap:anywhere] ${isV2 ? "text-slate-600" : "text-indigo-100"}`}
                  >
                    {content.classroomPhotoCaptions[index]}
                  </figcaption>
                )}
              </figure>
            )
        )}
      </div>
    </section>
  );
  return (
    <article className="mx-auto w-full min-w-0 max-w-4xl [overflow-wrap:anywhere] overflow-hidden rounded-3xl bg-white text-slate-900 shadow-xl shadow-violet-900/5">
      <header className="flex items-center justify-between gap-5 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 px-4 py-7 text-white sm:px-10 sm:py-12">
        <div className="min-w-0 flex-1">
          <p className="mb-4 text-sm font-semibold text-indigo-100">{details?.institutionName || "课堂成长记录"}</p>
          <h1 className="text-2xl font-bold leading-snug sm:text-4xl">
            {report.studentName} ·{" "}
            {details?.lessonNumber ? `第${details.lessonNumber}次课` : (periodNames[report.period] ?? "成长报告")}
          </h1>
          <p className="mt-3 text-sm text-indigo-100 sm:text-base">
            {details?.lessonDate
              ? dateText(`${details.lessonDate}T00:00:00+08:00`)
              : [dateText(report.start), dateText(report.end, true)].filter(Boolean).join(" — ")}{" "}
            · {report.className}
            {/* {details?.courseTheme || report.subject} */}
          </p>
          {/* <p className="mt-2 break-words text-sm text-indigo-100">{report.className}</p> */}
          {!isV2 && classroomPhotoSection}
        </div>
        {isV2 && content.studentPhoto && (
          <img
            src={content.studentPhoto}
            alt={`${report.studentName}的头像`}
            className="h-18 w-18 shrink-0 rounded-full border-4 border-white/80 object-cover shadow-lg sm:h-32 sm:w-32"
          />
        )}
      </header>
      <div className="space-y-4 p-3 sm:space-y-8 sm:p-9">
        {isV2 && classroomPhotoSection}
        {content.reportVersion !== "v2" && (
          <section className="rounded-2xl bg-slate-50/80 p-3 sm:p-6">
            <h2 className="mb-5 flex items-center gap-2 text-lg font-bold">
              <BookOpenText className="h-5 w-5 text-indigo-600" />
              {periodTitles[report.period]}学习内容
              {!content.learningContents?.length || content.learningContents.some(showsLearningMastery) ? "与掌握" : ""}
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
                        {showsLearningMastery(item) && (
                          <span
                            className={`mt-1 shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${masteryColors[item.mastery] ?? masteryColors.unassessed}`}
                          >
                            {masteryLabels[item.mastery] ?? "待评价"}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {!sections.size && <p className="text-sm text-slate-500">暂未整理逐项学习内容，请由老师补充。</p>}
            </div>
          </section>
        )}
        {content.reportVersion === "v2" && (
          <>
            {/* Classroom photos enable this section; a student portrait alone must not reveal evaluations. */}
            {photoCount > 0 && (
              <section className="rounded-2xl border border-sky-100 bg-white p-3 sm:p-6">
                <h2 className="mb-4 text-lg font-bold text-sky-900">课堂表现</h2>
                <div aria-label="分学科学习表现" className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  {(content.reportSubjects ?? []).map(subject => (
                    <section
                      key={subject.subjectId}
                      aria-label={`${subject.name}的课堂表现`}
                      className="min-w-0 border-b border-slate-100 py-4"
                    >
                      <h3 className="text-base font-bold text-slate-900">{subject.name}</h3>
                      {(content.classroomPerformance ?? [])
                        .filter(item => item.subjectId === subject.subjectId)
                        .map((item, index) => {
                          const separator = item.text.indexOf(" · ");
                          return (
                            <p
                              key={index}
                              className="mb-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600"
                            >
                              {separator >= 0 ? (
                                <>
                                  <span className="mr-2 font-semibold text-teal-700">
                                    {item.text.slice(0, separator)}：
                                  </span>
                                  {item.text.slice(separator + 3)}
                                </>
                              ) : (
                                item.text
                              )}
                            </p>
                          );
                        })}
                      {!content.classroomPerformance?.some(item => item.subjectId === subject.subjectId) && (
                        <p className="text-sm text-slate-500">老师暂未填写具体课堂表现。</p>
                      )}
                    </section>
                  ))}
                </div>
                {content.classroomPerformance?.some(item => !item.subjectId) && (
                  <section className="mt-4 border-t border-slate-100 pt-4">
                    <h3 className="mb-3 font-bold">未分学科的原课堂表现</h3>
                    <Entries
                      entries={content.classroomPerformance.filter(item => !item.subjectId)}
                      empty="老师暂未填写具体课堂表现。"
                    />
                  </section>
                )}
                {!content.reportSubjects?.length && !content.classroomPerformance?.length && (
                  <p className="text-sm text-slate-500">老师暂未填写具体课堂表现。</p>
                )}
              </section>
            )}
            <GrowthAssessmentView
              value={content.growthAssessment}
              periodTitle={periodTitles[report.period] ?? "本期"}
            />
          </>
        )}
        {content.reportVersion !== "v2" && (
          <section className="rounded-2xl bg-slate-50/80 p-3 sm:p-6">
            {content.reportVersion !== "v2" && (
              <h2 className="mb-4 text-lg font-bold">{periodTitles[report.period]}的课堂表现</h2>
            )}
            {content.classroomPerformance?.length ? (
              <div className="flex flex-wrap gap-2">
                {content.classroomPerformance
                  .filter(item => content.reportVersion !== "v2" || !item.subjectId)
                  .map((item, index) => (
                    <span key={index} className="rounded-full bg-violet-50 px-4 py-2 text-sm text-violet-800">
                      {item.text}
                    </span>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">老师暂未填写具体课堂表现。</p>
            )}
          </section>
        )}
        <div
          aria-label={content.reportVersion === "v2" ? "宠物伙伴与阶段积分" : undefined}
          className={content.reportVersion === "v2" ? "grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4" : undefined}
        >
          <section className="flex min-w-0 flex-col rounded-2xl bg-slate-50/80 p-3 sm:p-6">
            <h2 className="mb-4 text-lg font-bold">
              {content.reportVersion === "v2" ? `${report.studentName}的宠物伙伴` : "我的宠物伙伴"}
            </h2>
            <div className="my-auto flex flex-1 flex-col items-center justify-center">
              {content.petHistoryStatus === "unavailable" ? (
                <p className="text-sm text-slate-500">所选周期结束时的宠物形态尚无历史记录。</p>
              ) : content.reportVersion !== "v2" && content.pet === undefined ? (
                <p className="text-sm text-slate-500">此报告未保存宠物形态，可由老师重新生成报告。</p>
              ) : (
                <ReportPetView pet={content.pet} />
              )}
            </div>
            {content.petAsOf ? (
              <p className="mt-3 text-center text-xs text-slate-500">形态记录截至 {dateText(content.petAsOf)}</p>
            ) : (
              content.pet && (
                <p className="mt-3 text-center text-xs text-slate-500">生成时保存的形态，尚无周期结束时的历史记录。</p>
              )
            )}
          </section>
          {content.reportVersion === "v2" && (
            <section className="flex min-w-0 flex-col rounded-2xl border border-amber-100 bg-amber-50/70 p-3 sm:p-6">
              <h2 className="mb-4 text-lg font-bold text-amber-900">{periodTitles[report.period]}最值肯定</h2>
              <div className="my-auto flex flex-1 flex-col justify-center">
                <PeriodScoreChart details={content.scoreDetails} />
              </div>
              <p className="mt-3 text-xs text-slate-500">
                {report.start && report.end
                  ? `${dateText(report.start)} — ${dateText(report.end, true)}`
                  : "报告所选时间范围"}
                ；综合课堂积分，不代表学科知识掌握程度。
              </p>
            </section>
          )}
        </div>
        {content.reportVersion !== "v2" && teacherMessage}
        {(!isV2 || showTeacherMessage || showNextFocus) && (
          <div
            aria-label={content.reportVersion === "v2" ? "老师寄语与下一步重点" : undefined}
            className={
              isV2
                ? `grid grid-cols-1 ${showTeacherMessage && showNextFocus ? "sm:grid-cols-2" : ""} gap-3 sm:gap-4`
                : "grid gap-4 sm:grid-cols-2"
            }
          >
            {isV2 && showTeacherMessage && teacherMessage}
            {content.reportVersion !== "v2" && (
              <section className="rounded-2xl border border-amber-100 bg-amber-50/70 p-3 sm:p-5">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-800">
                  <Sparkles className="h-4 w-4" />
                  {periodTitles[report.period]}最值得肯定
                </h2>
                <Entries entries={content.strengths} empty="等待老师补充值得肯定的具体表现。" />
              </section>
            )}
            {showNextFocus && (
              <section className="min-w-0 rounded-2xl border border-violet-100 bg-violet-50/70 p-3 sm:p-5">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-violet-800">
                  <Target className="h-4 w-4" />
                  下一步重点
                </h2>
                <Entries entries={focusEntries} empty="等待老师补充下一阶段的练习重点。" />
              </section>
            )}
          </div>
        )}
        {content.reportVersion !== "v2" && (
          <section className="rounded-2xl bg-slate-50/80 p-3 sm:p-6">
            <h2 className="mb-4 text-lg font-bold">回家可以这样练</h2>
            <div className="text-slate-700">
              <Entries entries={content.homeSuggestions} empty="老师暂未安排家庭练习。" />
            </div>
          </section>
        )}
      </div>
      <footer className="flex items-center justify-center gap-2 border-t border-slate-100 px-5 py-5 text-xs text-slate-400">
        <Heart className="h-4 w-4 text-rose-400" />
        由老师整理，与孩子一起回顾成长
      </footer>
    </article>
  );
}
