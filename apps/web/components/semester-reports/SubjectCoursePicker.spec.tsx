import { useState, act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { SubjectCoursePicker, courseSelectionsFromScopes } from "./SubjectCoursePicker";

it("uses empty explicit sources for subject-only selections regardless of saved scope or PDF availability", () => {
  expect(
    courseSelectionsFromScopes(
      { en: "Unit1", science: "旧教学内容" },
      [{ id: "en-doc", subjectId: "en", termId: "term", status: "ready" }],
      "term",
      true
    )
  ).toEqual([
    { subjectId: "en", courseScope: "", manualContent: "" },
    { subjectId: "science", courseScope: "", manualContent: "" }
  ]);
});

it("keeps identical unit labels isolated by subject and drops unchecked scope", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  const root = createRoot(container);
  function Harness() {
    const [value, setValue] = useState<Record<string, string>>({});
    return (
      <>
        <SubjectCoursePicker
          subjects={[
            { id: "en", name: "英语" },
            { id: "ma", name: "数学" },
            { id: "none", name: "科学" }
          ]}
          documents={[
            { id: "en-doc", subjectId: "en", termId: "term", status: "ready", units: ["Unit1"] },
            { id: "ma-doc", subjectId: "ma", termId: "term", status: "ready", units: ["Unit1"] }
          ]}
          termId="term"
          period="week"
          value={value}
          onChange={setValue}
        />
        <output>{JSON.stringify(value)}</output>
      </>
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    const click = (label: string) =>
      act(() => container.querySelector<HTMLElement>(`[aria-label="${label}"]`)!.click());
    expect(container.querySelector<HTMLInputElement>('[aria-label="选择科学课程"]')?.disabled).toBe(false);
    click("选择英语课程");
    click("选择数学课程");
    click("英语 Unit1");
    expect(container.querySelector("output")?.textContent).toBe('{"en":"Unit1","ma":""}');
    click("数学 Unit1");
    click("选择英语课程");
    expect(container.querySelector("output")?.textContent).toBe('{"ma":"Unit1"}');
    expect(container.querySelector('[aria-label="英语授课范围"]')).toBeNull();
    click("数学 Unit1");
    expect(container.querySelector("output")?.textContent).toBe('{"ma":""}');
    click("选择科学课程");
    const manual = container.querySelector<HTMLTextAreaElement>('[aria-label="科学教学内容"]')!;
    expect(manual.placeholder).toContain("教学内容选填");
    expect(container.querySelector('[aria-label="科学授课范围"]')).toBeNull();
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(manual, "认识植物的根和叶");
      manual.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(
      courseSelectionsFromScopes(
        JSON.parse(container.querySelector("output")!.textContent!),
        [{ id: "ma-doc", subjectId: "ma", termId: "term", status: "ready" }],
        "term"
      )
    ).toEqual([
      { subjectId: "ma", courseScope: "" },
      { subjectId: "none", courseScope: "", manualContent: "认识植物的根和叶" }
    ]);
    click("选择科学课程");
    expect(container.querySelector('[aria-label="科学教学内容"]')).toBeNull();
  } finally {
    act(() => root.unmount());
  }
});

it("allows removing a selected subject after its confirmed document is deleted", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  const root = createRoot(container);
  let next: Record<string, string> | undefined;
  try {
    await act(async () =>
      root.render(
        <SubjectCoursePicker
          subjects={[{ id: "en", name: "英语" }]}
          documents={[]}
          termId="term"
          period="term"
          value={{ en: "Unit1" }}
          onChange={value => {
            next = value;
          }}
        />
      )
    );
    const checkbox = container.querySelector<HTMLInputElement>('[aria-label="选择英语课程"]')!;
    expect(checkbox.disabled).toBe(false);
    act(() => checkbox.click());
    expect(next).toEqual({});
  } finally {
    act(() => root.unmount());
  }
});
