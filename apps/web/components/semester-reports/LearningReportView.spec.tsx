import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
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
it("shows saved v2 subject and legacy evaluations without classroom photos in preview and export", () => {
  for (const forImage of [false, true]) {
    for (const photos of [{}, { classroomPhotos: [null, null], classroomPhoto: "stale-legacy-photo" }]) {
      const rendered = document.createElement("div");
      rendered.innerHTML = renderToStaticMarkup(
        <LearningReportView
          forImage={forImage}
          report={{
            ...report,
            content: {
              ...report.content,
              ...photos,
              reportVersion: "v2",
              reportSubjects: [{ subjectId: "english", name: "英语" }],
              classroomPerformance: [
                { subjectId: "english", text: "课堂参与 · 主动参与", sourceRefs: ["teacher-input"] },
                { text: "旧课堂评价", sourceRefs: ["teacher-input"] }
              ]
            }
          }}
        />
      );
      expect(rendered.querySelectorAll('[aria-label="分学科学习表现"]')).toHaveLength(1);
      expect(
        [...rendered.querySelectorAll("h3")].filter(node => node.textContent === "未分学科的原课堂表现")
      ).toHaveLength(1);
      expect(rendered.querySelector('[aria-label="英语的课堂表现"]')?.textContent).toContain("主动参与");
      expect(rendered.textContent).toContain("未分学科的原课堂表现");
      expect(rendered.textContent).toContain("旧课堂评价");
      expect(rendered.querySelector('[aria-label="课堂照片"]')).toBeNull();
      expect(rendered.textContent).not.toContain("老师暂未填写具体课堂表现");
      expect(rendered.querySelector("header")?.nextElementSibling?.firstElementChild?.textContent).toContain(
        "学习准备与课堂能力"
      );
    }
  }
});
it.each([
  { classroomPerformance: [] },
  { classroomPerformance: [{ subjectId: "english", text: " \n ", sourceRefs: [] }] }
])("hides empty v2 classroom performance without photos: %j", ({ classroomPerformance }) => {
  for (const forImage of [false, true]) {
    const rendered = document.createElement("div");
    rendered.innerHTML = renderToStaticMarkup(
      <LearningReportView
        forImage={forImage}
        report={{
          ...report,
          content: {
            ...report.content,
            reportVersion: "v2",
            classroomPhotos: [null, null],
            reportSubjects: [{ subjectId: "english", name: "英语" }],
            classroomPerformance
          }
        }}
      />
    );
    expect(rendered.querySelector('[aria-label="分学科学习表现"]')).toBeNull();
    expect(rendered.textContent).not.toContain("老师暂未填写具体课堂表现");
  }
});
it.each(["english", undefined])("shows a saved evaluation without photos or a portrait (subject: %s)", subjectId => {
  const rendered = document.createElement("div");
  rendered.innerHTML = renderToStaticMarkup(
    <LearningReportView
      report={{
        ...report,
        content: {
          ...report.content,
          reportVersion: "v2",
          reportSubjects: [
            { subjectId: "english", name: "英语" },
            { subjectId: "math", name: "数学" }
          ],
          classroomPerformance: [{ subjectId, text: "保留已填写的评价", sourceRefs: ["teacher-review"] }]
        }
      }}
    />
  );
  expect(rendered.textContent).toContain("保留已填写的评价");
  expect(rendered.querySelector('[aria-label="数学的课堂表现"]')?.textContent).toContain("老师暂未填写");
  expect(rendered.querySelector('[aria-label="数学的课堂表现"]')?.textContent).not.toContain("保留已填写的评价");
});
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
      if (version === "v2") expect(html).not.toContain("预留位置");
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
  const heading = rendered.querySelector('[aria-label="数学的课堂表现"] h3');
  expect(heading).toBeDefined();
  expect(heading!.parentElement!.textContent).toContain("老师暂未填写");
  expect(heading!.parentElement!.textContent).not.toContain("主动参与");
  expect(heading!.parentElement!.textContent).not.toContain("基本完成");
  expect(rendered.textContent).toContain("未分学科的原课堂表现");
});

it("hides mastery for teacher-written content in preview, parent rendering and image export", () => {
  const manual = {
    id: "manual-goal",
    section: "科学 · 教师填写",
    text: "观察种子发芽",
    mastery: "mastered" as const,
    sourceRefs: ["科学：教师填写的教学内容"]
  };
  const pdf = {
    id: "pdf-goal",
    section: "英语 · Unit1",
    text: "朗读英语短句",
    mastery: "practicing" as const,
    sourceRefs: ["English.pdf 第 1 页"]
  };
  for (const forImage of [false, true]) {
    const rendered = document.createElement("div");
    rendered.innerHTML = renderToStaticMarkup(
      <LearningReportView
        forImage={forImage}
        report={{ ...report, content: { ...report.content, reportVersion: "v2", learningContents: [manual, pdf] } }}
      />
    );
    expect(rendered.textContent).not.toContain(manual.text);
    expect(rendered.textContent).not.toContain(pdf.text);
    expect(rendered.textContent).not.toContain("练习中");
    const original = renderToStaticMarkup(
      <LearningReportView report={{ ...report, content: { ...report.content, learningContents: [pdf] } }} />
    );
    expect(original).toContain("练习中");
    rendered.innerHTML = renderToStaticMarkup(
      <LearningReportView
        report={{ ...report, content: { ...report.content, reportVersion: "v2", learningContents: [manual] } }}
      />
    );
    expect(rendered.textContent).not.toContain("已掌握");
    expect(rendered.textContent).not.toContain("待评价");
  }
});

it("renders v2 growth dimensions and two-column subject performance without home practice", () => {
  const content = {
    ...report.content,
    reportVersion: "v2" as const,
    growthAssessment: {
      learningReadiness: "能整理学习材料",
      communicationCooperation: "主动与同伴合作",
      independenceRules: "遵守活动规则",
      overallUnderstanding: "逐渐建立学习习惯"
    },
    reportSubjects: [
      { subjectId: "english", name: "英语" },
      { subjectId: "math", name: "数学" }
    ],
    classroomPerformance: [
      { subjectId: "english", text: "英语开口 · 主动表达", sourceRefs: ["teacher-input"] },
      { subjectId: "math", text: "课堂任务 · 独立完成", sourceRefs: ["teacher-input"] }
    ],
    homeSuggestions: [{ text: "旧家庭练习记录", sourceRefs: ["teacher-input"] }]
  };
  const rendered = document.createElement("div");
  rendered.innerHTML = renderToStaticMarkup(<LearningReportView report={{ ...report, content }} />);
  expect(rendered.textContent).toContain("学习准备与课堂能力");
  expect(rendered.textContent).toContain("主动与同伴合作");
  expect(rendered.textContent).toContain("生活自理与规则意识");
  expect(rendered.textContent).toContain("逐渐建立学习习惯");
  expect(rendered.querySelector('[aria-label="分学科学习表现"]')?.className).toContain("sm:grid-cols-2");
  expect(rendered.textContent).toContain("英语开口");
  expect(rendered.textContent).toContain("独立完成");
  expect(rendered.textContent).not.toContain("回家可以这样练");
  expect(rendered.textContent).not.toContain("旧家庭练习记录");
  expect(rendered.textContent).not.toContain("暂未整理逐项学习内容");
});

it.each([false, true])("uses the same responsive columns for growth and classroom cards (image: %s)", forImage => {
  const rendered = document.createElement("div");
  const observation = "能独立准备学习材料，主动参与活动。".repeat(30);
  rendered.innerHTML = renderToStaticMarkup(
    <LearningReportView
      forImage={forImage}
      report={{
        ...report,
        content: {
          ...report.content,
          reportVersion: "v2",
          reportSubjects: [{ subjectId: "english", name: "英语" }],
          classroomPerformance: [{ subjectId: "english", text: "主动参与活动", sourceRefs: ["teacher-input"] }],
          growthAssessment: {
            learningReadiness: observation,
            communicationCooperation: "",
            independenceRules: "遵守规则",
            overallUnderstanding: "持续成长"
          }
        }
      }}
    />
  );
  const growth = rendered.querySelector('[aria-label="学习习惯与能力成长总结"]')!;
  const classroom = rendered.querySelector('[aria-label="分学科学习表现"]')!;
  expect(growth.className).toBe(classroom.className);
  expect(growth.classList.contains("grid")).toBe(true);
  expect(growth.classList.contains("sm:grid-cols-2")).toBe(true);
  expect(growth.children).toHaveLength(4);
  expect(growth.textContent).toContain(observation);
  expect(growth.textContent).toContain("老师暂未填写。");
  for (const card of growth.children) expect(card.classList.contains("min-w-0")).toBe(true);
});

it.each([false, true])(
  "shows the student's pet beside frozen period points and side-by-side teacher message and next focus (image: %s)",
  forImage => {
    const rendered = document.createElement("div");
    rendered.innerHTML = renderToStaticMarkup(
      <LearningReportView
        forImage={forImage}
        report={{
          ...report,
          content: {
            ...report.content,
            reportVersion: "v2",
            pet: { petId: "sprout-puff", petName: "团团", level: 4, stage: "第4形态", petHatched: true },
            strengths: [{ text: "旧亮点", sourceRefs: [] }],
            areasToImprove: [{ text: "练习表达", sourceRefs: [] }],
            // Item counts include all records, even when saved details are capped.
            scoreDetails: {
              positive: 100,
              negative: -120,
              net: -20,
              count: 100,
              records: [],
              positiveItems: [
                { label: "认真听讲", count: 10 },
                { label: "乐于助人", count: 5 }
              ]
            }
          }
        }}
      />
    );
    expect(rendered.textContent).toContain("小明的宠物伙伴");
    expect(rendered.textContent).not.toContain("我的宠物伙伴");
    expect(rendered.textContent).toContain("本学期最值肯定");
    expect(rendered.textContent).not.toContain("本阶段积分");
    expect(rendered.textContent).not.toContain("旧亮点");
    const row = rendered.querySelector('[aria-label="宠物伙伴与阶段积分"]')!;
    expect(row.classList.contains("sm:grid-cols-2")).toBe(true);
    expect(row.classList.contains("grid-cols-1")).toBe(true);
    const petSection = row.children[0]!;
    expect(petSection.textContent).toContain("团团");
    expect(petSection.classList.contains("flex")).toBe(true);
    expect(petSection.classList.contains("flex-col")).toBe(true);
    const petWrapper = petSection.querySelector(".my-auto")!;
    expect(petWrapper.classList.contains("justify-center")).toBe(true);
    const chart = row.querySelector('[role="img"]')!;
    expect(chart.getAttribute("aria-label")).toContain("认真听讲 10 次，乐于助人 5 次");
    expect(chart.querySelector('[aria-label="认真听讲 10 次"]')?.getAttribute("style")).toContain("width:100%");
    expect(chart.querySelector('[aria-label="乐于助人 5 次"]')?.getAttribute("style")).toContain("width:50%");
    expect(chart.textContent).not.toContain("净积分");
    expect(chart.textContent).not.toContain("扣分");
    const focus = [...rendered.querySelectorAll("section")].find(
      section => section.textContent === "下一步重点练习表达"
    )!;
    const messageRow = rendered.querySelector('[aria-label="老师寄语与下一步重点"]')!;
    expect(messageRow.classList.contains("sm:grid-cols-2")).toBe(true);
    expect(messageRow.classList.contains("grid-cols-1")).toBe(true);
    expect(messageRow.children).toHaveLength(2);
    expect(messageRow.children[0]!.textContent).toBe("老师想对你说继续加油");
    expect(messageRow.children[1]).toBe(focus);
  }
);

it("distinguishes missing score snapshots from an empty period without fabricating points", () => {
  const base = { ...report.content, reportVersion: "v2" as const, petHistoryStatus: "unavailable" as const };
  const missing = renderToStaticMarkup(
    <LearningReportView report={{ ...report, content: { ...base, scoreDetails: undefined } }} />
  );
  expect(missing).toContain("此报告未保存完整加分细项统计");
  expect(missing).toContain("所选周期结束时的宠物形态尚无历史记录");
  expect(missing).not.toContain('role="img"');
  const empty = renderToStaticMarkup(
    <LearningReportView
      report={{
        ...report,
        content: {
          ...base,
          scoreDetails: { positive: 0, negative: 0, net: 0, count: 0, records: [] }
        }
      }}
    />
  );
  expect(empty).toContain("本周期暂无加分记录");
  expect(empty).not.toContain("NaN");
  expect(empty).not.toContain("Infinity");
  expect(empty).not.toContain("此报告未保存完整加分细项统计");
});

it.each([false, true])("expands a long message when the empty next focus is hidden (image: %s)", forImage => {
  const rendered = document.createElement("div");
  const summary = "继续练习表达，积极参与课堂。".repeat(50);
  rendered.innerHTML = renderToStaticMarkup(
    <LearningReportView
      forImage={forImage}
      report={{
        ...report,
        content: { ...report.content, reportVersion: "v2", summary }
      }}
    />
  );
  const row = rendered.querySelector('[aria-label="老师寄语与下一步重点"]')!;
  expect(row.children[0]!.textContent).toContain(summary);
  expect(row.children).toHaveLength(1);
  expect(row.classList.contains("grid-cols-1")).toBe(true);
  expect(row.textContent).not.toContain("下一步重点");
  for (const section of row.children) expect(section.classList.contains("min-w-0")).toBe(true);
  expect(rendered.querySelectorAll("h2")).toHaveLength(
    new Set([...rendered.querySelectorAll("h2")].map(heading => heading.textContent)).size
  );
});

it.each([false, true])("hides blank v2 messages and focus in preview and export (image: %s)", forImage => {
  for (const summary of ["", "  \n  "]) {
    const rendered = document.createElement("div");
    rendered.innerHTML = renderToStaticMarkup(
      <LearningReportView
        forImage={forImage}
        report={{
          ...report,
          content: {
            ...report.content,
            reportVersion: "v2",
            summary,
            areasToImprove: [{ text: " \n ", sourceRefs: ["teacher-review"] }]
          }
        }}
      />
    );
    expect(rendered.textContent).not.toContain("老师想对你说");
    expect(rendered.textContent).not.toContain("下一步重点");
    expect(rendered.querySelector('[aria-label="老师寄语与下一步重点"]')).toBeNull();
  }
  const rendered = document.createElement("div");
  rendered.innerHTML = renderToStaticMarkup(
    <LearningReportView
      forImage={forImage}
      report={{
        ...report,
        content: {
          ...report.content,
          reportVersion: "v2",
          summary: "",
          areasToImprove: [
            { text: " ", sourceRefs: [] },
            { text: "练习表达", sourceRefs: ["teacher-review"] }
          ]
        }
      }}
    />
  );
  const row = rendered.querySelector('[aria-label="老师寄语与下一步重点"]')!;
  expect(row.classList.contains("grid-cols-1")).toBe(true);
  expect(row.children).toHaveLength(1);
  expect(row.textContent).toBe("下一步重点练习表达");
});

it.each([false, true])("shows both saved classroom photos once in the header (image: %s)", forImage => {
  const rendered = document.createElement("div");
  rendered.innerHTML = renderToStaticMarkup(
    <LearningReportView
      forImage={forImage}
      report={{
        ...report,
        content: {
          ...report.content,
          reportVersion: "v2",
          classroomPhoto: "legacy-duplicate",
          classroomPhotos: ["first-photo", "second-photo"]
        }
      }}
    />
  );
  const photos = rendered.querySelectorAll("header img");
  expect(photos).toHaveLength(2);
  expect(photos[0]!.getAttribute("src")).toBe("first-photo");
  expect(photos[1]!.getAttribute("src")).toBe("second-photo");
  expect(rendered.querySelector('img[src="legacy-duplicate"]')).toBeNull();
});

it.each([false, true])(
  "places each photo caption beneath its own image and renders text safely (image: %s)",
  forImage => {
    const rendered = document.createElement("div");
    rendered.innerHTML = renderToStaticMarkup(
      <LearningReportView
        forImage={forImage}
        report={{
          ...report,
          content: {
            ...report.content,
            classroomPhotos: ["first-photo", "second-photo"],
            classroomPhotoCaptions: ["小组合作", "<b>手工</b>"]
          }
        }}
      />
    );
    const figures = rendered.querySelectorAll("header figure");
    expect(figures).toHaveLength(2);
    expect(figures[0]!.querySelector("figcaption")!.textContent).toBe("小组合作");
    expect(figures[1]!.querySelector("figcaption")!.textContent).toBe("<b>手工</b>");
    expect(figures[1]!.querySelector("b")).toBeNull();
    expect(figures[0]!.querySelector("img")!.nextElementSibling?.tagName).toBe("FIGCAPTION");
  }
);

it("formats report dates deterministically even when browser locale date formatting differs", () => {
  const locale = vi.spyOn(Date.prototype, "toLocaleDateString").mockReturnValue("客户端不同的日期格式");
  try {
    const html = renderToStaticMarkup(
      <LearningReportView report={{ ...report, start: "2026-10-08T16:00:00Z", end: "2026-10-09T16:00:00Z" }} />
    );
    expect(html).toContain("2026/10/9");
    expect(html).not.toContain("客户端不同的日期格式");
  } finally {
    locale.mockRestore();
  }
});
