import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppWindow } from "./AppWindow";
import type { WindowItem } from "@/store/windowStore";

function DraftForm() {
  const [value, setValue] = useState("");
  return (
    <>
      <button aria-label="填写内容" onClick={() => setValue("尚未提交的课堂观察")}>
        填写内容
      </button>
      <output aria-label="未保存内容">{value}</output>
    </>
  );
}

describe("AppWindow", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }))
    );
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("preserves unsaved child state while minimized and restored", () => {
    const win: WindowItem = {
      id: "semester-report-v2",
      title: "学期报告v2",
      contentKey: "semesterReportsV2",
      state: "maximized",
      prevState: "normal",
      position: { x: 100, y: 60 },
      size: { w: 580, h: 510 },
      zIndex: 10
    };
    const renderWindow = (state: WindowItem["state"]) =>
      root.render(
        <AppWindow window={{ ...win, state }}>
          <DraftForm />
        </AppWindow>
      );

    act(() => renderWindow("maximized"));
    act(() => {
      container.querySelector<HTMLButtonElement>('[aria-label="填写内容"]')!.click();
    });

    act(() => renderWindow("minimized"));
    expect(container.firstElementChild?.classList.contains("hidden")).toBe(true);
    expect(container.querySelector<HTMLOutputElement>('[aria-label="未保存内容"]')?.textContent).toBe(
      "尚未提交的课堂观察"
    );

    act(() => renderWindow("maximized"));
    expect(container.firstElementChild?.classList.contains("hidden")).toBe(false);
    expect(container.querySelector<HTMLOutputElement>('[aria-label="未保存内容"]')?.textContent).toBe(
      "尚未提交的课堂观察"
    );
  });
});
