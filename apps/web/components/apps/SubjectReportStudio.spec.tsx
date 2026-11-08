// 覆盖学科报告向导、设置、历史报告保留及组件身份回归。
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SubjectReportStudio } from "./SubjectReportStudio";

const { apiMock, mockRequest } = vi.hoisted(() => {
  const apiMock = vi.fn();
  const mockRequest = Object.assign((...args: unknown[]) => apiMock(...args), {
    get: (url: string, config?: unknown) => apiMock(url, { method: "GET", ...(config as object) }),
    post: (url: string, data?: unknown, config?: unknown) =>
      apiMock(url, { method: "POST", data, ...(config as object) }),
    patch: (url: string, data?: unknown, config?: unknown) =>
      apiMock(url, { method: "PATCH", data, ...(config as object) }),
    delete: (url: string, config?: unknown) => apiMock(url, { method: "DELETE", ...(config as object) })
  });
  return { apiMock, mockRequest };
});
vi.mock("@/lib/request", () => ({
  default: mockRequest
}));

describe("SubjectReportStudio", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

    apiMock.mockImplementation(async (url: string, options?: { method?: string; data?: { courseScope?: string } }) => {
      if (url.includes("/api/subject-reports/report-terms")) {
        return [{ id: "term-1", name: "2026秋季学期", startDate: "2026-09-01", endDate: "2027-01-20" }];
      }
      if (url.includes("/api/subject-reports/report-subjects")) {
        if (options?.method === "POST") return { id: "sub-3", name: "戏剧" };
        if (options?.method === "PATCH") return { id: "sub-3", name: "戏剧", performanceConfig: [] };
        return [
          { id: "sub-1", name: "英语" },
          { id: "sub-2", name: "语文" }
        ];
      }
      if (url === "/api/pet-points") {
        return {
          students: [
            { id: "s1", name: "小宇", className: "启航班", score: 10 },
            { id: "s2", name: "乐乐", className: "启航班", score: 8 }
          ]
        };
      }
      if (url.endsWith("/preview-scope")) {
        if (options?.data?.courseScope === "Unit2") {
          return { learningContents: [{ section: "核心句型", text: "What animal is it?" }] };
        }
        return {
          learningContents: [
            { section: "核心词汇", text: "red, blue" },
            { section: "核心句型", text: "What colour is it?" },
            { section: "课堂练习", text: "Match the colours" },
            { text: "附录原文" }
          ]
        };
      }
      if (url.includes("/api/subject-reports/course-documents")) {
        return [
          {
            id: "doc-1",
            termId: "term-1",
            subjectId: "sub-1",
            fileName: "英语教材.pdf",
            status: "ready",
            units: ["Unit1", "Unit2"]
          }
        ];
      }
      if (url.endsWith("/reports/preview-input")) {
        return { scoreSummaries: [{ studentId: "s1", count: 0 }], petPreviews: [] };
      }
      if (url.includes("/api/subject-reports/reports")) {
        if (url.endsWith("subjectId=sub-2")) return [];
        return [
          {
            id: "rep-1",
            studentId: "s1",
            studentName: "学生",
            className: "默认班级",
            subjectName: "英语",
            subjectId: "sub-1",
            termId: "term-1",
            period: "week",
            status: "draft",
            startDate: "2026-10-01",
            endDate: "2026-10-07",
            content: { summary: "表现良好", courseContent: "颜色词汇" }
          }
        ];
      }
      return [];
    });

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    localStorage.clear();
  });

  it("renders header and switches tabs between reports, compose, and library", async () => {
    await act(async () => {
      root.render(<SubjectReportStudio />);
    });

    expect(container.textContent).toContain("学科报告工作台");
    expect(container.textContent).toContain("报告管理与分发");
    expect(container.textContent).toContain("填写与生成报告");
    expect(container.textContent).toContain("学期学科设置与课程资料");

    // Initially on reports tab
    expect(container.textContent).toContain("小宇 · 启航班");
    expect(container.textContent).toContain("待审核");

    // Click "填写与生成报告"
    const composeBtn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("填写与生成报告")
    );
    expect(composeBtn).toBeTruthy();

    await act(async () => {
      composeBtn?.click();
    });

    expect(container.textContent).toContain("步骤 1：报告周期与基础信息配置");

    // Click "学期学科设置与课程资料"
    const libraryBtn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("学期学科设置与课程资料")
    );
    expect(libraryBtn).toBeTruthy();

    await act(async () => {
      libraryBtn?.click();
    });

    expect(container.textContent).toContain("学期设置");
    expect(container.textContent).toContain("学科设置");
    expect(container.textContent).toContain("英语教材.pdf");
  });

  it("defaults the reporting period to the current Monday through Friday across months", async () => {
    vi.setSystemTime(new Date(2026, 9, 1, 12));
    try {
      await act(async () => root.render(<SubjectReportStudio />));
      const compose = [...container.querySelectorAll("button")].find(button =>
        button.textContent?.includes("填写与生成报告")
      )!;
      await act(async () => compose.click());
      const dates = [...container.querySelectorAll<HTMLInputElement>('input[type="date"]')];
      expect(dates.slice(0, 2).map(input => input.value)).toEqual(["2026-09-28", "2026-10-02"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the shared wizard steps and PDF upload panel", async () => {
    await act(async () => root.render(<SubjectReportStudio />));
    const button = (label: string) =>
      [...container.querySelectorAll("button")].find(item => item.textContent?.includes(label))!;
    await act(async () => button("填写与生成报告").click());
    const steps = container.querySelector('nav[aria-label="报告填写步骤"]')!;
    expect(steps.querySelector('[aria-current="step"]')?.textContent).toContain("周期与基础");
    expect(button("4. 课堂评价与生成").disabled).toBe(true);
    expect(button("周报").getAttribute("aria-pressed")).toBe("true");
    await act(async () => button("学期学科设置与课程资料").click());
    const file = container.querySelector('input[aria-label="选择课程 PDF"]')!;
    expect(file.closest("label")?.textContent).toContain("上传后自动解析，核对章节后用于报告");
    expect(file.closest("label")?.classList.contains("border-dashed")).toBe(true);
    expect(container.querySelector('section[aria-label="配置学科课堂表现"]')).toBeTruthy();
  });

  it("renders both configurations with unique keys and resets title edits when switching subjects", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await act(async () => root.render(<SubjectReportStudio />));
      const settings = [...container.querySelectorAll("button")].find(
        button => button.textContent?.trim() === "学期学科设置与课程资料"
      )!;
      await act(async () => settings.click());
      const titles = () => container.querySelectorAll('section[aria-label="配置学科课程内容标题"]');
      expect(titles()).toHaveLength(1);
      const add = [...titles()[0]!.querySelectorAll("button")].find(button => button.textContent === "新增标题")!;
      await act(async () => add.click());
      expect(titles()[0]!.querySelectorAll("input")).toHaveLength(5);
      const subject = container.querySelector<HTMLSelectElement>('select[aria-label="配置学科切换"]')!;
      await act(async () => {
        subject.value = "sub-2";
        subject.dispatchEvent(new Event("change", { bubbles: true }));
      });
      expect(titles()).toHaveLength(1);
      expect(titles()[0]!.querySelectorAll("input")).toHaveLength(4);
      expect(container.querySelectorAll('button[aria-label^="删除课堂表现项目 "]').length).toBeGreaterThan(0);
      expect(error.mock.calls.filter(args => args.some(value => String(value).includes("same key")))).toEqual([]);
    } finally {
      error.mockRestore();
    }
  });

  it("filters reports by subject without displaying storage details", async () => {
    await act(async () => root.render(<SubjectReportStudio />));
    expect(container.textContent).not.toContain("subject_report");
    const subject = container.querySelector<HTMLSelectElement>('select[aria-label="学科筛选"]')!;
    expect(subject).toBeTruthy();
    await act(async () => {
      subject.value = "sub-1";
      subject.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(apiMock.mock.calls.some(([url]) => url === "/api/subject-reports/reports?subjectId=sub-1")).toBe(true);
    expect(container.textContent).toContain("小宇");
    await act(async () => {
      subject.value = "sub-2";
      subject.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.textContent).not.toContain("小宇");
  });

  it("adds a subject using the server response and saves its performance configuration", async () => {
    await act(async () => root.render(<SubjectReportStudio />));
    const button = (label: string) =>
      [...container.querySelectorAll("button")].find(item => item.textContent?.includes(label))!;
    await act(async () => button("学期学科设置与课程资料").click());
    const name = container.querySelector<HTMLInputElement>('input[aria-label="新建学科"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(name, "戏剧");
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("添加学科").click());
    expect(apiMock).toHaveBeenCalledWith("/api/subject-reports/report-subjects", {
      method: "POST",
      data: { name: "戏剧", termId: "term-1" }
    });
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="配置学科切换"]')?.value).toBe("sub-3");
    const remove = container.querySelector<HTMLButtonElement>('button[aria-label^="删除课堂表现项目 "]')!;
    await act(async () => remove.click());
    expect(
      apiMock.mock.calls.some(([url, options]) => url.endsWith("/performance-config") && options?.method === "PATCH")
    ).toBe(false);
    await act(async () => button("保存课堂表现配置").click());
    expect(apiMock).toHaveBeenCalledWith("/api/subject-reports/report-subjects/sub-3/performance-config", {
      method: "PATCH",
      data: { performanceConfig: expect.arrayContaining([expect.objectContaining({ label: "听指令反应" })]) }
    });
  });

  it("places term deletion in the term calendar separately from subject settings", async () => {
    await act(async () => root.render(<SubjectReportStudio />));
    const library = [...container.querySelectorAll("button")].find(
      item => item.textContent?.trim() === "学期学科设置与课程资料"
    )!;
    await act(async () => library.click());
    const terms = container.querySelector('section[aria-label="学期设置"]');
    const subjects = container.querySelector('section[aria-label="学科设置"]');
    expect(terms).toBeTruthy();
    expect(subjects).toBeTruthy();
    expect(terms?.querySelector('button[aria-label="删除学期 2026秋季学期"]')?.parentElement?.textContent).toContain(
      "2026-09-01 至 2027-01-20"
    );
    expect(subjects?.querySelector('button[aria-label^="删除学期"]')).toBeNull();
    expect(terms?.querySelector('button[aria-label^="删除学科"]')).toBeNull();
    expect(container.querySelectorAll('button[aria-label="删除学期 2026秋季学期"]')).toHaveLength(1);
  });

  it("deletes a term after confirmation and keeps existing reports", async () => {
    await act(async () => root.render(<SubjectReportStudio />));
    const button = (label: string) =>
      [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === label)!;
    await act(async () => button("学期学科设置与课程资料").click());
    const remove = () => container.querySelector<HTMLButtonElement>('button[aria-label="删除学期 2026秋季学期"]')!;
    await act(async () => remove().click());
    expect(apiMock).not.toHaveBeenCalledWith("/api/subject-reports/report-terms/term-1", { method: "DELETE" });
    await act(async () => button("取消").click());
    expect(remove()).toBeTruthy();
    await act(async () => remove().click());
    await act(async () => button("删除学期").click());
    expect(apiMock).toHaveBeenCalledWith("/api/subject-reports/report-terms/term-1", { method: "DELETE" });
    expect(remove()).toBeNull();
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="课程学期"]')?.value ?? "").toBe("");
    await act(async () => button("报告管理与分发").click());
    expect(container.textContent).toContain("小宇 · 启航班");
    expect(container.textContent).toContain("待审核");
  });

  it("keeps the term available when deletion fails", async () => {
    const original = apiMock.getMockImplementation()!;
    apiMock.mockImplementation((url: string, options?: { method?: string }) => {
      if (url.endsWith("/report-terms/term-1") && options?.method === "DELETE")
        return Promise.reject(new Error("offline"));
      return original(url, options);
    });
    await act(async () => root.render(<SubjectReportStudio />));
    const button = (label: string) =>
      [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === label)!;
    await act(async () => button("学期学科设置与课程资料").click());
    await act(async () =>
      container.querySelector<HTMLButtonElement>('button[aria-label="删除学期 2026秋季学期"]')!.click()
    );
    await act(async () => button("删除学期").click());
    expect(container.querySelector('button[aria-label="删除学期 2026秋季学期"]')).toBeTruthy();
    expect(container.textContent).toContain("删除学期失败");
  });

  it("confirms subject deletion and removes it from the settings", async () => {
    await act(async () => root.render(<SubjectReportStudio />));
    const button = (label: string) =>
      [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === label)!;
    await act(async () => button("学期学科设置与课程资料").click());
    const remove = container.querySelector<HTMLButtonElement>('button[aria-label="删除学科 英语"]')!;
    await act(async () => remove.click());
    expect(apiMock).not.toHaveBeenCalledWith("/api/subject-reports/report-subjects/sub-1", { method: "DELETE" });
    await act(async () => button("删除学科").click());
    expect(apiMock).toHaveBeenCalledWith("/api/subject-reports/report-subjects/sub-1", { method: "DELETE" });
    expect(container.querySelector('button[aria-label="删除学科 英语"]')).toBeNull();
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="配置学科切换"]')?.value).toBe("sub-2");
  });

  it("switches PDF content for the selected lesson and preserves manual edits", async () => {
    await act(async () => root.render(<SubjectReportStudio />));
    const button = (label: string) =>
      [...container.querySelectorAll("button")].find(item => item.textContent?.includes(label))!;
    await act(async () => button("填写与生成报告").click());
    await act(async () => button("下一步").click());
    const manual = container.querySelector<HTMLTextAreaElement>("#subject-lesson-0-0")!;
    const sentence = container.querySelector<HTMLTextAreaElement>("#subject-lesson-0-1")!;
    const otherLesson = container.querySelector<HTMLTextAreaElement>("#subject-lesson-1-1")!;
    const scope = container.querySelector<HTMLSelectElement>('select[aria-label="选择 PDF 章节"]')!;
    expect(scope).toBeTruthy();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(manual, "已有词汇");
      manual.dispatchEvent(new Event("input", { bubbles: true }));
      scope.value = "Unit1";
      scope.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(apiMock).toHaveBeenCalledWith("/api/subject-reports/course-documents/preview-scope", {
      method: "POST",
      data: { termId: "term-1", subjectId: "sub-1", period: "week", reportVersion: "v1", courseScope: "Unit1" }
    });
    expect(manual.value).toBe("已有词汇");
    expect(sentence.value).toBe("What colour is it?");
    expect([...scope.options].map(option => option.value)).toEqual(["", "Unit1", "Unit2"]);
    expect(otherLesson.value).toBe("");
    expect(container.textContent).toContain("附录原文");
    const exercise = container.querySelector<HTMLTextAreaElement>("#subject-lesson-0-3")!;
    expect(exercise.value).toBe("Match the colours");
    await act(async () => {
      scope.value = "Unit2";
      scope.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(sentence.value).toBe("What animal is it?");
    expect(exercise.value).toBe("");
    expect(manual.value).toBe("已有词汇");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(sentence, "老师修改的句型");
      sentence.dispatchEvent(new Event("input", { bubbles: true }));
      scope.value = "Unit1";
      scope.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(sentence.value).toBe("老师修改的句型");
    expect(exercise.value).toBe("Match the colours");
    const pageRange = scope.closest(".grid")!.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(pageRange, "第3-5页");
      pageRange.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("填入本课内容").click());
    expect(apiMock).toHaveBeenLastCalledWith("/api/subject-reports/course-documents/preview-scope", {
      method: "POST",
      data: { termId: "term-1", subjectId: "sub-1", period: "week", reportVersion: "v1", courseScope: "第3-5页" }
    });
    const subject = container.querySelector<HTMLSelectElement>("#subject-report-course-subject")!;
    await act(async () => {
      subject.value = "sub-2";
      subject.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.querySelector('select[aria-label="选择 PDF 章节"]')).toBeNull();
    expect(exercise.value).toBe("");
    expect(container.textContent).toContain("该学期和学科暂无已确认的 PDF");
  });

  it("confirms batch publishing and uses the subject report endpoint", async () => {
    await act(async () => root.render(<SubjectReportStudio />));
    const select = container.querySelector<HTMLInputElement>('input[aria-label="选择 小宇 的报告"]')!;
    await act(async () => select.click());
    const publish = [...container.querySelectorAll("button")].find(item => item.textContent?.includes("批量发布草稿"))!;
    await act(async () => publish.click());
    expect(apiMock).not.toHaveBeenCalledWith("/api/subject-reports/reports/rep-1/publish", { method: "POST" });
    const confirm = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
      item => item.textContent === "发布"
    )!;
    await act(async () => confirm.click());
    expect(apiMock).toHaveBeenCalledWith("/api/subject-reports/reports/rep-1/publish", { method: "POST" });
  });

  it("shows a viewport notification when completing the only selected student", async () => {
    await act(async () => root.render(<SubjectReportStudio />));
    const button = (label: string) =>
      [...container.querySelectorAll("button")].find(item => item.textContent?.includes(label))!;
    await act(async () => button("填写与生成报告").click());
    await act(async () => button("3. 选择学生").click());
    await act(async () => button("小宇").click());
    await act(async () => button("4. 课堂评价与生成").click());
    await act(async () => button("保存并切换下一位学生").click());
    const notification = [...container.querySelectorAll('[role="status"]')].find(item =>
      item.textContent?.includes("已经完成全部学生的报告填写，请点击确认生成草稿")
    )!;
    expect(notification).toBeTruthy();
    expect(notification.classList.contains("fixed")).toBe(true);
    expect(container.textContent).toContain("1 / 1 已评价");
  });

  it("previews the period and sends each student's completed evaluation in the generation request", async () => {
    await act(async () => root.render(<SubjectReportStudio />));
    const button = (label: string) =>
      [...container.querySelectorAll("button")].find(item => item.textContent?.includes(label))!;
    const fill = async (field: HTMLInputElement | HTMLTextAreaElement, value: string) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value")!.set!.call(field, value);
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    await act(async () => button("填写与生成报告").click());
    await act(async () => button("2. 学科与内容来源").click());
    await fill(container.querySelector<HTMLTextAreaElement>("#subject-lesson-0-0")!, "课堂阅读");
    const pdf = container.querySelector<HTMLSelectElement>('[aria-label="选择 PDF 章节"]')!;
    await act(async () => {
      pdf.value = "Unit1";
      pdf.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => button("3. 选择学生").click());
    await act(async () => button("全选本班").click());
    await act(async () => button("4. 课堂评价与生成").click());
    expect(apiMock).toHaveBeenCalledWith(
      "/api/subject-reports/reports/preview-input",
      expect.objectContaining({
        method: "POST",
        data: expect.objectContaining({ subjectId: "sub-1", studentIds: ["s1", "s2"] })
      })
    );
    expect(container.textContent).toContain("本周期暂无加分记录");
    const attendance = container.querySelector<HTMLSelectElement>('select:has(option[value="excused"])')!;
    expect(attendance.value).toBe("present");
    await act(async () => {
      attendance.value = "late";
      attendance.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => button("主动参与").click());
    await fill(
      container.querySelector<HTMLTextAreaElement>('[aria-label="学习准备与课堂能力"]')!,
      "能独立准备学习用品"
    );
    await act(async () => button("添加重点建议").click());
    await fill(container.querySelector<HTMLInputElement>('[aria-label="重点建议 1"]')!, "每天朗读五分钟");
    await act(async () => button("保存并切换下一位学生").click());
    expect(container.textContent).toContain("已暂存「小宇」的完整课堂反馈，已切换到下一位");
    expect(container.textContent).toContain("1 / 2 已评价");
    await act(async () => button("保存并切换下一位学生").click());
    expect(container.textContent).toContain("已经完成全部学生的报告填写，请点击确认生成草稿");
    expect(container.textContent).toContain("2 / 2 已评价");
    expect(button("主动参与").getAttribute("aria-checked")).toBe("false");
    await act(async () => button("小宇").click());
    expect(button("主动参与").getAttribute("aria-checked")).toBe("true");
    await act(async () => button("确认生成 2 份报告草稿").click());
    expect(apiMock).toHaveBeenCalledWith(
      "/api/subject-reports/reports/generate",
      expect.objectContaining({
        method: "POST",
        data: expect.objectContaining({
          studentFeedback: [
            expect.objectContaining({
              studentId: "s1",
              attendance: "late",
              attendances: ["late", "present"],
              nextFocus: "每天朗读五分钟",
              growthAssessment: expect.objectContaining({ learningReadiness: "能独立准备学习用品" }),
              classroomPerformance: [{ subjectId: "sub-1", label: "课堂参与", value: "主动参与" }]
            }),
            expect.objectContaining({
              studentId: "s2",
              attendance: "present",
              attendances: ["present", "present"],
              classroomPerformance: []
            })
          ]
        })
      })
    );
    await act(async () => button("新建学科报告").click());
    await act(async () => button("2. 学科与内容来源").click());
    expect(container.querySelector<HTMLTextAreaElement>("#subject-lesson-0-0")?.value).toBe("");
    expect(container.querySelector<HTMLTextAreaElement>("#subject-lesson-0-1")?.value).toBe("");
    expect(container.querySelector<HTMLSelectElement>('[aria-label="选择 PDF 章节"]')?.value).toBe("");
    await act(async () => button("3. 选择学生").click());
    await act(async () => button("全选本班").click());
    await act(async () => button("4. 课堂评价与生成").click());
    expect(button("主动参与").getAttribute("aria-checked")).toBe("false");
  });

  it("changes attendance from the subject report draft editor", async () => {
    await act(async () => root.render(<SubjectReportStudio />));
    const button = (label: string) =>
      [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === label)!;
    await act(async () => button("预览/微调").click());
    const attendance = document.querySelector<HTMLSelectElement>('select:has(option[value="excused"])')!;
    expect(attendance.value).toBe("present");
    await act(async () => {
      attendance.value = "excused";
      attendance.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => button("保存草稿").click());
    expect(apiMock).toHaveBeenCalledWith("/api/subject-reports/reports/rep-1/draft", {
      method: "PATCH",
      data: { content: expect.objectContaining({ attendance: "excused", attendances: ["excused"] }) }
    });
  });

  it("edits and saves multiline course content from a subject report draft", async () => {
    await act(async () => root.render(<SubjectReportStudio />));
    const button = (label: string) =>
      [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === label)!;
    await act(async () => button("预览/微调").click());
    const field = document.querySelector<HTMLTextAreaElement>("#subject-draft-course-content")!;
    expect(field.value).toBe("颜色词汇");
    const courseContent = "颜色词汇\n复习颜色句型";
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, courseContent);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("保存草稿").click());
    expect(apiMock).toHaveBeenCalledWith("/api/subject-reports/reports/rep-1/draft", {
      method: "PATCH",
      data: { content: expect.objectContaining({ courseContent }) }
    });
  });

  it("edits and saves courseScope and nextWeekContent in subject report draft editor", async () => {
    await act(async () => root.render(<SubjectReportStudio />));
    const button = (label: string) =>
      [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === label)!;
    await act(async () => button("预览/微调").click());

    const scopeInput = document.querySelector<HTMLInputElement>(
      'input[placeholder="例如：Unit 1 单词复习与句型对话"]'
    )!;
    const nextTextarea = document.querySelector<HTMLTextAreaElement>(
      'textarea[placeholder="例如：继续巩固颜色与数字表达，开展课堂情景剧..."]'
    )!;

    expect(scopeInput).not.toBeNull();
    expect(nextTextarea).not.toBeNull();
    expect(scopeInput.value).toBe("");
    expect(nextTextarea.value).toBe("");

    // Live preview initially does not have these sections
    expect(document.querySelector('[aria-label="授课范围备注"]')).toBeNull();
    expect(document.querySelector('[aria-label="下周教学内容重点"]')).toBeNull();

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        scopeInput,
        "Unit 1 单词复习与句型对话"
      );
      scopeInput.dispatchEvent(new Event("input", { bubbles: true }));

      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
        nextTextarea,
        "下周进入 Unit 2 重点句型"
      );
      nextTextarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // Live preview updates immediately
    expect(document.querySelector('[aria-label="授课范围备注"]')?.textContent).toContain("Unit 1 单词复习与句型对话");
    expect(document.querySelector('[aria-label="下周教学内容重点"]')?.textContent).toContain(
      "下周进入 Unit 2 重点句型"
    );

    await act(async () => button("保存草稿").click());
    expect(apiMock).toHaveBeenCalledWith("/api/subject-reports/reports/rep-1/draft", {
      method: "PATCH",
      data: {
        content: expect.objectContaining({
          courseScope: "Unit 1 单词复习与句型对话",
          nextWeekContent: "下周进入 Unit 2 重点句型"
        })
      }
    });
  });

  it("imports draft course content by chapter or page and keeps existing text", async () => {
    await act(async () => root.render(<SubjectReportStudio />));
    const button = (label: string) =>
      [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === label)!;
    await act(async () => button("预览/微调").click());
    const select = document.querySelector<HTMLSelectElement>('[aria-label="选择 PDF 章节"]')!;
    await act(async () => {
      select.value = "Unit2";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const field = document.querySelector<HTMLTextAreaElement>("#subject-draft-course-content")!;
    const sentence = document.querySelector<HTMLTextAreaElement>("#subject-draft-course-content-1")!;
    expect(sentence.value).toBe("What animal is it?");
    const pages = document.querySelector<HTMLInputElement>('input[placeholder="例如：第3-5页"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(pages, "第3-5页");
      pages.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("填入本课内容").click());
    expect(apiMock).toHaveBeenCalledWith("/api/subject-reports/reports/rep-1/course-documents/preview-scope", {
      method: "POST",
      data: { courseScope: "第3-5页" }
    });
    expect(field.value).toContain("颜色词汇");
    expect(sentence.value).toBe("What colour is it?");
    const courseContent = expect.stringContaining("核心句型 / 对话：What colour is it?");
    await act(async () => button("保存草稿").click());
    expect(apiMock).toHaveBeenCalledWith("/api/subject-reports/reports/rep-1/draft", {
      method: "PATCH",
      data: { content: expect.objectContaining({ courseContent }) }
    });
  });

  it("edits both saved lessons when legacy attendance contains only one entry", async () => {
    const original = apiMock.getMockImplementation()!;
    apiMock.mockImplementation(async (url, options) => {
      const result = await original(url, options);
      if (url === "/api/subject-reports/reports" && Array.isArray(result)) {
        return result.map(report => ({
          ...report,
          content: {
            ...report.content,
            attendance: "late",
            attendances: ["late"],
            courseContent: "第 1 节课 · 核心词汇：red\n第 2 节课 · 核心词汇：cat"
          }
        }));
      }
      return result;
    });
    await act(async () => root.render(<SubjectReportStudio />));
    const button = (label: string) =>
      [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === label)!;
    await act(async () => button("预览/微调").click());
    expect(document.querySelector<HTMLTextAreaElement>("#subject-draft-course-content-0")?.value).toBe("red");
    const second = document.querySelector<HTMLTextAreaElement>("#subject-draft-course-content-2-0")!;
    expect(second.value).toBe("cat");
    expect(document.querySelectorAll('select:has(option[value="excused"])')).toHaveLength(2);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(second, "dog");
      second.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("保存草稿").click());
    expect(apiMock).toHaveBeenCalledWith("/api/subject-reports/reports/rep-1/draft", {
      method: "PATCH",
      data: {
        content: expect.objectContaining({
          courseContent: "第 1 节课 · 核心词汇：red\n第 2 节课 · 核心词汇：dog",
          attendances: ["late", "late"]
        })
      }
    });
  });

  it("supports adding and updating multiple lesson attendances in draft editor", async () => {
    await act(async () => root.render(<SubjectReportStudio />));
    const button = (label: string) =>
      [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === label)!;
    await act(async () => button("预览/微调").click());

    const addSessionBtn = [...document.querySelectorAll("button")].find(item => item.textContent?.includes("添加课程"));
    expect(addSessionBtn).toBeTruthy();
    await act(async () => addSessionBtn?.click());

    const selectors = document.querySelectorAll<HTMLSelectElement>('select:has(option[value="excused"])');
    expect(selectors.length).toBe(2);
    const fields = [
      ...document.querySelectorAll<HTMLTextAreaElement>('textarea[id^="subject-draft-course-content-2-"]')
    ];
    expect(fields.map(field => field.placeholder)).toEqual([
      "填写核心词汇...",
      "填写核心句型 / 对话...",
      "填写朗读或表达...",
      "填写课堂练习与任务..."
    ]);
    const lesson = fields[0]!;
    expect(lesson.value).toBe("");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(lesson, "动物词汇");
      lesson.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // Set first to excused, second to late
    await act(async () => {
      selectors[0]!.value = "excused";
      selectors[0]!.dispatchEvent(new Event("change", { bubbles: true }));
      selectors[1]!.value = "late";
      selectors[1]!.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => button("保存草稿").click());
    expect(apiMock).toHaveBeenCalledWith("/api/subject-reports/reports/rep-1/draft", {
      method: "PATCH",
      data: {
        content: expect.objectContaining({
          attendance: "excused",
          attendances: ["excused", "late"],
          courseContent: "颜色词汇\n第 2 节课 · 核心词汇：动物词汇"
        })
      }
    });
  });

  it("aligns course content structure with add wizard: titles, lesson count, delete button, and word count", async () => {
    await act(async () => root.render(<SubjectReportStudio />));
    const button = (label: string) =>
      [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === label)!;
    await act(async () => button("预览/微调").click());

    // Section title and explanation
    expect(document.body.textContent).toContain("课程内容");
    expect(document.body.textContent).toContain("逐课次手填内容或从已确认的课程 PDF 带入");

    // Lesson 1 heading
    expect(document.body.textContent).toContain("第 1 节课教学内容");

    // Lesson count input
    const lessonCountInput = document.querySelector<HTMLInputElement>('input[aria-label="本周课程次数"]');
    expect(lessonCountInput).not.toBeNull();
    expect(lessonCountInput?.value).toBe("1");

    // No delete button when there is only 1 lesson
    expect(document.querySelector('button[aria-label="删除第 1 节课"]')).toBeNull();

    // Change lesson count to 2 via the number input
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(lessonCountInput, "2");
      lessonCountInput!.dispatchEvent(new Event("input", { bubbles: true }));
      lessonCountInput!.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // Lesson 2 card heading appears
    expect(document.body.textContent).toContain("第 2 节课教学内容");

    // Delete buttons now appear for multi-lesson cards
    const deleteBtn = document.querySelector<HTMLButtonElement>('button[aria-label="删除第 2 节课"]');
    expect(deleteBtn).not.toBeNull();
    expect(deleteBtn?.textContent).toContain("删除此课");

    // Delete lesson 2
    await act(async () => {
      deleteBtn!.click();
    });

    expect(document.body.textContent).not.toContain("第 2 节课教学内容");
    expect(document.querySelector<HTMLInputElement>('input[aria-label="本周课程次数"]')?.value).toBe("1");
  });

  it("routes classroom photo upload and removal to /api/subject-reports instead of semester-reports", async () => {
    const original = apiMock.getMockImplementation()!;
    apiMock.mockImplementation(async (url, options) => {
      const result = await original(url, options);
      if (url === "/api/subject-reports/reports" && Array.isArray(result)) {
        return result.map(report => ({
          ...report,
          content: {
            ...report.content,
            classroomPhotos: ["data:image/png;base64,aaa", "data:image/png;base64,bbb"]
          }
        }));
      }
      return result;
    });

    await act(async () => root.render(<SubjectReportStudio />));
    const button = (label: string) =>
      [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === label)!;
    await act(async () => button("预览/微调").click());

    // Both photo slots have "删除" buttons
    const deletePhotoBtns = [...document.querySelectorAll("button")].filter(btn => btn.textContent?.trim() === "删除");
    expect(deletePhotoBtns.length).toBe(2);

    // Delete slot 1 photo
    await act(async () => {
      deletePhotoBtns[1]!.click();
    });

    // Verify it sent DELETE to /api/subject-reports
    expect(apiMock).toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/subject-reports\/reports\/rep-1\/classroom-photo\?slot=1/),
      expect.objectContaining({ method: "DELETE" })
    );

    // Now upload to slot 0
    const fileInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"][accept*="image"]');
    expect(fileInputs.length).toBeGreaterThanOrEqual(2);

    const file = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "photo0.png", {
      type: "image/png"
    });

    await act(async () => {
      Object.defineProperty(fileInputs[0]!, "files", {
        value: [file]
      });
      fileInputs[0]!.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // Verify it posted to /api/subject-reports, NOT /api/semester-reports
    expect(apiMock).toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/subject-reports\/reports\/rep-1\/classroom-photo$/),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("shows published report actions, flow and a separate parent link row", async () => {
    const original = apiMock.getMockImplementation()!;
    apiMock.mockImplementation(async (url, options) => {
      const result = await original(url, options);
      return url === "/api/subject-reports/reports" && Array.isArray(result)
        ? result.map(report => ({
            ...report,
            status: "published",
            share: { url: "/r/subject/test-token" },
            content: {
              summary: "本期表现出色",
              reportSubjects: [{ subjectId: "sub-1", name: "英语" }],
              attendances: ["present"]
            }
          }))
        : result;
    });
    await act(async () => root.render(<SubjectReportStudio />));
    const button = (label: string) =>
      [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === label)!;
    expect(button("查看流程")).toBeTruthy();
    expect(button("报告图片")).toBeTruthy();
    expect(button("撤销")).toBeTruthy();
    const link = container.querySelector<HTMLInputElement>('input[aria-label="家长访问链接"]')!;
    expect(link.value).toBe("/r/subject/test-token");
    expect(link.parentElement?.textContent).toContain("复制链接");

    // 点击查看流程：与学期报告工作台一致打开报告内容与流程弹窗
    await act(async () => button("查看流程").click());
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain("报告内容与流程");
    expect(dialog.textContent).toContain("已发布 (公开)");
    const reportH1 = dialog.querySelector("article header h1");
    expect(reportH1?.textContent?.replace(/\s+/g, " ").trim()).toBe("小宇 · 课堂成长记录");
    expect(dialog.querySelector("article header p.font-semibold")).toBeNull();
    expect(button("关闭")).toBeTruthy();
    expect(button("保存草稿")).toBeFalsy();
    expect(button("审核通过并发布")).toBeFalsy();

    // 支持通过键盘 Escape 或关闭按钮安全关闭弹窗
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("creates a missing share from the copy action without publishing again", async () => {
    const original = apiMock.getMockImplementation()!;
    apiMock.mockImplementation(async (url, options) => {
      if (url.endsWith("/shares")) return { url: "/r/subject/new-token", shareId: "share-1" };
      const result = await original(url, options);
      return url === "/api/subject-reports/reports" && Array.isArray(result)
        ? result.map(report => ({ ...report, status: "published", share: null }))
        : result;
    });
    await act(async () => root.render(<SubjectReportStudio />));
    const copy = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("复制链接"))!;
    await act(async () => copy.click());
    expect(apiMock).toHaveBeenCalledWith("/api/subject-reports/reports/rep-1/shares", { method: "POST" });
    expect(apiMock.mock.calls.some(([url]) => url.endsWith("/publish"))).toBe(false);
  });

  it("confirms deletion before sending the request", async () => {
    await act(async () => root.render(<SubjectReportStudio />));
    const remove = container.querySelector<HTMLButtonElement>('button[aria-label="删除"]');
    expect(remove).toBeTruthy();
    await act(async () => remove?.click());
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("确认删除该学科报告");
    const confirm = Array.from(dialog?.querySelectorAll("button") ?? []).find(
      button => button.textContent === "确认删除"
    );
    await act(async () => confirm?.click());
    expect(apiMock).toHaveBeenCalledWith("/api/subject-reports/reports/rep-1", { method: "DELETE" });
  });

  it("sends the course PDF and selected scope as multipart data", async () => {
    await act(async () => root.render(<SubjectReportStudio />));
    const library = Array.from(container.querySelectorAll("button")).find(button =>
      button.textContent?.includes("学期学科设置与课程资料")
    );
    await act(async () => library?.click());
    const subject = [...container.querySelectorAll("select")].find(select =>
      select.parentElement?.textContent?.includes("课程学科")
    )!;
    await act(async () => {
      subject.value = "sub-2";
      subject.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).toBeTruthy();
    const file = new File(["sample"], "lesson.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { value: [file] });
    await act(async () => input?.dispatchEvent(new Event("change", { bubbles: true })));

    const upload = apiMock.mock.calls.find(
      ([url, options]) => url === "/api/subject-reports/course-documents" && options?.method === "POST"
    );
    expect(upload?.[1].data).toBeInstanceOf(FormData);
    expect(upload?.[1].data.get("file")).toBe(file);
    expect(upload?.[1].data.get("termId")).toBe("term-1");
    expect(upload?.[1].data.get("subjectId")).toBe("sub-2");
  });

  it("proceeds through wizard steps without local draft actions", async () => {
    await act(async () => {
      root.render(<SubjectReportStudio />);
    });

    // Switch to compose tab
    const composeBtn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("填写与生成报告")
    );
    await act(async () => {
      composeBtn?.click();
    });

    // Step 1 -> Next Step -> Step 2
    const nextBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("下一步"));
    expect(nextBtn).toBeTruthy();
    await act(async () => {
      nextBtn?.click();
    });

    expect(container.textContent).toContain("步骤 2：报告学科与教学内容");

    // Step 2 -> Next Step -> Step 3
    const nextBtn2 = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("下一步"));
    await act(async () => {
      nextBtn2?.click();
    });

    expect(container.textContent).toContain("步骤 3：挑选本次生成报告的学生");

    const actions = [...container.querySelectorAll("button")].map(button => button.textContent?.trim());
    expect(actions).toContain("上一步");
    expect(actions).not.toContain("暂存草稿");
    expect(actions).not.toContain("恢复草稿");
  });

  it("maps custom course content titles into draft editor fields and preserves them upon saving", async () => {
    apiMock.mockImplementation(async (url: string) => {
      if (url.includes("/api/subject-reports/report-terms")) {
        return [{ id: "term-1", name: "2026秋季学期", startDate: "2026-09-01", endDate: "2027-01-20" }];
      }
      if (url.includes("/api/subject-reports/report-subjects")) {
        return [
          { id: "sub-1", name: "英语", courseContentTitles: ["主题词汇", "重点句式", "拓展探究"] },
          { id: "sub-2", name: "语文" }
        ];
      }
      if (url === "/api/pet-points") {
        return { students: [{ id: "s1", name: "小宇", className: "启航班", score: 10 }] };
      }
      if (url.includes("/api/subject-reports/course-documents")) return [];
      if (url.includes("/api/subject-reports/reports")) {
        return [
          {
            id: "rep-custom-1",
            studentName: "小宇",
            className: "启航班",
            subjectName: "英语",
            subjectId: "sub-1",
            termId: "term-1",
            period: "week",
            status: "draft",
            startDate: "2026-10-01",
            endDate: "2026-10-07",
            content: {
              summary: "表现良好",
              courseContent:
                "第 1 节课 · 主题词汇：apple, banana\n第 1 节课 · 重点句式：I like apples.\n第 1 节课 · 拓展探究：Fruit facts"
            }
          }
        ];
      }
      return [];
    });

    await act(async () => root.render(<SubjectReportStudio />));
    const button = (label: string) =>
      [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === label)!;
    await act(async () => button("预览/微调").click());

    // Verify custom labels exist
    expect(document.querySelector('label[for="subject-draft-course-content-0"]')?.textContent).toBe("主题词汇");
    expect(document.querySelector('label[for="subject-draft-course-content-1"]')?.textContent).toBe("重点句式");
    expect(document.querySelector('label[for="subject-draft-course-content-2"]')?.textContent).toBe("拓展探究");

    // Verify values are mapped
    const field0 = document.querySelector<HTMLTextAreaElement>("#subject-draft-course-content-0")!;
    const field1 = document.querySelector<HTMLTextAreaElement>("#subject-draft-course-content-1")!;
    const field2 = document.querySelector<HTMLTextAreaElement>("#subject-draft-course-content-2")!;
    expect(field0.value).toBe("apple, banana");
    expect(field1.value).toBe("I like apples.");
    expect(field2.value).toBe("Fruit facts");

    // Edit field 1 and save
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field1, "I like oranges.");
      field1.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("保存草稿").click());

    expect(apiMock).toHaveBeenCalledWith("/api/subject-reports/reports/rep-custom-1/draft", {
      method: "PATCH",
      data: {
        content: expect.objectContaining({
          courseContent:
            "第 1 节课 · 主题词汇：apple, banana\n第 1 节课 · 重点句式：I like oranges.\n第 1 节课 · 拓展探究：Fruit facts"
        })
      }
    });
  });
});
