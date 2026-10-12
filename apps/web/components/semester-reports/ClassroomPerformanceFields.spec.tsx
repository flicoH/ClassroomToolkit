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
    const english = container.querySelector<HTMLSelectElement>('[aria-label="英语 课堂参与"]')!;
    const math = container.querySelector<HTMLSelectElement>('[aria-label="数学 课堂参与"]')!;
    expect(english.value).toBe("主动参与");
    expect(math.value).toBe("需要鼓励");
    const change = (input: HTMLSelectElement, next: string) =>
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(input, next);
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    change(math, "引导参与");
    expect(english.value).toBe("主动参与");
    expect(value).toContainEqual({ subjectId: "math", label: "课堂参与", value: "引导参与" });
    change(math, "");
    expect(value.some(item => item.subjectId === "math")).toBe(false);
    expect(value).toContainEqual({ label: "课堂任务", value: "基本完成" });
    expect(container.querySelector('[aria-label="英语 课程任务"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="数学 课程任务"]')).toBeTruthy();
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

it("does not ask for mastery of manual teaching content while keeping PDF feedback", () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  const root = createRoot(container);
  const manual = { id: "manual-one", section: "科学", text: "观察植物", sourceRefs: ["teacher-course:science"] };
  const pdf = { id: "pdf-one", section: "英语", text: "跟读短句", sourceRefs: ["course:pdf:p1"] };
  try {
    act(() =>
      root.render(
        <StudentFeedbackForm
          student={{ id: "s", name: "小明", className: "一班" }}
          subject="科学、英语"
          learningContents={[manual, pdf]}
          value={emptyStudentFeedback()}
          onChange={() => {}}
        />
      )
    );
    expect(container.querySelector('[aria-label="小明 学习内容 1 掌握情况"]')).toBeNull();
    expect(container.querySelector('[aria-label="小明 学习内容 2 掌握情况"]')).toBeTruthy();
    act(() =>
      root.render(
        <StudentFeedbackForm
          student={{ id: "s", name: "小明", className: "一班" }}
          subject="科学"
          learningContents={[manual]}
          value={emptyStudentFeedback()}
          onChange={() => {}}
        />
      )
    );
    expect(container.textContent).not.toContain("掌握");
    expect(container.textContent).not.toContain("待评价");
  } finally {
    act(() => root.unmount());
  }
});

it("shows four defaults and retains every dropdown option after selecting and clearing", () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  const root = createRoot(container);
  let value: PerformanceRating[] = [];
  const render = () =>
    root.render(
      <ClassroomPerformanceFields
        subjects={[{ subjectId: "math", name: "数学" }]}
        subject="数学"
        value={value}
        onChange={next => {
          value = next;
          render();
        }}
      />
    );
  try {
    act(render);
    expect([...container.querySelectorAll("select")].map(select => select.getAttribute("aria-label"))).toEqual([
      "数学 课程任务",
      "数学 听指令反应",
      "数学 课堂参与",
      "数学 专注情况"
    ]);
    const participation = container.querySelector<HTMLSelectElement>('[aria-label="数学 课堂参与"]')!;
    const options = [...participation.options].map(option => option.value);
    act(() => {
      participation.value = "主动参与";
      participation.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect([...participation.options].map(option => option.value)).toEqual(options);
    expect(value).toEqual([{ subjectId: "math", label: "课堂参与", value: "主动参与" }]);
    act(() => {
      participation.value = "";
      participation.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(value).toEqual([]);
  } finally {
    act(() => root.unmount());
  }
});

it("uses subject-specific custom options while keeping old saved values and hiding unchecked subjects", () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    act(() =>
      root.render(
        <ClassroomPerformanceFields
          subject="数学"
          subjects={[
            {
              subjectId: "math",
              name: "数学",
              performanceConfig: [{ label: "同伴协作", options: ["合作完成", "轮流交流"] }]
            }
          ]}
          value={[
            { subjectId: "math", label: "同伴协作", value: "旧选项" },
            { subjectId: "english", label: "课堂参与", value: "主动参与" }
          ]}
          onChange={() => {}}
        />
      )
    );
    const select = container.querySelector<HTMLSelectElement>('[aria-label="数学 同伴协作"]')!;
    expect([...select.options].map(option => option.value)).toEqual(["", "旧选项", "合作完成", "轮流交流"]);
    expect(select.value).toBe("旧选项");
    expect(container.textContent).not.toContain("英语的课堂表现");
    expect(container.querySelector('[aria-label="英语 课堂参与"]')).toBeNull();
  } finally {
    act(() => root.unmount());
  }
});
