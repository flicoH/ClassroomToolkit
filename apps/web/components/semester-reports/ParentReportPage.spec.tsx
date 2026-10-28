import { act } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import ParentReportPage from "@/app/r/[token]/page";

const report = {
  studentName: "小明",
  className: "一班",
  subject: "语文",
  term: "秋季",
  period: "term",
  content: {
    reportVersion: "v2",
    studentPhoto: "data:image/jpeg;base64,saved",
    classroomPhoto: "data:image/png;base64,classroom",
    summary: "继续加油",
    strengths: [],
    areasToImprove: [{ text: "练习表达", sourceRefs: [] }],
    courseOverview: "",
    homeSuggestions: [],
    limitations: [],
    scoreDetails: { count: 0, positive: 0, negative: 0, net: 0, records: [], positiveItems: [] }
  }
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("public report initial rendering", () => {
  it("hydrates the same loading markup before fetching the report on mobile", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => report }));
    const params = Promise.resolve({ token: "sample-token" });
    const element = <ParentReportPage params={params} />;
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    document.body.append(container);
    expect(container.textContent).toContain("正在打开报告");
    const recover = vi.fn();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, element, { onRecoverableError: recover });
    });
    expect(recover).not.toHaveBeenCalled();
    expect(error.mock.calls.some(call => String(call[0]).includes("hydrated"))).toBe(false);
    expect(container.textContent).toContain("小明");
    expect(container.querySelector('header img[alt="小明的头像"]')?.getAttribute("src")).toBe(
      report.content.studentPhoto
    );
    expect(
      container.querySelector("article header")?.nextElementSibling?.children[1]?.querySelector("h2")?.textContent
    ).toBe("课堂表现");
    expect(
      container.querySelector("article header")?.nextElementSibling?.firstElementChild?.getAttribute("aria-label")
    ).toBe("课堂照片");
    expect(container.querySelector('[aria-label="宠物伙伴与阶段积分"]')!.classList.contains("grid-cols-1")).toBe(true);
    act(() => root!.unmount());
    container.remove();
  });
  it("keeps invalid links readable without exposing an incomplete report", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ message: "报告链接无效或已失效" }) })
    );
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<ParentReportPage params={Promise.resolve({ token: "expired" })} />));
    expect(container.textContent).toContain("报告链接无效或已失效");
    expect(container.querySelector("article")).toBeNull();
    act(() => root.unmount());
  });
  it("shows all saved subject evaluations on an existing parent link without classroom photos", async () => {
    const subjects = ["英语", "数学", "拼音", "阅读"].map((name, index) => ({ subjectId: `subject-${index}`, name }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...report,
          content: {
            ...report.content,
            classroomPhoto: null,
            classroomPhotos: [null, null],
            reportSubjects: subjects,
            classroomPerformance: subjects.map(subject => ({
              subjectId: subject.subjectId,
              text: `${subject.name}课堂任务 · 独立完成`,
              sourceRefs: ["教师核对与评价"]
            }))
          }
        })
      })
    );
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<ParentReportPage params={Promise.resolve({ token: "existing-token" })} />));
    expect(container.querySelectorAll('[aria-label="分学科学习表现"]')).toHaveLength(1);
    for (const subject of subjects) {
      const section = container.querySelector(`[aria-label="${subject.name}的课堂表现"]`);
      expect(section?.textContent).toContain(`${subject.name}课堂任务`);
      expect(section?.textContent).toContain("独立完成");
    }
    expect(container.querySelector('[aria-label="课堂照片"]')).toBeNull();
    act(() => root.unmount());
  });
  it("hides empty classroom performance on the parent page without photos while keeping the portrait", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ...report, content: { ...report.content, classroomPhoto: null } })
      })
    );
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<ParentReportPage params={Promise.resolve({ token: "sample-token" })} />));
    expect(container.querySelector('header img[alt="小明的头像"]')).not.toBeNull();
    expect([...container.querySelectorAll("h2")].some(node => node.textContent === "课堂表现")).toBe(false);
    expect(container.textContent).not.toContain("老师暂未填写具体课堂表现");
    act(() => root.unmount());
  });
});
