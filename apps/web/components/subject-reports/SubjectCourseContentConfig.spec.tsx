// 覆盖标题增删、非法输入和网络失败后重试，防止配置丢失。
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import request from "@/lib/request";
import { SubjectCourseContentConfig } from "./SubjectCourseContentConfig";

vi.mock("@/lib/request", () => ({ default: vi.fn() }));

it("adds and removes titles, validates blank entries and preserves input after failed saving", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  const root = createRoot(container);
  const announce = vi.fn();
  const onSubject = vi.fn();
  const button = (text: string) => [...container.querySelectorAll("button")].find(item => item.textContent === text)!;
  try {
    act(() =>
      root.render(
        <SubjectCourseContentConfig
          subject={{ id: "math", name: "数学", courseContentTitles: ["阅读"] }}
          onSubject={onSubject}
          announce={announce}
        />
      )
    );
    act(() => button("新增标题").click());
    await act(async () => button("保存课程内容标题").click());
    expect(request).not.toHaveBeenCalled();
    const input = container.querySelector<HTMLInputElement>('[aria-label="课程内容标题 2"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "计算");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    vi.mocked(request).mockRejectedValueOnce(new Error("offline"));
    await act(async () => button("保存课程内容标题").click());
    expect(input.value).toBe("计算");
    expect(announce).toHaveBeenLastCalledWith("保存课程内容标题失败，请重试。");
    act(() => button("删除标题").click());
    const updated = { id: "math", name: "数学", courseContentTitles: ["计算"] };
    vi.mocked(request).mockResolvedValueOnce(updated);
    await act(async () => button("保存课程内容标题").click());
    expect(request).toHaveBeenLastCalledWith("/api/subject-reports/report-subjects/math/course-content-titles", {
      method: "PATCH",
      data: { courseContentTitles: ["计算"] }
    });
    expect(onSubject).toHaveBeenCalledWith(updated);
  } finally {
    act(() => root.unmount());
  }
});
