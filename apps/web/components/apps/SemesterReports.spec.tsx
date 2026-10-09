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
