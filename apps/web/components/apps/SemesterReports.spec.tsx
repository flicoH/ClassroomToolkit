import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SemesterReports } from "./SemesterReports";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock("@/lib/request", () => ({ default: api }));

describe("SemesterReports mobile workflow", () => {
  let root: Root;
  let container: HTMLDivElement;
  let empty = false;
  beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    empty = false;
    api.get.mockImplementation(async (url: string) => {
      if (url.endsWith("report-terms"))
        return empty ? [] : [{ id: "term", name: "秋季", startDate: "2026-09-01", endDate: "2026-12-31" }];
      if (url.endsWith("report-subjects")) return empty ? [] : [{ id: "subject", name: "阅读" }];
      if (url === "/api/pet-points") return { students: [] };
      if (url.endsWith("course-documents"))
        return empty
          ? []
          : [
              {
                id: "doc",
                termId: "term",
                subjectId: "subject",
                fileName: "很长的课程文件名称.pdf",
                status: "failed",
                errorMessage: "云端连接失败，请重试"
              }
            ];
      return [];
    });
    api.post.mockResolvedValue({});
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });
  describe.each(["v1", "v2"] as const)("%s default report period", version => {
    it.each([
      ["2026-10-16", "2026-10-12"],
      ["2026-10-19", "2026-10-19"],
      ["2026-11-01", "2026-10-26"]
    ])("starts at the current Monday on %s", async (today, monday) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(`${today}T12:00:00`));
      try {
        await act(async () => root.render(<SemesterReports version={version} />));
        expect(container.querySelector<HTMLSelectElement>('[aria-label="报告周期"]')?.value).toBe("week");
        const dates = container.querySelectorAll<HTMLInputElement>('input[type="date"]');
        expect([...dates].slice(-2).map(input => input.value)).toEqual([monday, today]);
        const period = container.querySelector<HTMLSelectElement>('[aria-label="报告周期"]')!;
        act(() => {
          period.value = "month";
          period.dispatchEvent(new Event("change", { bubbles: true }));
        });
        expect([...dates].slice(-2).map(input => input.value)).toEqual([`${today.slice(0, 7)}-01`, today]);
        if (version === "v2") {
          act(() => {
            period.value = "term";
            period.dispatchEvent(new Event("change", { bubbles: true }));
          });
          expect([...dates].slice(-2).map(input => input.value)).toEqual(["2026-09-01", today]);
        }
        act(() => {
          period.value = "week";
          period.dispatchEvent(new Event("change", { bubbles: true }));
        });
        expect([...dates].slice(-2).map(input => input.value)).toEqual([monday, today]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("keeps the weekly default when initial loading fails", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-16T12:00:00"));
      api.get.mockRejectedValue(new Error("学期加载失败"));
      try {
        await act(async () => root.render(<SemesterReports version={version} />));
        expect(container.querySelector('[role="status"]')?.textContent).toContain("学期加载失败");
        expect(container.querySelector<HTMLSelectElement>('[aria-label="报告周期"]')?.value).toBe("week");
        const dates = container.querySelectorAll<HTMLInputElement>('input[type="date"]');
        expect([...dates].slice(-2).map(input => input.value)).toEqual(["2026-10-12", "2026-10-16"]);
      } finally {
        vi.useRealTimers();
      }
    });
  });
  async function readyV2Generation(version: "v1" | "v2" = "v2") {
    const originalGet = api.get.getMockImplementation()!;
    api.get.mockImplementation(async (url: string) => {
      if (url === "/api/pet-points")
        return {
          students: [
            {
              id: "student",
              name: "小明",
              classId: "class",
              className: "一班",
              score: 0,
              petId: "coal-tail-fox",
              petName: "当前火狐",
              level: 10,
              stage: "第10形态",
              petHatched: true
            }
          ]
        };
      if (url.endsWith("course-documents"))
        return [
          {
            id: "doc",
            termId: "term",
            subjectId: "subject",
            status: "ready",
            fileName: "Reading.pdf",
            units: ["Unit1", "Unit2"]
          }
        ];
      return originalGet(url);
    });
    await act(async () => root.render(<SemesterReports version={version} />));
    const generateButton = [...container.querySelectorAll("button")].find(button =>
      button.textContent?.includes("生成 1 份报告")
    );
    expect(generateButton).toBeUndefined();
    act(() => container.querySelector<HTMLInputElement>('input[aria-label="选择 一班 小明"]')!.click());
    if (version === "v2")
      act(() => container.querySelector<HTMLInputElement>('input[aria-label="选择阅读课程"]')!.click());
    return [...container.querySelectorAll("button")].find(button => button.textContent?.includes("生成 1 份报告"))!;
  }

  it("saves per-subject configuration, keeps edits after failure and generates only chosen ratings", async () => {
    vi.useFakeTimers();
    try {
      api.post.mockImplementation(async (url: string) =>
        url.endsWith("generate")
          ? { reports: [] }
          : { totalPages: 0, learningContents: [], documents: [], totalLearningContents: 0, scoreSummaries: [] }
      );
      const generate = await readyV2Generation();
      await act(async () => vi.advanceTimersByTimeAsync(450));
      const input = container.querySelector<HTMLTextAreaElement>('[aria-label="阅读 课程任务下拉选项"]')!;
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "完成挑战\n需要支持");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      const save = [...container.querySelectorAll("button")].find(button => button.textContent === "保存课堂表现配置")!;
      api.patch.mockRejectedValueOnce(new Error("配置保存失败"));
      await act(async () => save.click());
      expect(container.querySelector('[role="status"]')?.textContent).toContain("配置保存失败");
      expect(input.value).toBe("完成挑战\n需要支持");
      api.patch.mockImplementation(async (_url: string, body: { performanceConfig: unknown }) => ({
        id: "subject",
        name: "阅读",
        performanceConfig: body.performanceConfig
      }));
      await act(async () => save.click());
      expect(api.patch).toHaveBeenLastCalledWith(
        "/api/semester-reports/report-subjects/subject/performance-config",
        expect.objectContaining({
          performanceConfig: expect.arrayContaining([{ label: "课程任务", options: ["完成挑战", "需要支持"] }])
        })
      );
      const task = container.querySelector<HTMLSelectElement>('[aria-label="阅读 课程任务"]')!;
      expect([...task.options].map(option => option.value)).toEqual(["", "完成挑战", "需要支持"]);
      act(() => {
        task.value = "完成挑战";
        task.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await act(async () => generate.click());
      expect(api.post).toHaveBeenLastCalledWith(
        "/api/semester-reports/reports/generate",
        expect.objectContaining({
          studentFeedback: [
            expect.objectContaining({
              classroomPerformance: [{ subjectId: "subject", label: "课程任务", value: "完成挑战" }]
            })
          ]
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("persists consecutive custom additions and shows them only for their subject without a second save", async () => {
    vi.useFakeTimers();
    try {
      const original = api.get.getMockImplementation()!;
      api.get.mockImplementation(async (url: string) =>
        url.endsWith("report-subjects")
          ? [
              { id: "subject", name: "阅读" },
              { id: "math", name: "数学" }
            ]
          : original(url)
      );
      api.post.mockResolvedValue({
        totalPages: 0,
        learningContents: [],
        documents: [],
        totalLearningContents: 0,
        scoreSummaries: []
      });
      api.patch.mockImplementation(async (url: string, body: { performanceConfig: unknown }) => ({
        id: url.includes("/math/") ? "math" : "subject",
        name: url.includes("/math/") ? "数学" : "阅读",
        performanceConfig: body.performanceConfig
      }));
      await readyV2Generation();
      act(() => container.querySelector<HTMLInputElement>('[aria-label="选择数学课程"]')!.click());
      const subject = container.querySelector<HTMLSelectElement>('[aria-label="配置课堂表现的学科"]')!;
      act(() => {
        subject.value = "math";
        subject.dispatchEvent(new Event("change", { bubbles: true }));
      });
      function type(label: string, value: string) {
        const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)!;
        act(() => {
          Object.getOwnPropertyDescriptor(
            input instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype,
            "value"
          )!.set!.call(input, value);
          input.dispatchEvent(new Event("input", { bubbles: true }));
        });
      }
      for (const label of ["同伴协作", "课堂表达"]) {
        type("新增课堂表现名称", label);
        type("新增课堂表现下拉选项", "主动完成\n需要引导");
        await act(async () =>
          [...container.querySelectorAll("button")].find(button => button.textContent === "添加课堂表现项目")!.click()
        );
        expect(container.querySelector<HTMLSelectElement>(`[aria-label="数学 ${label}"]`)?.options.length).toBe(3);
        expect(container.querySelector(`[aria-label="阅读 ${label}"]`)).toBeNull();
      }
      expect(api.patch).toHaveBeenCalledTimes(2);
      expect(api.patch).toHaveBeenLastCalledWith(
        "/api/semester-reports/report-subjects/math/performance-config",
        expect.objectContaining({
          performanceConfig: expect.arrayContaining([
            { label: "同伴协作", options: ["主动完成", "需要引导"] },
            { label: "课堂表达", options: ["主动完成", "需要引导"] }
          ])
        })
      );
      act(() => {
        subject.value = "subject";
        subject.dispatchEvent(new Event("change", { bubbles: true }));
      });
      act(() => {
        subject.value = "math";
        subject.dispatchEvent(new Event("change", { bubbles: true }));
      });
      expect(container.querySelector('[aria-label="数学 同伴协作下拉选项"]')).toBeTruthy();
      expect(container.querySelector('[aria-label="数学 课堂表达下拉选项"]')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not overwrite saved subject fields with an older polling response", async () => {
    vi.useFakeTimers();
    try {
      const original = api.get.getMockImplementation()!;
      let reads = 0;
      let resolveSubjects!: (value: Array<{ id: string; name: string }>) => void;
      api.get.mockImplementation(async (url: string) => {
        if (url.endsWith("report-subjects") && ++reads === 2)
          return new Promise(resolve => {
            resolveSubjects = resolve;
          });
        if (url.endsWith("/reports"))
          return [{ id: "queued", reportVersion: "v2", status: "queued", studentName: "小明", content: null }];
        return original(url);
      });
      api.post.mockResolvedValue({ totalPages: 0, learningContents: [], documents: [], scoreSummaries: [] });
      api.patch.mockImplementation(async (_url: string, body: { performanceConfig: unknown }) => ({
        id: "subject",
        name: "阅读",
        performanceConfig: body.performanceConfig
      }));
      await readyV2Generation();
      await act(async () => vi.advanceTimersByTimeAsync(2500));
      const input = container.querySelector<HTMLTextAreaElement>('[aria-label="阅读 课程任务下拉选项"]')!;
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "新评价\n需要支持");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () =>
        [...container.querySelectorAll("button")].find(button => button.textContent === "保存课堂表现配置")!.click()
      );
      await act(async () => resolveSubjects([{ id: "subject", name: "阅读" }]));
      expect(
        [...container.querySelector<HTMLSelectElement>('[aria-label="阅读 课程任务"]')!.options].map(
          option => option.value
        )
      ).toEqual(["", "新评价", "需要支持"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["v1", "v2"] as const)(
    "shows the historical pet and version-appropriate affirmation fields in %s creation",
    async version => {
      vi.useFakeTimers();
      try {
        api.post.mockImplementation(async (url: string) =>
          url.endsWith("preview-input")
            ? {
                scoreSummaries: [
                  {
                    studentId: "student",
                    positive: 99,
                    negative: 0,
                    net: 99,
                    count: 15,
                    records: [],
                    positiveItems: [
                      { label: "认真听讲", count: 10 },
                      { label: "乐于助人", count: 5 }
                    ]
                  }
                ],
                petPreviews: [
                  {
                    studentId: "student",
                    pet: { petId: "sprout-puff", petName: "历史团团", level: 4, stage: "第4形态", petHatched: true },
                    petHistoryStatus: "recorded",
                    petAsOf: "2026-10-09T15:59:59.999Z"
                  }
                ]
              }
            : { totalPages: 1, learningContents: [], documents: [] }
        );
        await readyV2Generation(version);
        await act(async () => vi.advanceTimersByTimeAsync(450));
        expect(container.textContent).toContain("历史团团");
        expect(container.querySelector('img[src="/pets/starling/sprout-puff-2.png"]')).not.toBeNull();
        expect(container.textContent).not.toContain("积分加减情况");
        expect(container.textContent).not.toContain("生成时保存当前宠物形态");
        expect(container.textContent).not.toContain("当前火狐");
        if (version === "v2") {
          expect(container.textContent).not.toContain("本期最值得肯定");
          const feedback = container.querySelector('[aria-label="小明的报告反馈"]')!;
          const companion = feedback.querySelector('[aria-label="宠物伙伴与阶段积分"]')!;
          expect(companion.classList.contains("sm:grid-cols-2")).toBe(true);
          expect(companion.children[0]!.textContent).toContain("历史团团");
          expect(companion.children[1]!.textContent).toContain("本期最值肯定");
          expect(
            companion.querySelector('[aria-label="加分细项次数柱状图：认真听讲 10 次，乐于助人 5 次"]')
          ).not.toBeNull();
          const messages = feedback.querySelector('[aria-label="老师寄语与下一步重点"]')!;
          expect(companion.nextElementSibling).toBe(messages);
          expect(messages.classList.contains("sm:grid-cols-2")).toBe(true);
          expect(messages.children[0]!.textContent).toContain("老师想对你说");
          expect(messages.children[1]!.textContent).toContain("下一步重点");
          expect(feedback.textContent!.indexOf("课堂表现")).toBeLessThan(feedback.textContent!.indexOf("历史团团"));
        } else {
          expect(container.textContent).toContain("本期最值得肯定");
          expect(container.querySelector('[aria-label="宠物伙伴与阶段积分"]')).toBeNull();
        }
      } finally {
        vi.useRealTimers();
      }
    }
  );

  it("generates a v2 report with no PDF after the teacher fills the selected subject's content", async () => {
    vi.useFakeTimers();
    try {
      const original = api.get.getMockImplementation()!;
      api.get.mockImplementation(async url =>
        url === "/api/pet-points"
          ? { students: [{ id: "student", name: "小明", className: "一班", classId: "class" }] }
          : url.endsWith("course-documents")
            ? []
            : original(url)
      );
      api.post.mockImplementation(async url =>
        url.endsWith("preview-input")
          ? { scoreSummaries: [] }
          : url.endsWith("preview-scope")
            ? {
                totalPages: 0,
                documents: [],
                totalLearningContents: 1,
                learningContents: [
                  {
                    id: "manual",
                    section: "阅读 · 教师填写",
                    text: "认识汉字并朗读短句",
                    sourceRefs: ["teacher-course:subject"]
                  }
                ]
              }
            : { reports: [] }
      );
      await act(async () => root.render(<SemesterReports version="v2" />));
      act(() => container.querySelector<HTMLInputElement>('[aria-label="选择 一班 小明"]')!.click());
      act(() => container.querySelector<HTMLInputElement>('[aria-label="选择阅读课程"]')!.click());
      const generate = [...container.querySelectorAll("button")].find(button =>
        button.textContent?.includes("生成 1 份报告")
      )!;
      expect(generate.disabled).toBe(true);
      await act(async () => vi.advanceTimersByTimeAsync(450));
      expect(api.post).toHaveBeenCalledWith(
        expect.stringContaining("preview-scope"),
        expect.objectContaining({ courseSelections: [{ subjectId: "subject", courseScope: "", manualContent: "" }] })
      );
      expect(generate.disabled).toBe(false);
      expect(container.querySelector('[aria-label="阅读教学内容"]')).toBeNull();
      expect(container.textContent).toContain("阅读的课堂表现");
      expect(container.textContent).not.toContain("回家可以这样练");
      const growth = container.querySelector<HTMLTextAreaElement>('[aria-label="小明 学习准备与课堂能力"]')!;
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(growth, "能准备学习材料");
        growth.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => generate.click());
      expect(api.post).toHaveBeenCalledWith(
        "/api/semester-reports/reports/generate",
        expect.objectContaining({
          courseSelections: [{ subjectId: "subject", courseScope: "", manualContent: "" }],
          studentFeedback: expect.arrayContaining([
            expect.objectContaining({
              studentId: "student",
              growthAssessment: expect.objectContaining({ learningReadiness: "能准备学习材料" })
            })
          ])
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("v2 hides PDF setup and curriculum inputs even when confirmed PDFs exist", async () => {
    api.post.mockResolvedValue({
      totalPages: 0,
      learningContents: [],
      totalLearningContents: 0,
      documents: [],
      scoreSummaries: []
    });
    await readyV2Generation();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(container.querySelector('[aria-label="阅读授课范围"]')).toBeNull();
    expect(container.querySelector('[aria-label="阅读教学内容"]')).toBeNull();
    expect(container.querySelector('[aria-label="阅读 Unit1"]')).toBeNull();
    expect(container.textContent).not.toContain("学习内容与掌握");
  });
  it("generates v2 reports from checked subjects without curriculum choices", async () => {
    const scope = "";
    vi.useFakeTimers();
    try {
      api.post.mockImplementation(async (url: string) => {
        if (url.endsWith("preview-input")) return { scoreSummaries: [] };
        if (url.endsWith("preview-scope"))
          return {
            courseScope: `阅读：${scope || "本学期全部内容"}`,
            totalPages: 1,
            documents: [],
            learningContents: [{ id: "goal", section: "阅读 · Unit1", text: "阅读第一课", sourceRefs: [] }],
            totalLearningContents: 1
          };
        return {
          reports: [
            {
              id: "report",
              reportVersion: "v2",
              studentName: "小明",
              className: "一班",
              period: "term",
              status: "queued",
              content: null
            }
          ]
        };
      });
      const generate = await readyV2Generation();

      expect(generate.disabled).toBe(true);
      await act(async () => vi.advanceTimersByTimeAsync(450));
      expect(generate.disabled).toBe(false);
      act(() => container.querySelector<HTMLInputElement>('input[aria-label="选择 一班 小明"]')!.click());
      expect(generate.disabled).toBe(true);
      act(() => container.querySelector<HTMLInputElement>('input[aria-label="选择 一班 小明"]')!.click());
      expect(generate.disabled).toBe(false);
      await act(async () => generate.click());
      expect(api.post).toHaveBeenCalledWith(
        "/api/semester-reports/reports/generate",
        expect.objectContaining({
          reportVersion: "v2",
          period: "week",
          start: expect.any(String),
          end: expect.any(String),
          studentIds: ["student"],
          courseSelections: [{ subjectId: "subject", courseScope: "", manualContent: "" }]
        })
      );
      expect(container.querySelector('[role="status"]')?.textContent).toContain("已提交 1 份报告");
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["v1", "v2"] as const)(
    "shows unavailable history and a retryable read failure without substituting the current pet in %s",
    async version => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-09T12:00:00"));
      try {
        api.post.mockImplementation(async (url: string) =>
          url.endsWith("preview-input")
            ? {
                petPreviews: [
                  {
                    studentId: "student",
                    pet: null,
                    petAsOf: "2026-10-09T15:59:59.999Z",
                    petHistoryStatus: "unavailable"
                  }
                ]
              }
            : { totalPages: 1, learningContents: [], documents: [] }
        );
        await readyV2Generation(version);
        await act(async () => vi.advanceTimersByTimeAsync(450));
        expect(container.textContent).toContain("所选周期结束时的宠物形态尚无历史记录");
        expect(container.textContent).not.toContain("当前火狐");
        const dates = container.querySelectorAll<HTMLInputElement>('input[type="date"]');
        api.post.mockImplementation(async (url: string) => {
          if (url.endsWith("preview-input")) throw new Error("历史服务失败");
          return { totalPages: 1, learningContents: [], documents: [] };
        });
        act(() => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
            dates[dates.length - 1],
            "2026-10-08"
          );
          dates[dates.length - 1]!.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await act(async () => vi.advanceTimersByTimeAsync(450));
        expect(container.textContent).toContain("宠物形态预览失败");
        if (version === "v2") {
          expect(container.textContent).toContain("加分细项预览失败");
          expect(container.querySelector('[aria-label="宠物伙伴与阶段积分"] [role="img"]')).toBeNull();
          expect(container.textContent).not.toContain("本期最值得肯定");
        }
        expect(container.textContent).not.toContain("当前火狐");
        expect([...container.querySelectorAll("button")].some(button => button.textContent === "重试")).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    }
  );

  it("keeps generation disabled for failed and stale v2 previews, then allows a successful retry", async () => {
    vi.useFakeTimers();
    try {
      let resolveOld!: (value: unknown) => void;
      let attempt = 0;
      const preview = (text: string) => ({
        courseScope: "阅读：Unit1",
        totalPages: 1,
        documents: [],
        learningContents: [{ id: "goal", section: "阅读", text, sourceRefs: [] }],
        totalLearningContents: 1
      });
      api.post.mockImplementation(async (url: string) => {
        if (url.endsWith("preview-input")) return { scoreSummaries: [] };
        if (attempt++ === 0)
          return new Promise(resolve => {
            resolveOld = resolve;
          });
        if (attempt === 2) throw new Error("课程预览无权限");
        return preview("当前选课内容");
      });
      const generate = await readyV2Generation();
      await act(async () => vi.advanceTimersByTimeAsync(450));
      act(() => container.querySelector<HTMLInputElement>('[aria-label="选择阅读课程"]')!.click());
      act(() => container.querySelector<HTMLInputElement>('[aria-label="选择阅读课程"]')!.click());
      expect(generate.disabled).toBe(true);
      await act(async () => vi.advanceTimersByTimeAsync(450));
      expect(container.textContent).toContain("课程预览无权限");
      await act(async () => resolveOld(preview("过时内容")));
      expect(generate.disabled).toBe(true);
      expect(container.textContent).not.toContain("过时内容");
      act(() =>
        [...container.querySelectorAll("button")].find(button => button.textContent === "重新确认学科")!.click()
      );
      await act(async () => vi.advanceTimersByTimeAsync(450));
      expect(generate.disabled).toBe(false);
      expect(container.textContent).not.toContain("当前选课内容");
    } finally {
      vi.useRealTimers();
    }
  });
  it.each([{ totalPages: 1, totalLearningContents: 501 }])(
    "blocks v2 generation for unusable previews: %j",
    async limits => {
      vi.useFakeTimers();
      try {
        api.post.mockImplementation(async (url: string) =>
          url.endsWith("preview-input")
            ? { scoreSummaries: [] }
            : { courseScope: "阅读：本学期全部内容", documents: [], learningContents: [], ...limits }
        );
        const generate = await readyV2Generation();
        await act(async () => vi.advanceTimersByTimeAsync(450));
        expect(generate.disabled).toBe(true);
        act(() => generate.click());
        expect(api.post).not.toHaveBeenCalledWith("/api/semester-reports/reports/generate", expect.anything());
      } finally {
        vi.useRealTimers();
      }
    }
  );
  it("v2 has a separate entry, explicit subject scopes and version-isolated reports", async () => {
    api.get.mockImplementation(async (url: string) => {
      if (url.endsWith("report-terms"))
        return [{ id: "term", name: "秋季", startDate: "2026-09-01", endDate: "2026-12-31" }];
      if (url.endsWith("report-subjects")) return [{ id: "subject", name: "阅读" }];
      if (url === "/api/pet-points") return { students: [] };
      if (url.endsWith("reports"))
        return [
          { id: "old", studentName: "旧报告学生", className: "一班", status: "draft", period: "term", content: null },
          {
            id: "new",
            reportVersion: "v2",
            studentName: "新报告学生",
            className: "一班",
            status: "draft",
            period: "term",
            content: null
          }
        ];
      return [];
    });
    await act(async () => root.render(<SemesterReports version="v2" />));
    expect(container.querySelector('nav[aria-label="学期报告v2导航"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="报告学科"]')).toBeNull();
    expect(container.textContent).toContain("无需上传 PDF 或选择学科内容");
    expect(container.textContent).toContain("新报告学生");
    expect(container.textContent).not.toContain("旧报告学生");
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 450));
    });
    expect(api.post).not.toHaveBeenCalledWith(
      "/api/semester-reports/course-documents/preview-scope",
      expect.anything()
    );
  });
  it("sends only checked subject scopes to v2 previews and removes unchecked subjects", async () => {
    api.post.mockImplementation(async (url: string) =>
      url.endsWith("preview-input")
        ? { scoreSummaries: [] }
        : { totalPages: 1, learningContents: [], documents: [], totalLearningContents: 0 }
    );
    const originalGet = api.get.getMockImplementation()!;
    api.get.mockImplementation(async (url: string) => {
      if (url === "/api/pet-points")
        return { students: [{ id: "student", name: "小明", classId: "class", className: "一班", score: 0 }] };
      if (url.endsWith("report-subjects"))
        return [
          { id: "english", name: "英语" },
          { id: "math", name: "数学" }
        ];
      if (url.endsWith("course-documents"))
        return [
          {
            id: "en",
            termId: "term",
            subjectId: "english",
            status: "ready",
            fileName: "English.pdf",
            units: ["Unit1"]
          },
          { id: "ma", termId: "term", subjectId: "math", status: "ready", fileName: "Math.pdf", units: ["Unit1"] }
        ];
      return originalGet(url);
    });
    await act(async () => root.render(<SemesterReports version="v2" />));
    const english = container.querySelector<HTMLInputElement>('input[aria-label="选择英语课程"]')!;
    const math = container.querySelector<HTMLInputElement>('input[aria-label="选择数学课程"]')!;
    expect(english.checked).toBe(false);
    expect(math.checked).toBe(false);
    act(() => container.querySelector<HTMLInputElement>('input[aria-label="选择 一班 小明"]')!.click());
    const message = container.querySelector<HTMLTextAreaElement>('textarea[placeholder^="填写实际观察与鼓励话语"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(message, "保留的老师寄语");
      message.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => english.click());
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 450));
    });
    expect(api.post).toHaveBeenLastCalledWith(
      "/api/semester-reports/course-documents/preview-scope",
      expect.objectContaining({ courseSelections: [{ subjectId: "english", courseScope: "", manualContent: "" }] })
    );
    act(() => math.click());
    act(() => english.click());
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 450));
    });
    expect(api.post).toHaveBeenLastCalledWith(
      "/api/semester-reports/course-documents/preview-scope",
      expect.objectContaining({ courseSelections: [{ subjectId: "math", courseScope: "", manualContent: "" }] })
    );
    expect(container.querySelector<HTMLTextAreaElement>('textarea[placeholder^="填写实际观察与鼓励话语"]')!.value).toBe(
      "保留的老师寄语"
    );
  });
  async function render() {
    await act(async () => root.render(<SemesterReports />));
  }
  function button(name: string) {
    const found = [...document.body.querySelectorAll("button")].find(element => element.textContent?.trim() === name);
    expect(found, `button ${name}`).toBeTruthy();
    return found!;
  }
  it("provides a labelled mobile navigation and preserves form input when switching sections", async () => {
    await render();
    expect(container.querySelector('nav[aria-label="学期报告导航"]')).not.toBeNull();
    act(() => button("填写报告").click());
    const input = container.querySelector<HTMLInputElement>('input[placeholder="例如：Animals"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "阅读与表达");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => button("报告列表").click());
    act(() => button("填写报告").click());
    expect(input.value).toBe("阅读与表达");
    expect(button("填写报告").getAttribute("aria-pressed")).toBe("true");
    expect(container.textContent).toContain("秋季");
  });
  it("keeps setup collapsed for existing courses and opens it for first-time setup", async () => {
    await render();
    expect(container.querySelector<HTMLDetailsElement>("details[data-course-setup]")?.open).toBe(false);
    await act(async () => root.unmount());
    root = createRoot(container);
    empty = true;
    await render();
    expect(container.querySelector<HTMLDetailsElement>("details[data-course-setup]")?.open).toBe(true);
    expect(container.querySelector<HTMLInputElement>('input[type="file"]')?.disabled).toBe(true);
    expect(container.textContent).toContain("还没有课程 PDF");
  });
  it("separates failed file feedback and handles retry rejection on the page", async () => {
    await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("云端连接失败");
    api.post.mockRejectedValueOnce(new Error("额度不足，请稍后重试"));
    await act(async () => button("重试").click());
    expect(api.post).toHaveBeenCalledWith("/api/semester-reports/course-documents/doc/retry");
    expect(container.querySelector('[role="status"]')?.textContent).toContain("额度不足");
    expect(button("课程资料").getAttribute("aria-pressed")).toBe("true");
  });
  function choosePdf(file = new File(["%PDF-1.7"], "本期课程.pdf", { type: "application/pdf" })) {
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    act(() => input.dispatchEvent(new Event("change", { bubbles: true })));
    return input;
  }

  it("shows upload progress next to the file picker and prevents duplicate uploads", async () => {
    let finish!: (value: unknown) => void;
    let progress!: (value: { loaded: number; total?: number }) => void;
    api.post.mockImplementation((_url, _body, config) => {
      progress = config.onUploadProgress;
      return new Promise(resolve => (finish = resolve));
    });
    await render();
    const input = choosePdf();
    const courses = container.querySelector('section[aria-label="课程资料"]')!;
    expect(courses.textContent).toContain("正在上传 PDF");
    expect(courses.textContent).toContain("本期课程.pdf");
    expect(input.disabled).toBe(true);
    choosePdf();
    expect(api.post).toHaveBeenCalledTimes(1);
    act(() => progress({ loaded: 15 }));
    expect(courses.querySelector('[role="progressbar"]')?.hasAttribute("aria-valuenow")).toBe(false);
    act(() => button("填写报告").click());
    expect(container.querySelector('[aria-label="PDF 处理状态"]')?.textContent).toContain("正在上传 PDF：本期课程.pdf");
    act(() => button("课程资料").click());
    act(() => progress({ loaded: 45, total: 100 }));
    expect(courses.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("45");
    act(() => progress({ loaded: 100, total: 100 }));
    expect(courses.textContent).toContain("文件已传输，正在等待服务器确认");
    await act(async () =>
      finish({ id: "uploaded", fileName: "本期课程.pdf", termId: "term", subjectId: "subject", status: "queued" })
    );
    expect(input.disabled).toBe(false);
    expect(api.post.mock.calls[0]![1]).toBeInstanceOf(FormData);
    expect(api.post.mock.calls[0]![2].headers["Content-Type"]).toBeUndefined();
  });

  it("keeps upload failure beside the picker and allows selecting the same file again", async () => {
    api.post.mockRejectedValue(new Error("没有上传权限"));
    await render();
    await act(async () => choosePdf());
    const courses = container.querySelector('section[aria-label="课程资料"]')!;
    expect(courses.querySelector('[role="alert"]')?.textContent).toContain("没有上传权限");
    expect(container.querySelector<HTMLInputElement>('input[type="file"]')?.disabled).toBe(false);
    await act(async () => choosePdf());
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  it("rejects oversized files before starting an upload", async () => {
    await render();
    const file = new File(["%PDF"], "过大.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: 30 * 1024 * 1024 + 1 });
    choosePdf(file);
    expect(container.querySelector('section[aria-label="课程资料"] [role="alert"]')?.textContent).toContain("30MB");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("preserves an accepted upload when refreshing the document list fails", async () => {
    await render();
    api.post.mockResolvedValueOnce({
      id: "uploaded",
      fileName: "本期课程.pdf",
      termId: "term",
      subjectId: "subject",
      status: "queued"
    });
    api.get.mockRejectedValueOnce(new Error("网络中断"));
    await act(async () => choosePdf());
    expect(container.querySelector('section[aria-label="课程资料"]')?.textContent).toContain("本期课程.pdf");
    expect(container.querySelector('[aria-label="PDF 处理状态"]')?.textContent).toContain("状态刷新失败");
    expect(container.querySelector('[role="status"]')?.textContent).toContain("PDF 已上传");
    expect(container.querySelector<HTMLInputElement>('input[type="file"]')?.disabled).toBe(false);
  });

  it("makes parsing visible across mobile sections and refreshes into chapter review", async () => {
    vi.useFakeTimers();
    try {
      let status = "parsing";
      const originalGet = api.get.getMockImplementation()!;
      api.get.mockImplementation(async (url: string) =>
        url.endsWith("course-documents")
          ? [
              {
                id: "doc",
                termId: "term",
                subjectId: "subject",
                fileName: "课程.pdf",
                status,
                pageCount: 3,
                units: ["第一课"]
              }
            ]
          : originalGet(url)
      );
      await render();
      expect(container.querySelector('section[aria-label="课程资料"]')?.textContent).toContain("正在解析 PDF");
      act(() => button("填写报告").click());
      expect(container.querySelector('[aria-label="PDF 处理状态"]')?.textContent).toContain("1 份 PDF 正在处理");
      status = "needs_review";
      await act(async () => vi.advanceTimersByTimeAsync(2500));
      act(() => button("课程资料").click());
      expect(container.querySelector('section[aria-label="课程资料"]')?.textContent).toContain("解析完成，请确认章节");
      expect(button("确认章节")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a failed status refresh without claiming the parser failed", async () => {
    vi.useFakeTimers();
    try {
      const originalGet = api.get.getMockImplementation()!;
      api.get.mockImplementation(async (url: string) =>
        url.endsWith("course-documents")
          ? [{ id: "doc", termId: "term", subjectId: "subject", fileName: "课程.pdf", status: "queued" }]
          : originalGet(url)
      );
      await render();
      api.get.mockRejectedValueOnce(new Error("网络中断"));
      await act(async () => vi.advanceTimersByTimeAsync(2500));
      expect(container.querySelector('[aria-label="PDF 处理状态"]')?.textContent).toContain("状态刷新失败");
      await act(async () => button("刷新处理状态").click());
      expect(container.querySelector('[aria-label="PDF 处理状态"]')?.textContent).not.toContain("状态刷新失败");
      expect(container.textContent).toContain("等待后台解析");
    } finally {
      vi.useRealTimers();
    }
  });
  it("keeps the selected student and feedback, then opens the report list after generation", async () => {
    vi.useFakeTimers();
    try {
      const originalGet = api.get.getMockImplementation()!;
      api.get.mockImplementation(async (url: string) => {
        if (url === "/api/pet-points")
          return { students: [{ id: "student", name: "示例学生", classId: "class", className: "示例班", score: 0 }] };
        return originalGet(url);
      });
      api.post.mockImplementation(async (url: string, data: { courseScope?: string }) => {
        if (url.endsWith("preview-input")) return { scoreSummaries: [] };
        if (url.endsWith("preview-scope"))
          return {
            courseScope: data.courseScope,
            totalPages: 1,
            documents: [],
            learningContents: [],
            totalLearningContents: 0
          };
        return {
          reports: [
            {
              id: "report",
              studentName: "示例学生",
              className: "示例班",
              period: "month",
              status: "queued",
              content: null
            }
          ]
        };
      });
      await render();
      act(() => button("填写报告").click());
      act(() => container.querySelector<HTMLInputElement>('input[aria-label="选择 示例班 示例学生"]')!.click());
      const input = container.querySelector<HTMLTextAreaElement>('textarea[placeholder^="本周期已授课范围"]')!;
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "第3页");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => vi.advanceTimersByTimeAsync(450));
      const feedback = container.querySelector<HTMLTextAreaElement>('textarea[placeholder^="填写实际观察与鼓励话语"]')!;
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(feedback, "能主动参与讨论");
        feedback.dispatchEvent(new Event("input", { bubbles: true }));
      });
      act(() => button("课程资料").click());
      act(() => button("填写报告").click());
      expect(container.querySelector<HTMLInputElement>('input[aria-label="选择 示例班 示例学生"]')!.checked).toBe(true);
      expect(input.value).toBe("第3页");
      expect(feedback.value).toBe("能主动参与讨论");
      const generate = [...container.querySelectorAll("button")].find(button =>
        button.textContent?.includes("生成 1 份报告")
      )!;
      expect(generate.disabled).toBe(false);
      await act(async () => generate.click());
      expect(button("报告列表").getAttribute("aria-pressed")).toBe("true");
      expect(container.querySelector('[role="status"]')?.textContent).toContain("已提交 1 份报告");
      expect(api.post.mock.calls.at(-1)?.[1]).toMatchObject({
        studentIds: ["student"],
        courseScope: "第3页",
        studentFeedback: [{ studentId: "student", teacherMessage: "能主动参与讨论" }]
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["v1", "v2"] as const)(
    "%s photo failures preserve the draft and successful upload replaces only the photo",
    async version => {
      const originalGet = api.get.getMockImplementation()!;
      const report = {
        id: "report",
        reportVersion: version,
        studentName: "示例学生",
        className: "一班",
        status: "draft",
        period: "term",
        content: {
          reportVersion: version,
          summary: "寄语",
          courseOverview: "课程",
          strengths: [],
          areasToImprove: [],
          homeSuggestions: [],
          limitations: [],
          classroomPhoto: "data:image/png;base64,old"
        }
      };
      api.get.mockImplementation(async (url: string) => {
        if (url.endsWith("/reports")) return [report];
        if (url.endsWith("/reports/report")) return report;
        if (url.endsWith("/events")) return [];
        return originalGet(url);
      });
      await act(async () => root.render(<SemesterReports version={version} />));
      await act(async () => button("预览 / 编辑").click());
      const message = document
        .querySelector('[role="dialog"]')!
        .querySelector<HTMLTextAreaElement>('textarea[aria-label="老师想对你说"]')!;
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(message, "未保存寄语");
        message.dispatchEvent(new Event("input", { bubbles: true }));
      });
      const input = document.querySelector<HTMLInputElement>('input[aria-label="上传课堂照片"]')!;
      const filePicker = vi.spyOn(input, "click");
      act(() => button("更换课堂照片").click());
      expect(filePicker).toHaveBeenCalledOnce();
      const upload = async (file: File) => {
        Object.defineProperty(input, "files", { configurable: true, value: [file] });
        await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
      };
      await upload(new File(["svg"], "photo.svg", { type: "image/svg+xml" }));
      expect(document.body.textContent).toContain("最大 2MB");
      const callsBeforeOversize = api.post.mock.calls.length;
      await upload(new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }));
      expect(api.post.mock.calls).toHaveLength(callsBeforeOversize);
      api.post.mockRejectedValueOnce(new Error("上传失败"));
      await upload(new File(["png"], "photo.png", { type: "image/png" }));
      expect(document.body.textContent).toContain("上传失败");
      expect(document.querySelector<HTMLImageElement>('img[alt="示例学生的课堂照片"]')?.src).toContain("base64,old");
      api.post.mockResolvedValueOnce({
        ...report,
        content: { ...report.content, classroomPhoto: "data:image/png;base64,new" }
      });
      const boundaryFile = new File([new Uint8Array(2 * 1024 * 1024)], "photo.png", { type: "image/png" });
      await upload(boundaryFile);
      expect(api.post).toHaveBeenCalledWith(
        "/api/semester-reports/reports/report/classroom-photo",
        expect.any(FormData),
        expect.objectContaining({ headers: { "Content-Type": undefined } })
      );
      expect((api.post.mock.calls.at(-1)![1] as FormData).get("file")).toBe(boundaryFile);
      expect(document.querySelector<HTMLImageElement>('img[alt="示例学生的课堂照片"]')?.src).toContain("base64,new");
      expect(
        document
          .querySelector('[role="dialog"]')!
          .querySelector<HTMLTextAreaElement>('textarea[aria-label="老师想对你说"]')?.value
      ).toBe("未保存寄语");
      api.delete.mockResolvedValueOnce({ ...report, content: { ...report.content, classroomPhoto: null } });
      await act(async () => button("移除课堂照片").click());
      filePicker.mockClear();
      act(() => button("上传课堂照片").click());
      expect(filePicker).toHaveBeenCalledOnce();
      expect(input.classList.contains("hidden")).toBe(true);
      await act(async () => button("保存草稿").click());
      expect(api.patch.mock.calls.at(-1)?.[1].content.summary).toBe("未保存寄语");
      expect(api.patch.mock.calls.at(-1)?.[1].content).not.toHaveProperty("classroomPhoto");
    }
  );

  it("hides all curriculum controls in v2 while preserving saved content", async () => {
    const report = publishedReport(false);
    report.status = "draft";
    Object.assign(report, { reportVersion: "v2" });
    Object.assign(report.content, {
      reportVersion: "v2",
      strengths: [{ text: "保留的旧亮点", sourceRefs: ["teacher-input"] }],
      learningContents: [
        {
          id: "manual-one",
          section: "科学 · 教师填写",
          text: "观察叶子",
          mastery: "mastered",
          sourceRefs: ["teacher-course:science"]
        },
        {
          id: "pdf-one",
          section: "英语 · Unit1",
          text: "跟读英语",
          mastery: "practicing",
          sourceRefs: ["course:doc:p1"]
        }
      ]
    });
    await act(async () => root.render(<SemesterReports version="v2" />));
    await act(async () => button("预览 / 编辑").click());
    const modal = document.querySelector('[role="dialog"]')!;
    expect(modal.querySelector('[aria-label="科学 · 教师填写 学习内容 1 掌握情况"]')).toBeNull();
    expect(modal.querySelector('[aria-label="英语 · Unit1 学习内容 2 掌握情况"]')).toBeNull();
    expect(modal.textContent).not.toContain("本期最值得肯定");
    expect(modal.textContent).not.toContain("保留的旧亮点");
    expect(modal.textContent).toContain("下一步重点");
    api.patch.mockRejectedValueOnce(new Error("保存失败"));
    await act(async () => button("保存草稿").click());
    expect(modal.textContent).not.toContain("观察叶子");
    expect(api.patch.mock.calls.at(-1)![1].content.strengths).toEqual(report.content.strengths);
    expect(api.patch.mock.calls.at(-1)![1].content.learningContents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "manual-one", text: "观察叶子", mastery: "mastered" }),
        expect.objectContaining({ id: "pdf-one", mastery: "practicing" })
      ])
    );
  });

  it.each([
    ["v1", "week", "本周"],
    ["v1", "month", "本月"],
    ["v1", "term", "本学期"],
    ["v2", "week", "本周"],
    ["v2", "month", "本月"],
    ["v2", "term", "本学期"]
  ] as const)("uses the edited %s report's %s period for headings", async (version, period, title) => {
    const originalGet = api.get.getMockImplementation()!;
    const report = {
      id: "report",
      reportVersion: version,
      studentName: "小明",
      className: "一班",
      period,
      status: "draft",
      termId: "term",
      subjectId: "subject",
      content: {
        summary: "原寄语",
        courseOverview: "课程",
        strengths: [],
        areasToImprove: [],
        homeSuggestions: [],
        limitations: [],
        reportVersion: version
      }
    };
    api.get.mockImplementation(async (url: string) => {
      if (url.endsWith("/reports")) return [structuredClone(report)];
      if (url.endsWith("/reports/report")) return structuredClone(report);
      return originalGet(url);
    });
    await act(async () => root.render(<SemesterReports version={version} />));
    // Keep the composer on a different period so its selection cannot mask a stale editor title.
    const composerPeriod = container.querySelector<HTMLSelectElement>('[aria-label="报告周期"]')!;
    act(() => {
      composerPeriod.value = period === "week" ? "month" : "week";
      composerPeriod.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => button("预览 / 编辑").click());
    const modal = document.querySelector('[role="dialog"]')!;
    const headings = () => [...modal.querySelectorAll("h3")].map(heading => heading.textContent);
    expect(headings()).toContain(`${title}的课堂表现`);
    if (version === "v1") expect(headings()).toContain(`${title}学习内容与掌握`);
    api.patch.mockRejectedValueOnce(new Error("保存失败"));
    await act(async () => button("保存草稿").click());
    expect(modal.textContent).toContain("保存失败");
    expect(headings()).toContain(`${title}的课堂表现`);
    expect(api.patch.mock.calls.at(-1)![1].content.summary).toBe("原寄语");
  });

  it("adds and removes draft subjects, preserving unsaved edits and allowing retries", async () => {
    const originalGet = api.get.getMockImplementation()!;
    const oldGoal = {
      id: "old",
      section: "英语",
      text: "原英语内容",
      mastery: "mastered",
      sourceRefs: ["course:en-doc:p1"]
    };
    const report = {
      id: "report",
      reportVersion: "v2",
      studentName: "小明",
      className: "一班",
      period: "term",
      termId: "term",
      status: "draft",
      courseSelections: [{ subjectId: "english", courseScope: "", manualContent: "" }],
      content: {
        summary: "原寄语",
        courseOverview: "课程",
        strengths: [],
        areasToImprove: [],
        homeSuggestions: [],
        limitations: [],
        reportVersion: "v2",
        learningContents: [oldGoal],
        reportSubjects: [{ subjectId: "english", name: "英语" }],
        classroomPerformance: [{ subjectId: "english", text: "课堂参与 · 主动参与", sourceRefs: ["teacher-input"] }]
      }
    };
    api.get.mockImplementation(async url => {
      if (url.endsWith("/report-subjects"))
        return [
          { id: "english", name: "英语" },
          { id: "math", name: "数学" }
        ];
      if (url.endsWith("/course-documents"))
        return [
          { id: "math-doc", subjectId: "math", termId: "term", status: "ready", units: ["Unit1"], fileName: "Math.pdf" }
        ];
      if (url.endsWith("/reports")) return [report];
      if (url.endsWith("/reports/report")) return report;
      if (url.endsWith("/events")) return [];
      return originalGet(url);
    });
    await act(async () => root.render(<SemesterReports version="v2" />));
    await act(async () => button("预览 / 编辑").click());
    const modal = document.querySelector('[role="dialog"]')!;
    expect(modal.querySelector('[aria-label="选择英语课程"]')).toBeNull();
    const message = [...modal.querySelectorAll<HTMLTextAreaElement>("textarea")].find(
      input => input.value === "原寄语"
    )!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(message, "未保存寄语");
      message.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => modal.querySelector<HTMLInputElement>('[aria-label="选择数学课程"]')!.click());
    api.post.mockRejectedValueOnce(new Error("添加失败"));
    await act(async () => button("添加到当前报告").click());
    expect(modal.textContent).toContain("添加失败");
    expect(message.value).toBe("未保存寄语");
    api.post.mockResolvedValueOnce({
      ...report,
      subjectName: "英语、数学",
      courseSelections: [...report.courseSelections, { subjectId: "math", courseScope: "" }],
      content: {
        ...report.content,
        reportSubjects: [
          { subjectId: "english", name: "英语" },
          { subjectId: "math", name: "数学" }
        ],
        learningContents: [
          oldGoal,
          {
            id: "math-goal",
            section: "数学",
            text: "新增数学内容",
            mastery: "unassessed",
            sourceRefs: ["course:math-doc:p1"]
          }
        ]
      }
    });
    await act(async () => button("添加到当前报告").click());
    expect(api.post).toHaveBeenLastCalledWith("/api/semester-reports/reports/report/course-subjects", {
      courseSelections: [{ subjectId: "math", courseScope: "", manualContent: "" }]
    });
    expect(modal.querySelector('[aria-label="选择数学课程"]')).toBeNull();
    expect(modal.textContent).toContain("所有学科均已添加到当前报告");
    expect(modal.textContent).not.toContain("新增数学内容");
    expect(modal.querySelector<HTMLInputElement>('[aria-label="英语 课堂参与"]')!.value).toBe("主动参与");
    const mathPerformance = modal.querySelector<HTMLSelectElement>('[aria-label="数学 课堂参与"]')!;
    expect(mathPerformance.value).toBe("");
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(mathPerformance, "需要鼓励");
      mathPerformance.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(message.value).toBe("未保存寄语");
    api.delete.mockRejectedValueOnce(new Error("删除失败"));
    await act(async () => modal.querySelector<HTMLButtonElement>('[aria-label="删除数学学科"]')!.click());
    expect(modal.textContent).toContain("删除失败");
    expect(mathPerformance.value).toBe("需要鼓励");
    expect(modal.textContent).not.toContain("新增数学内容");
    expect(message.value).toBe("未保存寄语");
    api.delete.mockResolvedValueOnce({
      report: { ...report, subjectName: "英语", content: { ...report.content, learningContents: [oldGoal] } },
      removedReferences: ["course:math-doc:p1"]
    });
    await act(async () => modal.querySelector<HTMLButtonElement>('[aria-label="删除数学学科"]')!.click());
    expect(api.delete).toHaveBeenLastCalledWith("/api/semester-reports/reports/report/course-subjects/math");
    expect(modal.textContent).not.toContain("新增数学内容");
    expect(modal.querySelector('[aria-label="选择数学课程"]')).not.toBeNull();
    expect(modal.querySelector<HTMLButtonElement>('[aria-label="删除英语学科"]')!.disabled).toBe(true);
    expect(message.value).toBe("未保存寄语");
    await act(async () => button("保存草稿").click());
    expect(modal.querySelector('[aria-label="数学 课堂参与"]')).toBeNull();
    expect(api.patch.mock.calls.at(-1)![1].content).toMatchObject({
      classroomPerformance: [{ subjectId: "english", text: "课堂参与 · 主动参与", sourceRefs: ["teacher-input"] }],
      summary: "未保存寄语",
      learningContents: [expect.objectContaining({ id: "old", mastery: "mastered" })]
    });
  });

  it.each(["v1", "v2"] as const)(
    "shows Chinese history and cancels only the restore confirmation with Escape (%s)",
    async version => {
      const report = publishedReport(false);
      report.status = "draft";
      Object.assign(report, { reportVersion: version });
      const previousGet = api.get.getMockImplementation()!;
      api.get.mockImplementation(async (url: string) => {
        if (url.endsWith("/events"))
          return [{ id: "edit", label: "编辑报告草稿", action: "draft-edited", createdAt: "2026-10-11T00:00:00Z" }];
        if (url.endsWith("/events/edit"))
          return {
            id: "edit",
            label: "编辑报告草稿",
            createdAt: "2026-10-11T00:00:00Z",
            description: "已保存报告版本",
            currentVersion: "current",
            canRestoreBefore: true,
            canRestoreAfter: true,
            changes: [{ field: "老师寄语", before: "恢复前寄语", after: report.content.summary }]
          };
        return previousGet(url);
      });
      await act(async () => root.render(<SemesterReports version={version} />));
      await act(async () => button("预览 / 编辑").click());
      await act(async () => button("查看记录").click());
      expect(document.body.textContent).toContain("编辑报告草稿");
      expect(document.body.textContent).not.toContain("draft-edited");
      await act(async () => button("恢复修改前").click());
      expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2);
      act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
      expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
      expect(document.body.textContent).toContain("报告草稿");
      expect(api.post).not.toHaveBeenCalled();
      await act(async () => button("恢复修改前").click());
      api.post.mockResolvedValueOnce({ ...report, content: { ...report.content, summary: "恢复前寄语" } });
      await act(async () => button("确认恢复").click());
      const modal = document.querySelector('[role="dialog"]')!;
      expect(
        [...modal.querySelectorAll<HTMLTextAreaElement>("textarea")].some(input => input.value === "恢复前寄语")
      ).toBe(true);
      expect(modal.textContent).toContain("历史版本已恢复为草稿");
    }
  );

  it.each(["v1", "v2"] as const)(
    "keeps draft interactions inside the modal instead of refocusing the desktop (%s)",
    async version => {
      const report = publishedReport(false);
      report.status = "draft";
      Object.assign(report, { reportVersion: version });
      // AppWindow raises its composited layer on bubbling mouse-down events.
      const focusDesktop = vi.fn();
      await act(async () =>
        root.render(
          <div onMouseDown={focusDesktop}>
            <SemesterReports version={version} />
          </div>
        )
      );
      await act(async () => button("预览 / 编辑").click());
      const modal = document.querySelector('[role="dialog"]')!;
      const input = modal.querySelector<HTMLTextAreaElement>('textarea[aria-label="老师想对你说"]')!;
      act(() => {
        input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        input.focus();
        input.dispatchEvent(new Event("scroll", { bubbles: true }));
      });
      expect(focusDesktop).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(input);
      expect(document.querySelector('[role="dialog"]')).toBe(modal);
      act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
      expect(document.querySelector('[role="dialog"]')).toBeNull();
    }
  );

  it("does not jump back to the header when a draft update succeeds or fails", async () => {
    const report = publishedReport(false);
    report.status = "draft";
    report.content = {
      ...report.content,
      classroomPhoto: { dataUrl: "data:image/png;base64,test" }
    } as typeof report.content;
    await render();
    await act(async () => button("预览 / 编辑").click());
    const modal = document.querySelector('[role="dialog"]')!;
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    api.delete.mockRejectedValueOnce(new Error("照片移除失败"));
    await act(async () => button("移除课堂照片").click());
    expect(modal.textContent).toContain("照片移除失败");
    expect(focus).not.toHaveBeenCalled();
    api.delete.mockResolvedValueOnce({ ...report, content: { ...report.content, classroomPhoto: null } });
    await act(async () => button("移除课堂照片").click());
    expect(modal.textContent).toContain("课堂照片已移除");
    expect(focus).not.toHaveBeenCalled();
    focus.mockRestore();
  });

  it.each(["v1", "v2"] as const)(
    "restores a published history version into the editable draft in %s",
    async version => {
      const report = publishedReport();
      Object.assign(report, { reportVersion: version });
      const previousGet = api.get.getMockImplementation()!;
      api.get.mockImplementation(async (url: string) => {
        if (url.endsWith("/events")) return [{ id: "edit", label: "编辑报告草稿", createdAt: "2026-10-11T00:00:00Z" }];
        if (url.endsWith("/events/edit"))
          return {
            id: "edit",
            label: "编辑报告草稿",
            createdAt: "2026-10-11T00:00:00Z",
            description: "已保存报告版本",
            currentVersion: "current",
            canRestoreAfter: true,
            canRestoreBefore: false,
            changes: []
          };
        return previousGet(url);
      });
      await act(async () => root.render(<SemesterReports version={version} />));
      await act(async () => button("查看流程").click());
      expect(document.querySelector('[role="dialog"]')!.textContent).toContain("报告内容与流程");
      await act(async () => button("查看记录").click());
      await act(async () => button("恢复为草稿").click());
      api.post.mockImplementationOnce(async () => {
        report.status = "draft";
        report.share = null;
        report.content.summary = "恢复的历史内容";
        return structuredClone(report);
      });
      await act(async () => button("确认恢复").click());
      const modal = document.querySelector('[role="dialog"]')!;
      expect(modal.textContent).toContain("报告草稿");
      expect(modal.textContent).toContain("分享链接已失效");
      expect(
        [...modal.querySelectorAll<HTMLTextAreaElement>("textarea")].some(input => input.value === "恢复的历史内容")
      ).toBe(true);
      expect(button("保存草稿")).toBeTruthy();
    }
  );

  it.each(["v1", "v2"] as const)("shows the saved edit time after each report status in %s", async version => {
    const report = publishedReport(false);
    report.status = "draft";
    Object.assign(report, { reportVersion: version, updatedAt: "2026-10-11T08:09:10Z" });
    await act(async () => root.render(<SemesterReports version={version} />));
    const status = container.querySelector("article time")!;
    expect(status).toBeTruthy();
    expect(status.getAttribute("datetime")).toBe("2026-10-11T08:09:10Z");
    expect(status.textContent).toBe("2026/10/11 16:09:10");
    expect(status.parentElement!.textContent).toContain("待审核 · 编辑时间：2026/10/11 16:09:10");
  });
  it.each([undefined, null, "invalid"])(
    "handles unavailable edit timestamps without displaying an invalid date (%s)",
    async updatedAt => {
      const report = publishedReport(false);
      Object.assign(report, { updatedAt });
      await render();
      expect(container.querySelector("article")!.textContent).toContain("编辑时间：暂无记录");
      expect(container.querySelector("article time")).toBeNull();
      expect(container.textContent).not.toContain("Invalid Date");
    }
  );

  it.each(["v1", "v2"] as const)(
    "refreshes the server edit time after saving and retains it on failure in %s",
    async version => {
      const report = Object.assign(publishedReport(false), {
        reportVersion: version,
        updatedAt: "2026-10-11T08:09:10Z"
      });
      report.status = "draft";
      await act(async () => root.render(<SemesterReports version={version} />));
      await act(async () => button("预览 / 编辑").click());
      api.patch.mockRejectedValueOnce(new Error("保存失败，请重试"));
      await act(async () => button("保存草稿").click());
      expect(document.querySelector('[role="dialog"]')!.textContent).toContain("保存失败，请重试");
      expect(container.querySelector("article time")!.textContent).toBe("2026/10/11 16:09:10");
      api.patch.mockImplementationOnce(async () => {
        report.updatedAt = "2026-10-11T16:00:00Z";
        return structuredClone(report);
      });
      await act(async () => button("保存草稿").click());
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(container.querySelector("article time")!.textContent).toBe("2026/10/12 00:00:00");
      expect(container.querySelector("article time")!.getAttribute("datetime")).toBe(report.updatedAt);
    }
  );

  it("refreshes draft item counts without replacing unsaved prose, and keeps old counts on errors", async () => {
    vi.useFakeTimers();
    try {
      const report = publishedReport(false);
      report.status = "draft";
      Object.assign(report, { reportVersion: "v2" });
      Object.assign(report.content, {
        reportVersion: "v2",
        scoreDetails: {
          positive: 1,
          negative: 0,
          net: 1,
          count: 1,
          records: [],
          positiveItems: [{ label: "认真听讲", count: 1 }]
        }
      });
      await act(async () => root.render(<SemesterReports version="v2" />));
      await act(async () => button("预览 / 编辑").click());
      const input = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="老师想对你说"]')!;
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "未保存寄语");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      Object.assign(report.content, {
        summary: "服务端旧寄语",
        scoreDetails: {
          positive: 10,
          negative: 0,
          net: 10,
          count: 2,
          records: [],
          positiveItems: [{ label: "乐于助人", count: 2 }]
        }
      });
      await act(async () => vi.advanceTimersByTimeAsync(5000));
      expect(input.value).toBe("未保存寄语");
      act(() => button("查看报告模板").click());
      expect(document.querySelector('[aria-label="加分细项次数柱状图：乐于助人 2 次"]')).not.toBeNull();
      const originalGet = api.get.getMockImplementation()!;
      api.get.mockImplementation(async (url: string, config: unknown) => {
        if (url.endsWith("/reports/report")) throw new Error("读取积分失败");
        return originalGet(url, config);
      });
      await act(async () => vi.advanceTimersByTimeAsync(5000));
      expect(document.querySelector('[role="dialog"]')!.textContent).toContain("积分统计刷新失败");
      expect(document.querySelector('[aria-label="加分细项次数柱状图：乐于助人 2 次"]')).not.toBeNull();
      api.get.mockImplementation(originalGet);
      await act(async () => vi.advanceTimersByTimeAsync(5000));
      expect(document.querySelector('[role="dialog"]')!.textContent).not.toContain("积分统计刷新失败");
      await act(async () => button("保存草稿").click());
      expect(api.patch.mock.calls.at(-1)![1].content.summary).toBe("未保存寄语");
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores late draft score responses after closing and never polls a published report", async () => {
    vi.useFakeTimers();
    try {
      const report = publishedReport(false);
      report.status = "draft";
      Object.assign(report, { reportVersion: "v2" });
      Object.assign(report.content, { reportVersion: "v2" });
      const originalGet = api.get.getMockImplementation()!;
      let complete: ((value: unknown) => void) | undefined;
      let polling = false;
      api.get.mockImplementation((url: string, config?: { params?: { refresh?: string } }) => {
        if (polling && url.endsWith("/reports/report") && config?.params?.refresh)
          return new Promise(resolve => {
            complete = resolve;
          });
        return originalGet(url, config);
      });
      await act(async () => root.render(<SemesterReports version="v2" />));
      await act(async () => button("预览 / 编辑").click());
      polling = true;
      await act(async () => vi.advanceTimersByTimeAsync(5000));
      expect(complete).toBeDefined();
      act(() => button("关闭").click());
      await act(async () => complete!({ ...report, content: { ...report.content, summary: "迟到寄语" } }));
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      const calls = api.get.mock.calls.length;
      await act(async () => vi.advanceTimersByTimeAsync(5000));
      expect(api.get.mock.calls).toHaveLength(calls);
      polling = false;
      report.status = "published";
      await act(async () => button("预览 / 编辑").click());
      const publishedCalls = api.get.mock.calls.length;
      await act(async () => vi.advanceTimersByTimeAsync(10000));
      expect(api.get.mock.calls).toHaveLength(publishedCalls);
    } finally {
      vi.useRealTimers();
    }
  });

  it("saves cleared v2 message and focus as empty values and hides both in preview", async () => {
    const report = publishedReport(false);
    report.status = "draft";
    Object.assign(report, { reportVersion: "v2" });
    Object.assign(report.content, {
      reportVersion: "v2",
      areasToImprove: [{ text: "练习表达", sourceRefs: ["teacher-review"] }]
    });
    await act(async () => root.render(<SemesterReports version="v2" />));
    await act(async () => button("预览 / 编辑").click());
    const modal = document.querySelector('[role="dialog"]')!;
    const focus = [...modal.querySelectorAll("section")]
      .find(section => section.querySelector("h3")?.textContent === "下一步重点")!
      .querySelector("textarea")!;
    const message = modal.querySelector<HTMLTextAreaElement>('textarea[aria-label="老师想对你说"]')!;
    act(() => {
      for (const input of [focus, message]) {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    act(() => button("查看报告模板").click());
    expect(modal.querySelector("article")!.textContent).not.toContain("老师想对你说");
    expect(modal.querySelector("article")!.textContent).not.toContain("下一步重点");
    api.patch.mockRejectedValueOnce(new Error("保存失败"));
    await act(async () => button("保存草稿").click());
    expect(api.patch.mock.calls.at(-1)![1].content).toMatchObject({ summary: "", areasToImprove: [] });
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => button("保存草稿").click());
    expect(api.patch.mock.calls.at(-1)![1].content).toMatchObject({ summary: "", areasToImprove: [] });
  });

  it("uploads and removes the second photo independently while preserving the first and unsaved text", async () => {
    const report = publishedReport(false);
    report.status = "draft";
    Object.assign(report, { reportVersion: "v2" });
    Object.assign(report.content, {
      reportVersion: "v2",
      classroomPhoto: "first-photo",
      classroomPhotos: ["first-photo", null]
    });
    await act(async () => root.render(<SemesterReports version="v2" />));
    await act(async () => button("预览 / 编辑").click());
    const message = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="老师想对你说"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(message, "未保存寄语");
      message.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const input = document.querySelector<HTMLInputElement>('input[aria-label="上传第二张课堂照片"]')!;
    const upload = async (file: File) => {
      Object.defineProperty(input, "files", { configurable: true, value: [file] });
      await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    };
    const before = api.post.mock.calls.length;
    await upload(new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }));
    expect(api.post).toHaveBeenCalledTimes(before);
    api.post.mockResolvedValueOnce({
      ...report,
      content: { ...report.content, classroomPhotos: ["first-photo", "second-photo"] }
    });
    const file = new File(["png"], "second.png", { type: "image/png" });
    await upload(file);
    expect(api.post).toHaveBeenCalledWith(
      "/api/semester-reports/reports/report/classroom-photo?slot=1",
      expect.any(FormData),
      expect.anything()
    );
    expect(document.querySelector<HTMLImageElement>('img[alt="示例学生的课堂照片"]')!.getAttribute("src")).toBe(
      "first-photo"
    );
    expect(document.querySelector<HTMLImageElement>('img[alt="示例学生的第二张课堂照片"]')!.getAttribute("src")).toBe(
      "second-photo"
    );
    api.delete.mockResolvedValueOnce({
      ...report,
      content: { ...report.content, classroomPhotos: ["first-photo", null] }
    });
    await act(async () => button("移除第二张课堂照片").click());
    expect(api.delete).toHaveBeenCalledWith("/api/semester-reports/reports/report/classroom-photo?slot=1");
    expect(document.querySelector('img[alt="示例学生的第二张课堂照片"]')).toBeNull();
    expect(document.querySelector<HTMLImageElement>('img[alt="示例学生的课堂照片"]')!.getAttribute("src")).toBe(
      "first-photo"
    );
    await act(async () => button("保存草稿").click());
    expect(api.patch.mock.calls.at(-1)![1].content).not.toHaveProperty("classroomPhotos");
    expect(api.patch.mock.calls.at(-1)![1].content.summary).toBe("未保存寄语");
  });

  it("limits each photo caption to ten characters and preserves edits on failure and independent removal", async () => {
    const report = publishedReport(false);
    report.status = "draft";
    Object.assign(report, { reportVersion: "v2" });
    Object.assign(report.content, {
      reportVersion: "v2",
      classroomPhoto: "first-photo",
      classroomPhotos: ["first-photo", "second-photo"],
      classroomPhotoCaptions: ["", ""]
    });
    await act(async () => root.render(<SemesterReports version="v2" />));
    await act(async () => button("预览 / 编辑").click());
    const first = document.querySelector<HTMLInputElement>('[aria-label="照片 1说明"]')!;
    const second = document.querySelector<HTMLInputElement>('[aria-label="照片 2说明"]')!;
    const type = (input: HTMLInputElement, value: string) =>
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    type(first, "字".repeat(11));
    type(second, "课堂游戏");
    expect(first.value).toBe("字".repeat(10));
    act(() => button("查看报告模板").click());
    expect(document.querySelectorAll("article figcaption")[0]!.textContent).toBe(first.value);
    expect(document.querySelectorAll("article figcaption")[1]!.textContent).toBe("课堂游戏");
    api.patch.mockRejectedValueOnce(new Error("保存失败"));
    await act(async () => button("保存草稿").click());
    expect(first.value).toBe("字".repeat(10));
    expect(second.value).toBe("课堂游戏");
    expect(api.patch.mock.calls.at(-1)![1].content.classroomPhotoCaptions).toEqual(["字".repeat(10), "课堂游戏"]);
    api.delete.mockResolvedValueOnce({
      ...report,
      content: { ...report.content, classroomPhotos: ["first-photo", null], classroomPhotoCaptions: ["", ""] }
    });
    await act(async () => button("移除第二张课堂照片").click());
    expect(document.querySelector('[aria-label="照片 2说明"]')).toBeNull();
    expect(first.value).toBe("字".repeat(10));
    await act(async () => button("保存草稿").click());
    expect(api.patch.mock.calls.at(-1)![1].content.classroomPhotoCaptions).toEqual(["字".repeat(10), ""]);
  });

  function publishedReport(hasShare = true) {
    const originalGet = api.get.getMockImplementation()!;
    const report = {
      id: "report",
      studentName: "示例学生",
      className: "示例班",
      termId: "term",
      subjectId: "subject",
      status: "published",
      period: "month",
      start: "2026-09-01",
      end: "2026-09-30",
      content: {
        summary: "原来的老师寄语",
        courseOverview: "本期阅读",
        strengths: [],
        areasToImprove: [],
        homeSuggestions: [],
        limitations: []
      },
      share: hasShare ? { id: "share", url: "https://example.test/r/old-link" } : null
    };
    api.get.mockImplementation(async (url: string) => {
      if (url.endsWith("/reports")) return [structuredClone(report)];
      if (url.endsWith("/reports/report")) return structuredClone(report);
      if (url.endsWith("/reports/report/events")) return [];
      return originalGet(url);
    });
    const withdraw = async () => {
      report.status = "draft";
      report.share = null;
      return { revoked: true, status: "draft" };
    };
    api.delete.mockImplementation(withdraw);
    api.post.mockImplementation(withdraw);
    api.patch.mockResolvedValue({});
    return report;
  }

  it("revokes the link and opens an editable draft with the existing content", async () => {
    publishedReport();
    await render();
    await act(async () => button("撤销链接并编辑").click());
    expect(api.delete).toHaveBeenCalledWith("/api/semester-reports/reports/report/shares/share");
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain("报告草稿");
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain("分享链接已撤销");
    expect(container.querySelector('input[aria-label="示例学生 的家长链接"]')).toBeNull();
    const input = [...document.body.querySelectorAll("textarea")].find(element => element.value === "原来的老师寄语")!;
    expect(input.readOnly).toBe(false);
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "修改后的老师寄语");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("保存草稿").click());
    expect(api.patch).toHaveBeenCalledWith("/api/semester-reports/reports/report/draft", {
      content: expect.objectContaining({ summary: "修改后的老师寄语" })
    });
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it("opens image generation beside the copy-link action for a published report", async () => {
    const report = publishedReport();
    report.share!.url = `https://example.test/r/${"A".repeat(43)}`;
    const publicFetch = vi.fn(() => new Promise(() => undefined));
    vi.stubGlobal("fetch", publicFetch);
    await render();
    act(() => button("报告列表").click());
    expect(button("复制链接")).toBeTruthy();
    button("生成报告图片").focus();
    await act(async () => button("生成报告图片").click());
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain("示例学生 · 报告图片");
    expect(publicFetch).toHaveBeenCalledWith(
      `/api/public-reports/${"A".repeat(43)}`,
      expect.objectContaining({ cache: "no-store" })
    );
    expect(api.post).not.toHaveBeenCalled();
    act(() => button("关闭").click());
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(button("生成报告图片"));
  });

  it("reopens an older published report whose link was already revoked", async () => {
    publishedReport(false);
    await render();
    await act(async () => button("重新编辑").click());
    expect(api.post).toHaveBeenCalledWith("/api/semester-reports/reports/report/unpublish");
    expect(api.delete).not.toHaveBeenCalled();
    expect(button("保存草稿")).toBeTruthy();
  });

  it("keeps a publication locked if revoking is rejected", async () => {
    publishedReport();
    api.delete.mockRejectedValueOnce(new Error("无权限撤销该报告"));
    await render();
    await act(async () => button("撤销链接并编辑").click());
    expect(container.querySelector('[role="status"]')?.textContent).toContain("无权限撤销");
    expect(container.querySelector('input[aria-label="示例学生 的家长链接"]')).not.toBeNull();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("does not open a new publication for editing after a stale revoke request", async () => {
    publishedReport();
    api.delete.mockResolvedValueOnce({ revoked: true, status: "published" });
    await render();
    await act(async () => button("撤销链接并编辑").click());
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('input[aria-label="示例学生 的家长链接"]')).not.toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("报告状态已更新");
  });

  it("fetches fresh report state when a recent published preview is still cached", async () => {
    const report = publishedReport();
    const old = structuredClone(report);
    const originalGet = api.get.getMockImplementation()!;
    api.get.mockImplementation(async (url: string, options?: { params?: unknown }) => {
      if (!options?.params && url.endsWith("/reports/report")) return old;
      if (!options?.params && url.endsWith("/reports")) return [old];
      return originalGet(url, options);
    });
    await render();
    await act(async () => button("查看流程").click());
    act(() => button("关闭").click());
    await act(async () => button("撤销链接并编辑").click());
    expect(button("保存草稿")).toBeTruthy();
    expect(container.querySelector('input[aria-label="示例学生 的家长链接"]')).toBeNull();
  });

  it("keeps the reopened draft accessible when loading the editor fails", async () => {
    publishedReport();
    const originalGet = api.get.getMockImplementation()!;
    api.get.mockImplementation(async (url: string) => {
      if (url.endsWith("/reports/report")) throw new Error("报告正文加载失败，请重试");
      return originalGet(url);
    });
    await render();
    await act(async () => button("撤销链接并编辑").click());
    expect(container.querySelector('[role="status"]')?.textContent).toContain("正文加载失败");
    expect(button("预览 / 编辑")).toBeTruthy();
    expect(container.querySelector('input[aria-label="示例学生 的家长链接"]')).toBeNull();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });
});
