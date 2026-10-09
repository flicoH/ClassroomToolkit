import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportImageDialog } from "./ReportImageDialog";

const raster = vi.hoisted(() => ({ toBlob: vi.fn() }));
vi.mock("html-to-image", () => raster);
const token = "A".repeat(43);
const report = {
  studentName: "示例学生",
  className: "阅读班",
  subject: "阅读",
  term: "秋季",
  period: "month",
  content: {
    summary: "已发布的老师寄语",
    courseOverview: "阅读",
    strengths: [],
    areasToImprove: [],
    homeSuggestions: [],
    limitations: [],
    learningContents: [{ id: "lesson", section: "第一课", text: "完整学习内容", mastery: "mastered", sourceRefs: [] }],
    scoreDetails: {
      positive: 12,
      negative: 0,
      net: 12,
      count: 12,
      records: Array.from({ length: 12 }, (_, i) => ({ label: `评价 ${i + 1}`, delta: 1, createdAt: null }))
    }
  }
};

describe("published report image", () => {
  let root: Root;
  let container: HTMLDivElement;
  const close = vi.fn();
  const fetchReport = vi.fn();
  const write = vi.fn();
  const createUrl = vi.fn();
  const revokeUrl = vi.fn();
  const png = new Blob(["png"], { type: "image/png" });
  beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    fetchReport.mockResolvedValue({ ok: true, json: async () => report });
    vi.stubGlobal("fetch", fetchReport);
    raster.toBlob.mockResolvedValue(png);
    write.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { write } });
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(public data: Record<string, Blob>) {}
      }
    );
    createUrl.mockReturnValue("blob:report-image");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeUrl });
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(2400);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 720 } as DOMRect);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (navigator as { clipboard?: unknown }).clipboard;
  });
  async function render(url = `https://reports.example.test/r/${token}`) {
    await act(async () => root.render(<ReportImageDialog studentName="示例学生" shareUrl={url} onClose={close} />));
  }
  function button(text: string) {
    const element = [...document.body.querySelectorAll("button")].find(item => item.textContent?.trim() === text);
    expect(element).toBeTruthy();
    return element!;
  }
  it("uses the public link content, exports all score rows and copies a PNG", async () => {
    let finish!: (blob: Blob) => void;
    raster.toBlob.mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    await render();
    expect(fetchReport).toHaveBeenCalledWith(
      `/api/public-reports/${token}`,
      expect.objectContaining({ cache: "no-store" })
    );
    const node = raster.toBlob.mock.calls[0]![0] as HTMLElement;
    expect(node.textContent).toContain("已发布的老师寄语");
    expect(node.textContent).toContain("完整学习内容");
    expect(node.querySelectorAll("li")).toHaveLength(12);
    expect(node.querySelector("ul")?.className).not.toContain("max-h-72");
    expect(node.querySelector("button")).toBeNull();
    expect(button("复制图片").disabled).toBe(true);
    await act(async () => finish(png));
    expect(document.body.querySelector('img[alt="示例学生 的完整报告图片"]')?.getAttribute("src")).toBe(
      "blob:report-image"
    );
    await act(async () => button("复制图片").click());
    expect(write.mock.calls[0]![0][0].data["image/png"]).toBe(png);
    expect(document.body.querySelector('[role="status"]')?.textContent).toContain("图片已复制");
    expect(document.body.querySelector<HTMLAnchorElement>("a[download]")?.download).toContain("示例学生");
  });
  it("keeps download available after clipboard permission is denied", async () => {
    write.mockRejectedValue(new Error("NotAllowedError"));
    await render();
    await act(async () => button("复制图片").click());
    expect(document.body.querySelector('[role="status"]')?.textContent).toContain("浏览器未允许复制图片");
    expect(document.body.querySelector("a[download]")).not.toBeNull();
    expect(document.body.querySelector("img")).not.toBeNull();
  });
  it("offers a save fallback when image clipboard is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    await render();
    await act(async () => button("复制图片").click());
    expect(document.body.textContent).toContain("下载图片");
    expect(document.body.querySelector('[role="status"]')?.textContent).toContain("浏览器未允许复制图片");
    expect(write).not.toHaveBeenCalled();
  });
  it("does not export a revoked or expired report and supports retry", async () => {
    fetchReport.mockResolvedValueOnce({ ok: false, json: async () => ({ message: "报告链接无效或已失效" }) });
    await render();
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain("已失效");
    expect(raster.toBlob).not.toHaveBeenCalled();
    expect(document.body.querySelector("img")).toBeNull();
    await act(async () => button("重新生成").click());
    expect(document.body.querySelector("img")).not.toBeNull();
  });
  it("reports rendering failure and can generate again", async () => {
    raster.toBlob.mockRejectedValueOnce(new Error("图片生成失败"));
    await render();
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain("图片生成失败");
    await act(async () => button("重新生成").click());
    expect(document.body.querySelector("img")).not.toBeNull();
  });
  it("rejects unrelated URLs without fetching external pages", async () => {
    await render("https://other.example.test/private");
    expect(fetchReport).not.toHaveBeenCalled();
    expect(document.body.querySelector('[role="alert"]')).not.toBeNull();
  });
  it("closes with Escape, restores focus and releases the generated image", async () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    await render();
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(close).toHaveBeenCalledTimes(1);
    act(() => root.render(null));
    expect(document.activeElement).toBe(trigger);
    expect(revokeUrl).toHaveBeenCalledWith("blob:report-image");
    trigger.remove();
  });
  it("keeps Tab focus inside the image dialog", async () => {
    await render();
    const first = document.body.querySelector<HTMLButtonElement>('button[aria-label="关闭报告图片窗口"]')!;
    const last = button("关闭");
    first.focus();
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true })));
    expect(document.activeElement).toBe(last);
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })));
    expect(document.activeElement).toBe(first);
  });
  it("ignores rendering results after the dialog closes", async () => {
    let finish!: (blob: Blob) => void;
    raster.toBlob.mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    await render();
    act(() => root.render(null));
    await act(async () => finish(png));
    expect(createUrl).not.toHaveBeenCalled();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });
});
