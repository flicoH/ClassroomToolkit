import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LearningReportView } from "./LearningReportView";
import { ScoreDetailsView } from "./ScoreDetailsView";

describe("ScoreDetailsView", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows positive and negative point changes with the stored dates", () => {
    act(() =>
      root.render(
        <ScoreDetailsView
          details={{
            positive: 5,
            negative: -2,
            net: 3,
            count: 2,
            records: [
              { label: "主动参与", delta: 5, createdAt: "2026-09-21T01:00:00.000Z" },
              { label: "课堂讲话", delta: -2, createdAt: "2026-09-22T01:00:00.000Z" }
            ]
          }}
        />
      )
    );
    expect(container.textContent).toContain("加分 5");
    expect(container.textContent).toContain("扣分 2");
    expect(container.textContent).toContain("净积分 +3");
    expect(container.textContent).toContain("主动参与");
    expect(container.textContent).toContain("课堂讲话");
    expect(container.textContent).toContain("2026/9/21");
  });

  it("filters the visible records by tapping positive and negative totals, then restores all from net points", () => {
    const details = {
      positive: 5,
      negative: -2,
      net: 3,
      count: 3,
      records: [
        { label: "主动参与", delta: 5, createdAt: null },
        { label: "课堂讲话", delta: -2, createdAt: null },
        { label: "无变化", delta: 0, createdAt: null }
      ]
    };
    act(() => root.render(<ScoreDetailsView details={details} />));
    const [positive, negative, all] = [...container.querySelectorAll("button")];
    expect(all.getAttribute("aria-pressed")).toBe("true");
    act(() => positive.click());
    expect(positive.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("ul")?.textContent).toContain("主动参与");
    expect(container.querySelector("ul")?.textContent).not.toContain("课堂讲话");
    act(() => negative.click());
    expect(negative.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("ul")?.textContent).toContain("课堂讲话");
    expect(container.querySelector("ul")?.textContent).not.toContain("主动参与");
    act(() => all.click());
    expect(all.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("ul")?.textContent).toContain("主动参与");
    expect(container.querySelector("ul")?.textContent).toContain("课堂讲话");
    expect(container.querySelector("ul")?.textContent).toContain("无变化");
  });

  it("shows an empty filtered result without changing the period totals", () => {
    act(() =>
      root.render(
        <ScoreDetailsView
          details={{
            positive: 0,
            negative: -2,
            net: -2,
            count: 1,
            records: [{ label: "提醒", delta: -2, createdAt: null }]
          }}
        />
      )
    );
    act(() => container.querySelector("button")!.click());
    expect(container.textContent).toContain("暂无加分记录");
    expect(container.textContent).toContain("净积分 -2");
  });

  it("states when no records exist and when only part of a long period is displayed", () => {
    act(() => root.render(<ScoreDetailsView details={{ positive: 0, negative: 0, net: 0, count: 0, records: [] }} />));
    expect(container.textContent).toContain("暂无积分加减记录");
    act(() =>
      root.render(
        <ScoreDetailsView
          details={{
            positive: 20,
            negative: 0,
            net: 20,
            count: 5,
            records: [{ label: "完成任务", delta: 2, createdAt: null }]
          }}
        />
      )
    );
    expect(container.textContent).toContain("共 5 条，展示前 1 条");
    act(() => [...container.querySelectorAll("button")][1]!.click());
    expect(container.textContent).toContain("已展示的前 1 条记录中暂无扣分记录");
    expect(container.textContent).toContain("加分 20");
  });

  it("restores all records when the selected student's point snapshot changes", () => {
    const first = {
      positive: 2,
      negative: -1,
      net: 1,
      count: 2,
      records: [
        { label: "学生一加分", delta: 2, createdAt: null },
        { label: "学生一扣分", delta: -1, createdAt: null }
      ]
    };
    act(() => root.render(<ScoreDetailsView details={first} />));
    act(() => container.querySelector("button")!.click());
    expect(container.querySelector("ul")?.textContent).not.toContain("学生一扣分");
    act(() =>
      root.render(
        <ScoreDetailsView
          details={{
            positive: 3,
            negative: -2,
            net: 1,
            count: 2,
            records: [
              { label: "学生二加分", delta: 3, createdAt: null },
              { label: "学生二扣分", delta: -2, createdAt: null }
            ]
          }}
        />
      )
    );
    expect([...container.querySelectorAll("button")][2]?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("ul")?.textContent).toContain("学生二加分");
    expect(container.querySelector("ul")?.textContent).toContain("学生二扣分");
  });

  it("includes the saved point changes in the shared teacher and parent report template", () => {
    act(() =>
      root.render(
        <LearningReportView
          report={{
            studentName: "学生一",
            className: "一班",
            subject: "英语",
            term: "秋季",
            period: "week",
            content: {
              summary: "老师寄语",
              courseOverview: "课程内容",
              strengths: [],
              areasToImprove: [],
              homeSuggestions: [],
              limitations: [],
              scoreDetails: {
                positive: 2,
                negative: -1,
                net: 1,
                count: 2,
                records: [{ label: "完成任务", delta: 2, createdAt: null }]
              }
            }
          }}
        />
      )
    );
    expect(container.textContent).toContain("学生一");
    expect(container.textContent).toContain("本期积分加减情况");
    expect(container.textContent).toContain("完成任务");
  });
});
