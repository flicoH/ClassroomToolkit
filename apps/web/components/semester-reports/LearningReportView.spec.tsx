import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LearningReportView, type LearningReportData } from "./LearningReportView";
const report: LearningReportData = {
  studentName: "小明",
  className: "一班",
  subject: "全部课程",
  term: "秋季",
  period: "term",
  content: {
    summary: "继续加油",
    courseOverview: "全部课程",
    strengths: [],
    areasToImprove: [],
    homeSuggestions: [],
    limitations: [],
    scoreDetails: { positive: 5, negative: -2, net: 3, count: 2, records: [] }
  }
};
describe("report pet presentation", () => {
  it.each(["v1", "v2"] as const)("shows the historic cutoff and missing-history state for %s", version => {
    const base = {
      ...report.content,
      ...(version === "v2" ? { reportVersion: "v2" as const } : {}),
      petAsOf: "2026-10-09T15:59:59.999Z"
    };
    const html = renderToStaticMarkup(
      <LearningReportView
        report={{
          ...report,
          content: {
            ...base,
            petHistoryStatus: "recorded",
            pet: { petId: "sprout-puff", petName: "团团", level: 4, stage: "第4形态", petHatched: true }
          }
        }}
      />
    );
    expect(html).toContain("形态记录截至 2026/10/9");
    const missing = renderToStaticMarkup(
      <LearningReportView report={{ ...report, content: { ...base, pet: null, petHistoryStatus: "unavailable" } }} />
    );
    expect(missing).toContain("所选周期结束时的宠物形态尚无历史记录");
    expect(missing).not.toContain("暂未领养宠物");
    expect(missing).not.toContain("/pets/");
  });
  it("shows the original report pet snapshot instead of point details in preview and export", () => {
    for (const forImage of [false, true]) {
      const html = renderToStaticMarkup(
        <LearningReportView
          forImage={forImage}
          report={{
            ...report,
            content: {
              ...report.content,
              pet: { petId: "sprout-puff", petName: "团团", level: 4, stage: "第4形态", petHatched: true }
            }
          }}
        />
      );
      expect(html).toContain("我的宠物伙伴");
      expect(html).toContain("团团");
      expect(html).toContain("/pets/starling/sprout-puff-2.png");
      expect(html).not.toContain("积分加减情况");
      expect(html).toContain("本学期的课堂表现");
    }
  });
  it("does not invent a pet for older original reports without a saved snapshot", () => {
    const html = renderToStaticMarkup(<LearningReportView report={report} />);
    expect(html).toContain("此报告未保存宠物形态");
    expect(html).not.toContain("积分加减情况");
    expect(html).not.toContain("/pets/");
  });
  it("handles unadopted and unhatched pets in original reports", () => {
    const pet = { petId: null, petName: null, level: 1, stage: "初始形态", petHatched: false };
    const empty = renderToStaticMarkup(
      <LearningReportView report={{ ...report, content: { ...report.content, pet } }} />
    );
    expect(empty).toContain("暂未领养宠物");
    const egg = renderToStaticMarkup(
      <LearningReportView
        report={{ ...report, content: { ...report.content, pet: { ...pet, petId: "sprout-puff" } } }}
      />
    );
    expect(egg).toContain("/pets/stone-monkey.png");
    expect(egg).not.toContain("积分加减情况");
  });
  it.each(["v1", "v2"] as const)("shows one classroom photo in the header for %s preview and export", version => {
    for (const forImage of [false, true]) {
      const html = renderToStaticMarkup(
        <LearningReportView
          forImage={forImage}
          report={{
            ...report,
            content: {
              ...report.content,
              ...(version === "v2" ? { reportVersion: "v2" as const } : {}),
              classroomPhoto: "data:image/png;base64,example",
              classroomPerformance: [{ text: "主动参与", sourceRefs: ["teacher-input"] }],
              pet: { petId: "sprout-puff", petName: "团团", level: 4, stage: "第4形态", petHatched: true }
            }
          }}
        />
      );
      expect(html).toContain("/pets/starling/sprout-puff-2.png");
      expect(html).toContain("团团");
      expect(html).toContain("生成时保存的形态，尚无周期结束时的历史记录");
      expect(html).toContain("小明的课堂照片");
      const rendered = document.createElement("div");
      rendered.innerHTML = html;
      const photo = rendered.querySelector('img[alt="小明的课堂照片"]')!;
      expect(photo.closest("header")).toBe(rendered.querySelector("header"));
      expect(rendered.querySelector("header")!.textContent).toContain("一班");
      expect(rendered.querySelectorAll('img[alt="小明的课堂照片"]')).toHaveLength(1);
      expect(html).not.toContain("课堂精彩瞬间");
      if (version === "v2") expect(html).not.toContain("本学期的课堂表现");
      expect(html).toContain("主动参与");
      if (version === "v2") expect(html).toContain("预留位置");
      expect(html).not.toContain("积分加减情况");
    }
  });
  it("handles missing pets, eggs and a teacher-entered next focus", () => {
    const content = {
      ...report.content,
      reportVersion: "v2" as const,
      areasToImprove: [{ text: "练习表达", sourceRefs: ["teacher-input"] }]
    };
    const html = renderToStaticMarkup(<LearningReportView report={{ ...report, content }} />);
    expect(html).toContain("暂未领养宠物");
    expect(html).not.toContain("暂未上传课堂照片");
    expect(html).not.toContain("本学期的课堂表现");
    expect(html).toContain("练习表达");
    expect(html).not.toContain("预留位置");
    const egg = renderToStaticMarkup(
      <LearningReportView
        report={{
          ...report,
          content: {
            ...content,
            pet: { petId: "sprout-puff", petName: null, level: 1, stage: "初始形态", petHatched: false }
          }
        }}
      />
    );
    expect(egg).toContain("/pets/stone-monkey.png");
    expect(egg).not.toContain("/pets/starling/");
  });
});

it("shows separate v2 classroom performance for every subject without copying legacy ratings", () => {
  const content = {
    ...report.content,
    reportVersion: "v2" as const,
    reportSubjects: [
      { subjectId: "english", name: "英语" },
      { subjectId: "math", name: "数学" }
    ],
    classroomPerformance: [
      { subjectId: "english", text: "课堂参与 · 主动参与", sourceRefs: ["teacher-input"] },
      { text: "课堂任务 · 基本完成", sourceRefs: ["teacher-input"] }
    ]
  };
  const rendered = document.createElement("div");
  rendered.innerHTML = renderToStaticMarkup(<LearningReportView report={{ ...report, content }} />);
  const heading = [...rendered.querySelectorAll("h3")].find(item => item.textContent === "数学的课堂表现");
  expect(heading).toBeDefined();
  expect(heading!.parentElement!.textContent).toContain("老师暂未填写");
  expect(heading!.parentElement!.textContent).not.toContain("主动参与");
  expect(heading!.parentElement!.textContent).not.toContain("基本完成");
  expect(rendered.textContent).toContain("未分学科的原课堂表现");
});
