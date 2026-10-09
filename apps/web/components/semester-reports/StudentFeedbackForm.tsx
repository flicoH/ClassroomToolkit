"use client";

import { Input } from "@/components/ui/input";
import { masteryLabels, type LearningContent } from "./LearningReportView";

export type StudentReportFeedback = {
  learningMastery: Record<string, LearningContent["mastery"]>;
  classroomPerformance: Array<{ label: string; value: string }>;
  teacherMessage: string;
  highlight: string;
  nextFocus: string;
  homePractice: string;
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
export function StudentFeedbackForm({
  student,
  subject,
  learningContents,
  value,
  onChange
}: {
  student: { id: string; name: string; className: string };
  subject: string;
  learningContents: Array<Omit<LearningContent, "mastery">>;
  value: StudentReportFeedback;
  onChange: (patch: Partial<StudentReportFeedback>) => void;
}) {
  return (
    <div className="min-w-0 space-y-5 rounded-2xl border bg-background p-3 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">{student.name}的课堂反馈</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {student.className} · {subject} · 仅保存到这位学生的报告
          </p>
        </div>
      </div>
      <section className="space-y-3">
        <h4 className="font-semibold">本期学习内容与掌握</h4>
        <p className="text-xs text-muted-foreground">选择单元或课时后列出对应内容，请按实际表现逐项评价。</p>
        <div className="space-y-2 md:max-h-96 md:overflow-y-auto">
          {learningContents.map((item, index) => (
            <div key={item.id} className="rounded-xl border bg-slate-50/50 p-3">
              <div className="mb-2 flex flex-col items-start gap-2 md:flex-row md:flex-wrap md:items-center md:justify-between">
                <span className="min-w-0 break-words text-xs font-semibold text-indigo-600">{item.section}</span>
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
              </div>
              <p className="whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{item.text}</p>
            </div>
          ))}
        </div>
        {!learningContents.length && (
          <p className="text-sm text-muted-foreground">请先选择授课范围，等待学习内容加载。</p>
        )}
      </section>
      <section className="space-y-3">
        <h4 className="font-semibold">本期的课堂表现</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          {performances.map(([original, options], index) => {
            const label = original === "英语开口" && !subject.includes("英") ? "学科表达" : original;
            const listId = `report-feedback-${student.id}-${index}`;
            return (
              <label key={label} className="space-y-1 text-sm">
                {label}
                <Input
                  list={listId}
                  maxLength={100}
                  placeholder="选择或填写实际表现"
                  value={value.classroomPerformance.find(item => item.label === label)?.value ?? ""}
                  onChange={event =>
                    onChange({
                      classroomPerformance: [
                        ...value.classroomPerformance.filter(item => item.label !== label),
                        ...(event.target.value ? [{ label, value: event.target.value }] : [])
                      ]
                    })
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
      <label className="block space-y-2 text-sm font-semibold">
        老师想对你说
        <textarea
          className="min-h-28 w-full rounded-md border bg-background p-3 text-sm font-normal"
          maxLength={2500}
          value={value.teacherMessage}
          placeholder="填写实际观察与鼓励话语；留空时由生成方式整理草稿。"
          onChange={event => onChange({ teacherMessage: event.target.value })}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
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
        <label className="space-y-2 text-sm font-semibold">
          下一步重点
          <textarea
            className="min-h-24 w-full rounded-md border bg-violet-50/40 p-3 text-sm font-normal"
            maxLength={800}
            value={value.nextFocus}
            placeholder="例如：加强听说读能力"
            onChange={event => onChange({ nextFocus: event.target.value })}
          />
        </label>
      </div>
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
    </div>
  );
}
