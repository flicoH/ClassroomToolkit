import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportHistory } from "./ReportHistory";
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/request", () => ({ default: api }));
describe("Chinese report history and recovery", () => {
  let root: Root;
  let container: HTMLDivElement;
  const restored = vi.fn();
  const detail = {
    id: "event",
    label: "编辑报告草稿",
    createdAt: "2026-10-11T00:00:00Z",
    description: "已保存报告版本",
    currentVersion: "token",
    changes: [{ field: "老师寄语", before: "原寄语", after: "新寄语" }],
    canRestoreBefore: true,
    canRestoreAfter: true
  };
  beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    api.get.mockImplementation(async (url: string) =>
      url.endsWith("/event")
        ? detail
        : [{ id: "event", action: "draft-edited", label: "编辑报告草稿", createdAt: detail.createdAt }]
    );
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  const click = async (text: string) => {
    const button = [...document.body.querySelectorAll("button")].find(item => item.textContent?.trim() === text)!;
    expect(button).toBeTruthy();
    await act(async () => button.click());
  };
  it("shows Chinese changes, confirms restoration, handles failure and refreshes the parent", async () => {
    await act(async () => root.render(<ReportHistory reportId="report" status="draft" onRestored={restored} />));
    expect(container.textContent).toContain("编辑报告草稿");
    expect(container.textContent).not.toContain("draft-edited");
    await click("查看记录");
    expect(container.textContent).toContain("原寄语");
    expect(container.textContent).toContain("新寄语");
    await click("恢复修改前");
    await click("取消");
    expect(api.post).not.toHaveBeenCalled();
    await click("恢复为草稿");
    api.post.mockRejectedValueOnce({
      message: "Request failed with status code 409",
      response: { data: { message: "报告已发生变化，请重新查看记录后恢复" } }
    });
    await click("确认恢复");
    expect(container.textContent).toContain("已发生变化");
    expect(restored).not.toHaveBeenCalled();
    await click("查看记录");
    await click("恢复修改前");
    api.post.mockResolvedValueOnce({ id: "report", content: { summary: "原寄语" } });
    await click("确认恢复");
    expect(api.post).toHaveBeenLastCalledWith("/api/semester-reports/reports/report/events/event/restore", {
      side: "before",
      expectedVersion: "token"
    });
    expect(restored).toHaveBeenCalledWith({ id: "report", content: { summary: "原寄语" } });
    const historyQueries = api.get.mock.calls.filter(([url]) => url.includes("/events"));
    const refreshTokens = historyQueries.map(([, config]) => config?.params.refresh);
    expect(refreshTokens.every(Boolean)).toBe(true);
    expect(new Set(refreshTokens).size).toBe(refreshTokens.length);
  });
  it.each(["draft", "published"])("explains unavailable legacy records (%s)", async status => {
    api.get.mockImplementation(async url =>
      url.endsWith("/event")
        ? {
            ...detail,
            changes: [],
            canRestoreBefore: false,
            canRestoreAfter: false,
            description: "此记录未保存历史版本，无法从该记录恢复。"
          }
        : [{ id: "event", label: "报告生成成功", createdAt: detail.createdAt }]
    );
    await act(async () => root.render(<ReportHistory reportId="report" status={status} onRestored={restored} />));
    await click("查看记录");
    expect(container.textContent).toContain("未保存历史版本");
    expect(container.textContent).not.toContain("恢复修改前");
  });
  it("retries history errors and restores a published version as a draft", async () => {
    api.get.mockRejectedValueOnce(new Error("记录加载失败"));
    await act(async () => root.render(<ReportHistory reportId="report" status="published" onRestored={restored} />));
    expect(container.textContent).toContain("记录加载失败");
    await click("重新加载记录");
    await click("查看记录");
    await click("恢复为草稿");
    expect(document.body.textContent).toContain("撤销发布");
    expect(document.body.textContent).toContain("失效");
    await click("取消");
    expect(api.post).not.toHaveBeenCalled();
    await click("恢复为草稿");
    api.post.mockResolvedValueOnce({ id: "report", status: "draft", content: { summary: "新寄语" } });
    await click("确认恢复");
    expect(restored).toHaveBeenCalledWith({ id: "report", status: "draft", content: { summary: "新寄语" } });
  });
});
