import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PetCertificate } from "./PetCertificate";
const renderImage = vi.hoisted(() => vi.fn());
vi.mock("html-to-image", () => ({ toPng: renderImage }));
const snapshot = {
  id: "done",
  studentId: "one",
  cycleId: "a",
  petId: "sprout-puff",
  petName: "旧伙伴",
  level: 10,
  stage: "终极形态",
  rules: { maxLevel: 10, finalEnergy: 100, version: 1 },
  earnedBadges: 50,
  completedAt: "2026-10-14T08:00:00Z"
};
describe("completed pet certificate export", () => {
  let root: Root, container: HTMLDivElement;
  const onError = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });
  async function mount(kind: "certificate" | "memory" = "certificate") {
    await act(async () =>
      root.render(
        <PetCertificate snapshot={snapshot} name="测试甲" kind={kind} onClose={() => undefined} onError={onError} />
      )
    );
  }
  function imagesLoaded() {
    container.querySelectorAll("img").forEach(img => {
      Object.defineProperty(img, "complete", { value: true, configurable: true });
      Object.defineProperty(img, "naturalWidth", { value: 120, configurable: true });
    });
  }
  async function save() {
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find(button => button.textContent === "生成并下载奖状")!
        .click();
    });
  }
  it("renders the chosen completed snapshot and memory display never promises a download", async () => {
    await mount("memory");
    expect(container.textContent).toContain("旧伙伴");
    expect(container.textContent).toContain("本轮已获得 50");
    expect(container.textContent).not.toContain("下载");
  });
  it("does not claim success on failed image loading or an empty export", async () => {
    await mount();
    container.querySelectorAll("img").forEach(img => {
      Object.defineProperty(img, "complete", { value: true, configurable: true });
      Object.defineProperty(img, "naturalWidth", { value: 0, configurable: true });
    });
    await save();
    expect(onError).toHaveBeenCalledWith("宠物图片加载失败");
    expect(renderImage).not.toHaveBeenCalled();
    imagesLoaded();
    renderImage.mockResolvedValue("data:,");
    await save();
    expect(onError).toHaveBeenCalledWith("生成图片为空，请重试");
    expect(container.querySelector('[alt="已生成的成长奖状预览"]')).toBeNull();
  });
  it("exports a real image preview and downloadable file from the frozen snapshot", async () => {
    await mount();
    imagesLoaded();
    const png = "data:image/png;base64," + "a".repeat(120);
    renderImage.mockResolvedValue(png);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    await save();
    expect(click).toHaveBeenCalledTimes(1);
    expect(container.querySelector<HTMLImageElement>('[alt="已生成的成长奖状预览"]')!.src).toBe(png);
    expect(renderImage.mock.calls[0]![0].textContent).toContain("旧伙伴");
  });
  it("discards an export that arrives after the preview is closed", async () => {
    await mount();
    imagesLoaded();
    let finish: (image: string) => void = () => undefined;
    renderImage.mockImplementation(
      () =>
        new Promise<string>(resolve => {
          finish = resolve;
        })
    );
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find(button => button.textContent === "生成并下载奖状")!
        .click();
    });
    await act(async () => root.render(null));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    await act(async () => finish("data:image/png;base64," + "a".repeat(120)));
    expect(click).not.toHaveBeenCalled();
  });
});
