import { Blob as NodeBlob } from "node:buffer";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BatchReportImageDialog } from "./BatchReportImageDialog";

const raster = vi.hoisted(() => ({ renderReportImage: vi.fn() }));
const api = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("./report-image", () => raster);
vi.mock("@/lib/request", () => ({ default: api }));
const rows = [0, 1].map(index => ({
  id: `report-${index}`,
  studentName: `学生${index}`,
  className: "一班",
  period: "week",
  status: "published",
  share: { url: `/r/${String(index).repeat(43)}` }
}));
const data = (name: string) => ({
  studentName: name,
  className: "一班",
  subject: "阅读",
  period: "week",
  term: "秋季",
  content: {
    summary: "已发布寄语",
    courseOverview: "阅读内容",
    strengths: [],
    areasToImprove: [],
    homeSuggestions: [],
    limitations: []
  }
});

describe("batch report image export", () => {
  let root: Root;
  let container: HTMLDivElement;
  const fetchReport = vi.fn();
  const close = vi.fn();
  const createUrl = vi.fn();
  const revokeUrl = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.stubGlobal("Blob", NodeBlob);
    fetchReport.mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => data(url.includes("000") ? "学生0" : "学生1")
    }));
    vi.stubGlobal("fetch", fetchReport);
    raster.renderReportImage.mockImplementation(
      async (element: HTMLElement) => new NodeBlob([element.textContent ?? "png"], { type: "image/png" })
    );
    createUrl.mockReturnValue("blob:zip");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeUrl });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
  async function render(reports = rows) {
    await act(async () => root.render(<BatchReportImageDialog reports={reports} onClose={close} />));
  }
  function button(text: string) {
    return [...document.body.querySelectorAll("button")].find(item => item.textContent === text)!;
  }
  it("renders each selected public report in order and offers one ZIP, with keyboard close and URL cleanup", async () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    await render();
    expect(fetchReport.mock.calls.map(call => call[0])).toEqual(
      rows.map(row => `/api/public-reports/${row.share.url.split("/").pop()}`)
    );
    expect(raster.renderReportImage).toHaveBeenCalledTimes(2);
    expect(createUrl.mock.calls[0]![0].type).toBe("application/zip");
    expect(document.body.querySelector("a[download]")?.textContent).toContain("下载 2 份图片 ZIP");
    expect(document.body.textContent).toContain("已生成 2 / 2");
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(close).toHaveBeenCalledTimes(1);
    act(() => root.render(null));
    expect(document.activeElement).toBe(trigger);
    expect(revokeUrl).toHaveBeenCalledWith("blob:zip");
    trigger.remove();
  });
  it("excludes revoked reports, states partial results and retries only failures", async () => {
    fetchReport.mockResolvedValueOnce({ ok: false, json: async () => ({ message: "报告链接已失效" }) });
    await render();
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain("学生0：报告链接已失效");
    expect(document.body.querySelector("a[download]")?.textContent).toContain("下载 1 份图片 ZIP");
    expect(raster.renderReportImage).toHaveBeenCalledTimes(1);
    await act(async () => button("重试失败项").click());
    expect(fetchReport).toHaveBeenCalledTimes(3);
    expect(raster.renderReportImage).toHaveBeenCalledTimes(2);
    expect(document.body.querySelector("a[download]")?.textContent).toContain("下载 2 份图片 ZIP");
  });
  it("rejects drafts and invalid URLs without fetching or exporting them", async () => {
    await render([
      { ...rows[0]!, status: "draft" },
      { ...rows[1]!, share: { url: "https://other.test/private" } }
    ]);
    expect(fetchReport).not.toHaveBeenCalled();
    expect(raster.renderReportImage).not.toHaveBeenCalled();
    expect(document.body.querySelector("a[download]")).toBeNull();
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain("请先发布报告");
  });
  it("ignores an in-flight render after cancellation", async () => {
    let finish!: (blob: Blob) => void;
    raster.renderReportImage.mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    await render();
    act(() => root.render(null));
    await act(async () => finish(new NodeBlob(["png"]) as Blob));
    expect(fetchReport).toHaveBeenCalledTimes(1);
    expect(createUrl).not.toHaveBeenCalled();
  });
  it("continues after a rendering error and creates a missing share only through the authenticated report endpoint", async () => {
    raster.renderReportImage.mockRejectedValueOnce(new Error("照片加载失败"));
    api.post.mockResolvedValue({ url: rows[1]!.share.url });
    await render([rows[0]!, { ...rows[1]!, share: null } as unknown as (typeof rows)[number]]);
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain("学生0：照片加载失败");
    expect(api.post).toHaveBeenCalledWith("/api/semester-reports/reports/report-1/shares");
    expect(document.body.querySelector("a[download]")?.textContent).toContain("下载 1 份图片 ZIP");
  });
  it("gives each report a fresh timeout and allows keyboard focus to wrap inside the dialog", async () => {
    vi.useFakeTimers();
    fetchReport.mockImplementationOnce(
      (_url: string, options: RequestInit) =>
        new Promise((_resolve, reject) =>
          options.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))
        )
    );
    try {
      await render();
      await act(async () => vi.advanceTimersByTimeAsync(30000));
      expect(document.body.querySelector('[role="alert"]')?.textContent).toContain("学生0：读取超时");
      expect(fetchReport.mock.calls[1]![1].signal.aborted).toBe(false);
      expect(document.body.querySelector("a[download]")?.textContent).toContain("下载 1 份图片 ZIP");
      const first = document.body.querySelector<HTMLButtonElement>('[aria-label="关闭批量导出窗口"]')!;
      first.focus();
      act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true })));
      expect(document.activeElement).toBe(button("关闭"));
      act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })));
      expect(document.activeElement).toBe(first);
    } finally {
      vi.useRealTimers();
    }
  });
});
