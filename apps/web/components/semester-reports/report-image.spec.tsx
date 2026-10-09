import { afterEach, describe, expect, it, vi } from "vitest";
import { renderReportImage } from "./report-image";

const raster = vi.hoisted(() => ({ toBlob: vi.fn() }));
vi.mock("html-to-image", () => raster);

describe("full report rasterization", () => {
  afterEach(() => vi.resetAllMocks());
  function element(height: number) {
    const node = document.createElement("div");
    Object.defineProperty(node, "scrollHeight", { value: height });
    node.getBoundingClientRect = () => ({ width: 720 }) as DOMRect;
    return node;
  }
  it("preserves the whole long report while keeping mobile canvas limits", async () => {
    raster.toBlob.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
    await renderReportImage(element(20000));
    const options = raster.toBlob.mock.calls[0]![1];
    expect(options.height).toBe(20000);
    expect(options.width).toBe(720);
    expect(options.height * options.pixelRatio).toBeLessThanOrEqual(16384);
    expect(options.width * options.height * options.pixelRatio ** 2).toBeLessThanOrEqual(14000000);
  });
  it("reports unrendered content or an unreadably large image instead of cropping", async () => {
    await expect(renderReportImage(element(0))).rejects.toThrow("排版");
    await expect(renderReportImage(element(100000))).rejects.toThrow("报告内容过长");
    expect(raster.toBlob).not.toHaveBeenCalled();
  });
  it("treats an empty canvas result as failure rather than offering an unusable image", async () => {
    raster.toBlob.mockResolvedValue(null);
    await expect(renderReportImage(element(2400))).rejects.toThrow("图片生成失败");
    raster.toBlob.mockResolvedValue(new Blob([]));
    await expect(renderReportImage(element(2400))).rejects.toThrow("图片生成失败");
  });
});
