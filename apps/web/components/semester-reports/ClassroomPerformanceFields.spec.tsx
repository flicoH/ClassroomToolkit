import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import {
  ClassroomPerformanceFields,
  performanceEntries,
  performanceRatings,
  type PerformanceRating
} from "./ClassroomPerformanceFields";
import { StudentFeedbackForm, emptyStudentFeedback } from "./StudentFeedbackForm";

it("edits and clears one subject without changing another or legacy observations", () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let value: PerformanceRating[] = [
    { subjectId: "english", label: "课堂参与", value: "主动参与" },
    { subjectId: "math", label: "课堂参与", value: "需要鼓励" },
    { label: "课堂任务", value: "基本完成" }
  ];
  const render = () =>
    root.render(
      <ClassroomPerformanceFields
        subject="英语、数学"
        subjects={[
          { subjectId: "english", name: "英语" },
          { subjectId: "math", name: "数学" }
        ]}
        value={value}
        onChange={next => {
          value = next;
          render();
        }}
      />
    );
  try {
    act(render);
    const english = container.querySelector<HTMLInputElement>('[aria-label="英语 课堂参与"]')!;
    const math = container.querySelector<HTMLInputElement>('[aria-label="数学 课堂参与"]')!;
    expect(english.value).toBe("主动参与");
    expect(math.value).toBe("需要鼓励");
    const change = (input: HTMLInputElement, next: string) =>
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, next);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    change(math, "独立完成");
    expect(english.value).toBe("主动参与");
    expect(value).toContainEqual({ subjectId: "math", label: "课堂参与", value: "独立完成" });
    change(math, "");
    expect(value.some(item => item.subjectId === "math")).toBe(false);
    expect(value).toContainEqual({ label: "课堂任务", value: "基本完成" });
    expect(container.querySelector('[aria-label="英语 英语开口"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="数学 学科表达"]')).toBeTruthy();
    expect(new Set([...container.querySelectorAll("datalist")].map(item => item.id)).size).toBe(
      container.querySelectorAll("datalist").length
    );
    act(() =>
      root.render(
        <StudentFeedbackForm
          student={{ id: "s", name: "小明", className: "一班" }}
          subject="英语、数学"
          subjects={[
            { subjectId: "english", name: "英语" },
            { subjectId: "math", name: "数学" }
          ]}
          learningContents={[]}
          value={emptyStudentFeedback()}
          onChange={() => {}}
        />
      )
    );
    expect(container.textContent).toContain("英语的课堂表现");
    expect(container.textContent).toContain("数学的课堂表现");
    expect(container.textContent).not.toContain("未分学科");
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

it("preserves untouched old prose and records teacher review for changed subject ratings", () => {
  const original = [
    { text: "主动参与活动", sourceRefs: ["teacher-input"] },
    { subjectId: "english", text: "课堂参与 · 主动参与", sourceRefs: ["teacher-input"] },
    { subjectId: "math", text: "课堂参与 · 需要鼓励", sourceRefs: ["teacher-input"] }
  ];
  const ratings = performanceRatings(original);
  const result = performanceEntries(
    ratings.map(item => (item.subjectId === "math" ? { ...item, value: "基本专注" } : item)),
    original
  );
  expect(result[0]).toEqual(original[0]);
  expect(result[1]).toEqual(original[1]);
  expect(result[2]).toEqual({ subjectId: "math", text: "课堂参与 · 基本专注", sourceRefs: ["teacher-review"] });
  expect(performanceEntries([{ subjectId: "math", label: "课堂参与", value: " " }], original)).toEqual([]);
});
