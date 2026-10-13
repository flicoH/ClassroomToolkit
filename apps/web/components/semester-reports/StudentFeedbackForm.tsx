"use client";

import type { ReactNode } from "react";
import { GrowthAssessmentFields, type GrowthAssessment } from "./GrowthAssessmentFields";
import { ClassroomPerformanceFields, type PerformanceRating } from "./ClassroomPerformanceFields";
import { showsLearningMastery, masteryLabels, type LearningContent } from "./LearningReportView";

export type StudentReportFeedback = {
  learningMastery: Record<string, LearningContent["mastery"]>;
  classroomPerformance: PerformanceRating[];
  teacherMessage: string;
  highlight: string;
  nextFocus: string;
  homePractice: string;
  growthAssessment?: GrowthAssessment;
};
export function emptyStudentFeedback(): StudentReportFeedback {
  return {
    learningMastery: {},
    classroomPerformance: [],
    teacherMessage: "",
    highlight: "",
    nextFocus: "",
    homePractice: ""
  };
}

export function StudentFeedbackForm({
  student,
  subject,
  learningContents,
  value,
  onChange,
  subjects,
  companion,
  reserveNextFocus = false
}: {
  subjects?: import("./performance-config").PerformanceSubject[];
  reserveNextFocus?: boolean;
  companion?: ReactNode;
  student: { id: string; name: string; className: string };
  subject: string;
  learningContents: Array<Omit<LearningContent, "mastery">>;
  value: StudentReportFeedback;
  onChange: (patch: Partial<StudentReportFeedback>) => void;
}) {
  const teacherMessage = (
    <label className="block min-w-0 space-y-2 text-sm font-semibold">
      老师想对你说
      <textarea
        className="min-h-28 w-full rounded-md border bg-background p-3 text-sm font-normal"
        maxLength={2500}
        value={value.teacherMessage}
        placeholder={
          subjects !== undefined
            ? "填写实际观察与鼓励话语；留空时报告不显示此区域。"
            : "填写实际观察与鼓励话语；留空时由生成方式整理草稿。"
        }
        onChange={event => onChange({ teacherMessage: event.target.value })}
      />
    </label>
  );
  return (
    <div
      aria-label={`${student.name}的报告反馈`}
      className="min-w-0 space-y-5 rounded-2xl border bg-background p-3 sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">{student.name}的课堂反馈</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {student.className} · {subject} · 仅保存到这位学生的报告
          </p>
        </div>
      </div>
      {subjects === undefined && (
        <section className="space-y-3">
          <h4 className="font-semibold">
            本期学习内容{!learningContents.length || learningContents.some(showsLearningMastery) ? "与掌握" : ""}
          </h4>
          <p className="text-xs text-muted-foreground">
            {learningContents.some(showsLearningMastery)
              ? "PDF 学习内容请按实际表现逐项评价；手填内容按教学记录展示。"
              : "手填内容按教学记录展示。"}
          </p>
          <div className="space-y-2 md:max-h-96 md:overflow-y-auto">
            {learningContents.map((item, index) => (
              <div key={item.id} className="rounded-xl border bg-slate-50/50 p-3">
                <div className="mb-2 flex flex-col items-start gap-2 md:flex-row md:flex-wrap md:items-center md:justify-between">
                  <span className="min-w-0 break-words text-xs font-semibold text-indigo-600">{item.section}</span>
                  {showsLearningMastery(item) && (
                    <select
                      aria-label={`${student.name} 学习内容 ${index + 1} 掌握情况`}
                      className="h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm md:w-auto"
                      value={value.learningMastery[item.id] ?? "unassessed"}
                      onChange={event =>
                        onChange({
                          learningMastery: {
                            ...value.learningMastery,
                            [item.id]: event.target.value as LearningContent["mastery"]
                          }
                        })
                      }
                    >
                      {Object.entries(masteryLabels).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">
                  {item.text}
                </p>
              </div>
            ))}
          </div>
          {!learningContents.length && (
            <p className="text-sm text-muted-foreground">请先选择授课范围，等待学习内容加载。</p>
          )}
        </section>
      )}
      {subjects !== undefined && (
        <GrowthAssessmentFields
          studentName={student.name}
          value={value.growthAssessment}
          onChange={growthAssessment => onChange({ growthAssessment })}
        />
      )}
      <ClassroomPerformanceFields
        subjects={subjects}
        subject={subject}
        value={value.classroomPerformance}
        onChange={classroomPerformance => onChange({ classroomPerformance })}
      />
      {companion}
      {subjects === undefined && teacherMessage}
      <div
        aria-label={subjects !== undefined ? "老师寄语与下一步重点" : undefined}
        className={
          subjects !== undefined ? "grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4" : "grid gap-3 sm:grid-cols-2"
        }
      >
        {subjects !== undefined ? (
          teacherMessage
        ) : (
          <label className="space-y-2 text-sm font-semibold">
            本期最值得肯定
            <textarea
              className="min-h-24 w-full rounded-md border bg-amber-50/40 p-3 text-sm font-normal"
              maxLength={800}
              value={value.highlight}
              placeholder="例如：提醒后能主动调整状态并参与活动"
              onChange={event => onChange({ highlight: event.target.value })}
            />
          </label>
        )}
        <label className="min-w-0 space-y-2 text-sm font-semibold">
          下一步重点
          <textarea
            className="min-h-24 w-full rounded-md border bg-violet-50/40 p-3 text-sm font-normal"
            maxLength={800}
            value={value.nextFocus}
            placeholder="例如：加强听说读能力"
            onChange={event => onChange({ nextFocus: event.target.value })}
          />
          {reserveNextFocus && (
            <p className="text-xs font-normal text-muted-foreground">留空时报告不显示下一步重点。</p>
          )}
        </label>
      </div>
      {subjects === undefined && (
        <label className="block space-y-2 text-sm font-semibold">
          回家可以这样练
          <textarea
            className="min-h-28 w-full rounded-md border bg-background p-3 text-sm font-normal"
            maxLength={800}
            value={value.homePractice}
            placeholder="填写练习内容、方法和建议时长，例如每天 5—10 分钟跟读与亲子问答。"
            onChange={event => onChange({ homePractice: event.target.value })}
          />
        </label>
      )}
    </div>
  );
}
