import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./confirm-dialog";

describe("ConfirmDialog", () => {
  let root: Root;
  let container: HTMLDivElement;
  let trigger: HTMLButtonElement;

  beforeEach(() => {
    // Simulate the button that opened the dialog so focus restoration is observable.
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    trigger = document.createElement("button");
    trigger.textContent = "删除";
    container = document.createElement("div");
    document.body.append(trigger, container);
    trigger.focus();
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    trigger.remove();
  });

  function render(open: boolean, onConfirm = vi.fn(), onCancel = vi.fn()) {
    act(() =>
      root.render(
        <ConfirmDialog
          open={open}
          title="删除报告"
          description="删除后家长链接失效"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      )
    );
    return { onConfirm, onCancel };
  }

  it("renders only when open with an accessible title and both actions", () => {
    render(false);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    render(true);
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent).toBe("删除报告");
    expect(dialog.textContent).toContain("删除后家长链接失效");
    expect(dialog.querySelectorAll("button")).toHaveLength(2);
  });

  it("calls the corresponding action and keeps keyboard focus inside the dialog", () => {
    const { onConfirm, onCancel } = render(true);
    const [cancel, confirm] = [...container.querySelectorAll("button")];
    expect(document.activeElement).toBe(cancel);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));
    });
    expect(document.activeElement).toBe(confirm);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });
    expect(document.activeElement).toBe(cancel);
    act(() => cancel.click());
    expect(onCancel).toHaveBeenCalledTimes(1);
    act(() => confirm.click());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("closes with Escape and restores focus after closing", () => {
    const { onCancel } = render(true);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    render(false);
    expect(document.activeElement).toBe(trigger);
  });
});
