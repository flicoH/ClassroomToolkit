import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { SubjectPerformanceConfig } from "./SubjectPerformanceConfig";

it("edits base options, adds a category and rejects duplicate or blank options before saving", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  const root = createRoot(container);
  const onSave = vi.fn(async () => true);
  function change(label: string, text: string) {
    const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)!;
    act(() => {
      Object.getOwnPropertyDescriptor(
        input instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype,
        "value"
      )!.set!.call(input, text);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  const button = (text: string) => [...container.querySelectorAll("button")].find(item => item.textContent === text)!;
  try {
    act(() => root.render(<SubjectPerformanceConfig subject={{ name: "数学" }} busy={false} onSave={onSave} />));
    change("数学 课程任务下拉选项", "完成挑战\n需要支持");
    change("新增课堂表现名称", "同伴协作");
    change("新增课堂表现下拉选项", "主动协作\n轮流交流");
    await act(async () => button("添加课堂表现项目").click());
    await act(async () => button("保存课堂表现配置").click());
    expect(onSave).toHaveBeenCalledWith(
      expect.arrayContaining([
        { label: "课程任务", options: ["完成挑战", "需要支持"] },
        { label: "同伴协作", options: ["主动协作", "轮流交流"] }
      ])
    );
    change("数学 课程任务下拉选项", "重复\n重复");
    await act(async () => button("保存课堂表现配置").click());
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("不重复");
    change("数学 课程任务下拉选项", "");
    await act(async () => button("保存课堂表现配置").click());
    expect(onSave).toHaveBeenCalledTimes(2);
    change("新增课堂表现名称", "课程任务");
    change("新增课堂表现下拉选项", "观察记录");
    await act(async () => button("添加课堂表现项目").click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("名称不能为空或重复");
  } finally {
    act(() => root.unmount());
  }
});

it("keeps a failed addition for retry and saves both consecutive additions", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  const root = createRoot(container);
  const onSave = vi
    .fn(async (_fields: import("./performance-config").PerformanceField[]) => true)
    .mockResolvedValueOnce(false);
  const type = (label: string, value: string) => {
    const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)!;
    act(() => {
      Object.getOwnPropertyDescriptor(
        input instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype,
        "value"
      )!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const add = () =>
    [...container.querySelectorAll("button")].find(button => button.textContent === "添加课堂表现项目")!;
  try {
    act(() => root.render(<SubjectPerformanceConfig subject={{ name: "数学" }} busy={false} onSave={onSave} />));
    type("新增课堂表现名称", "同伴协作");
    type("新增课堂表现下拉选项", "轮流交流\n主动合作");
    await act(async () => add().click());
    expect(container.querySelector<HTMLInputElement>('[aria-label="新增课堂表现名称"]')?.value).toBe("同伴协作");
    expect(container.querySelector('[aria-label="数学 同伴协作下拉选项"]')).toBeNull();
    await act(async () => add().click());
    type("新增课堂表现名称", "课堂表达");
    type("新增课堂表现下拉选项", "表达清晰\n需要支持");
    await act(async () => add().click());
    expect(onSave.mock.calls[2]?.[0]).toEqual(
      expect.arrayContaining([
        { label: "同伴协作", options: ["轮流交流", "主动合作"] },
        { label: "课堂表达", options: ["表达清晰", "需要支持"] }
      ])
    );
    expect(container.querySelector<HTMLInputElement>('[aria-label="新增课堂表现名称"]')?.value).toBe("");
  } finally {
    act(() => root.unmount());
  }
});
