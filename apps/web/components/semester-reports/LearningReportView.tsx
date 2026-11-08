import { attendanceLabels, type CourseAttendanceStatus } from "./CourseAttendance";
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
/** 可编辑正文与服务端快照派生的展示数据；头像、照片和积分不应由普通正文编辑伪造。 */
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
  courseContent?: string;
  courseScope?: string | null;
  nextWeekContent?: string | null;
  attendance?: CourseAttendanceStatus;
  attendances?: CourseAttendanceStatus[];
  strengths: ReportEntry[];
  areasToImprove: ReportEntry[];
  homeSuggestions: ReportEntry[];
  limitations: string[];
  learningContents?: LearningContent[];
  classroomPerformance?: ReportEntry[];
  scoreDetails?: ScoreDetails;
  stageTitle?: string;
  stageCustomName?: string;
  reportDetails?: {
    institutionName: string;
    courseTheme: string;
    lessonNumber: number | null;
    lessonDate: string | null;
  };
};
export type LearningReportData = {
  id?: string;
  studentName: string;
  className: string;
  subject: string;
  term: string;
  period: string;
  isStageReport?: boolean;
  isSubjectReport?: boolean;
  status?: string;
  stageCustomName?: string;
  start?: string;
  end?: string;
  courseScope?: string | null;
  content: LearningReportContent;
};

/** 两个照片位置保持固定：第一张删除后不把第二张前移；仅旧单图报告回退到第一个位置。 */
export function reportClassroomPhotos(content: Pick<LearningReportContent, "classroomPhoto" | "classroomPhotos">) {
  return content.classroomPhotos
    ? [content.classroomPhotos[0] ?? null, content.classroomPhotos[1] ?? null]
    : [content.classroomPhoto ?? null, null];
}

/** 手填内容的稳定 ID 会保留到家长页，因此不依赖已被翻译成中文的引用来判断来源。 */
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
const periodNames: Record<string, string> = {
  week: "每周成长报告",
  month: "每月成长报告",
  term: "学期成长报告",
  stage: "阶段成长报告"
};
const periodTitles: Record<string, string> = { week: "本周", month: "本月", term: "本学期", stage: "本阶段" };
function dateText(value?: string, exclusive = false) {
  if (!value) return "";
  const date = new Date(new Date(value).getTime() - (exclusive ? 1 : 0));
  if (Number.isNaN(date.getTime())) return "";
  // 服务端和不同浏览器的日期分隔符可能不同，显式拼接上海时区的数字，避免水合内容不一致。
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

/** 兼容已保存的手填标题；仅隐藏来源后缀，不改写报告内容或引用。 */
export function learningSectionTitle(section: string) {
  return section.replace(/\s*·\s*教师填写\s*$/u, "");
}

/** 教师预览、家长页和完整图片导出共用此视图，确保照片位置、空区块隐藏和版本兼容一致。 */
export function LearningReportView({ report }: { report: LearningReportData; forImage?: boolean }) {
  const { content } = report;
  const details = content.reportDetails;
  const isSubjectReport = Boolean(report.isSubjectReport || (report as { subjectReport?: boolean }).subjectReport);
  const classroomPhotos = reportClassroomPhotos(content);
  const photoCount = classroomPhotos.filter(Boolean).length;
  const sections = new Map<string, LearningContent[]>();
  for (const item of content.learningContents ?? []) {
    const section = learningSectionTitle(item.section);
    const items = sections.get(section) ?? [];
    items.push(item);
    sections.set(section, items);
  }
  const isV2 = content.reportVersion === "v2";
  const validPerformanceEntries = (content.classroomPerformance ?? []).filter(item => item.text.trim());
  const classroomPerformanceSubjects = (content.reportSubjects ?? []).filter(subject =>
    validPerformanceEntries.some(item => item.subjectId === subject.subjectId)
  );
  const unassignedPerformanceEntries = validPerformanceEntries.filter(item => !item.subjectId);
  const showClassroomPerformance = photoCount > 0 || validPerformanceEntries.length > 0;
  const showTeacherMessage = !isV2 || Boolean(content.summary.trim());
  const focusEntries = isV2 ? content.areasToImprove.filter(entry => entry.text.trim()) : content.areasToImprove;
  const showNextFocus = !isV2 || focusEntries.length > 0;
  const customStageTitle =
    content.stageTitle?.trim() || content.stageCustomName?.trim() || report.stageCustomName?.trim();
  const isStage =
    report.period === "stage" ||
    report.isStageReport ||
    Boolean(report.stageCustomName) ||
    Boolean(content.stageTitle) ||
    Boolean(content.stageCustomName);
  const periodTitle =
    isStage && customStageTitle ? customStageTitle : isStage ? "本阶段" : (periodTitles[report.period] ?? "本期");
  const teacherMessage = (
    <section className="min-w-0 rounded-2xl bg-slate-50/80 p-3 sm:p-6">
      <h2 className="mb-4 text-lg font-bold">老师想对你说</h2>
      <p className="whitespace-pre-wrap break-words leading-8 text-slate-700">{content.summary}</p>
    </section>
  );
  // v2 课堂照片位于白色正文首部，说明使用深色文字；原版仍沿用标题区，避免旧报告布局回退。
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
          {!isSubjectReport && (
            <p className="mb-4 text-sm font-semibold text-indigo-100">{details?.institutionName || "课堂成长记录"}</p>
          )}
          <h1 className="text-2xl font-bold leading-snug sm:text-4xl">
            {report.studentName} ·{" "}
            {isSubjectReport
              ? details?.institutionName || "课堂成长记录"
              : details?.lessonNumber
                ? `第${details.lessonNumber}次课`
                : isStage && customStageTitle
                  ? customStageTitle.endsWith("报告")
                    ? customStageTitle
                    : `${customStageTitle}成长报告`
                  : isStage
                    ? "阶段成长报告"
                    : (periodNames[report.period] ?? "成长报告")}
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
        {/* 课次前缀沿用已有正文格式，无前缀的历史内容归入第一课。 */}
        {(() => {
          const effectiveCourseScope =
            content.courseScope?.trim() ||
            (report.courseScope && report.courseScope !== "教学内容" && report.courseScope !== content.courseContent
              ? report.courseScope.trim()
              : "");
          const nextWeekContent = content.nextWeekContent?.trim();
          const hasCourseContent = Boolean(
            content.attendance ||
            content.attendances?.length ||
            content.courseContent?.trim() ||
            effectiveCourseScope ||
            nextWeekContent
          );
          if (!hasCourseContent) return null;

          const groups = new Map<number, string[]>();
          for (const line of (content.courseContent ?? "").split("\n")) {
            if (!line.trim()) continue;
            const match = /^第\s*(\d+)\s*节课\s*[·：:]?\s*/.exec(line);
            const lesson = match ? Number(match[1]) : 1;
            const lines = groups.get(lesson) ?? [];
            lines.push(match ? line.slice(match[0].length) : line);
            groups.set(lesson, lines);
          }
          const count = Math.max(content.attendances?.length ?? (content.attendance ? 1 : 0), ...groups.keys());
          return (
            <section className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3 sm:p-6">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <BookOpenText className="h-5 w-5 text-indigo-600" />
                课程内容
              </h2>
              {effectiveCourseScope && (
                <div
                  aria-label="授课范围备注"
                  className="rounded-xl border border-indigo-100 bg-white p-3 sm:p-4 text-xs sm:text-sm text-slate-700"
                >
                  <span className="font-semibold text-indigo-950">授课范围备注：</span>
                  <span className="whitespace-pre-wrap">{effectiveCourseScope}</span>
                </div>
              )}
              {Array.from({ length: count }, (_, index) => {
                // 兼容旧报告的单一出勤值，后续课次也显示出勤徽章。
                const status = content.attendances?.[index] ?? content.attendance ?? content.attendances?.[0];
                return (
                  <section
                    key={index}
                    aria-label={`第 ${index + 1} 节课内容与出勤`}
                    className="space-y-2 rounded-xl border border-slate-100 bg-white p-3 sm:p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold text-indigo-950">第 {index + 1} 节课：</h3>
                      {status && (
                        <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-800">
                          课程出勤情况 · {attendanceLabels[status] ?? status}
                        </span>
                      )}
                    </div>
                    {groups.get(index + 1)?.length ? (
                      <p className="whitespace-pre-wrap break-words leading-7 text-slate-700">
                        {groups.get(index + 1)!.join("\n")}
                      </p>
                    ) : null}
                  </section>
                );
              })}
              {nextWeekContent && (
                <div aria-label="下周教学内容重点" className="rounded-xl border border-indigo-100 bg-white p-3 sm:p-4">
                  <h3 className="mb-1 text-sm font-semibold text-indigo-950">
                    {report.period === "month"
                      ? "下月教学内容重点"
                      : report.period === "term"
                        ? "下学期教学内容重点"
                        : "下周教学内容重点"}
                  </h3>
                  <p className="whitespace-pre-wrap break-words text-xs sm:text-sm leading-6 text-slate-700">
                    {nextWeekContent}
                  </p>
                </div>
              )}
            </section>
          );
        })()}
        {content.reportVersion !== "v2" && (
          <section className="rounded-2xl bg-slate-50/80 p-3 sm:p-6">
            <h2 className="mb-5 flex items-center gap-2 text-lg font-bold">
              <BookOpenText className="h-5 w-5 text-indigo-600" />
              {periodTitle}学习内容
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
            {/* 已填写的学科评价不能因缺少照片而隐藏；无照片且无评价时继续省略空区块；选了课程但未选择对应课堂表现时该课程不做显示。 */}
            {showClassroomPerformance && (
              <section className="rounded-2xl border border-sky-100 bg-white p-3 sm:p-6">
                <h2 className="mb-4 text-lg font-bold text-sky-900">课堂表现</h2>
                {classroomPerformanceSubjects.length > 0 && (
                  <div
                    aria-label="分学科学习表现"
                    className={`grid gap-x-6 gap-y-3 ${content.courseContent !== undefined || content.attendance || (content.attendances && content.attendances.length > 0) ? "grid-cols-1" : "sm:grid-cols-2"}`}
                  >
                    {classroomPerformanceSubjects.map(subject => {
                      const subjectEntries = validPerformanceEntries.filter(
                        item => item.subjectId === subject.subjectId
                      );
                      return (
                        <section
                          key={subject.subjectId}
                          aria-label={`${subject.name}的课堂表现`}
                          className="min-w-0 border-b border-slate-100 py-4"
                        >
                          <h3 className="text-base font-bold text-slate-900">{subject.name}</h3>
                          {subjectEntries.map((item, index) => {
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
                        </section>
                      );
                    })}
                  </div>
                )}
                {unassignedPerformanceEntries.length > 0 && (
                  <section className="mt-4 border-t border-slate-100 pt-4">
                    <h3 className="mb-3 font-bold">未分学科的原课堂表现</h3>
                    <Entries entries={unassignedPerformanceEntries} empty="老师暂未填写具体课堂表现。" />
                  </section>
                )}
              </section>
            )}
            {Boolean(Object.values(content.growthAssessment ?? {}).some(value => value?.trim())) && (
              <GrowthAssessmentView value={content.growthAssessment} periodTitle={periodTitle} />
            )}
          </>
        )}
        {content.reportVersion !== "v2" && (
          <section className="rounded-2xl bg-slate-50/80 p-3 sm:p-6">
            {content.reportVersion !== "v2" && <h2 className="mb-4 text-lg font-bold">{periodTitle}的课堂表现</h2>}
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
              <h2 className="mb-4 text-lg font-bold text-amber-900">{periodTitle}最值肯定</h2>
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
                  {periodTitle}最值得肯定
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
