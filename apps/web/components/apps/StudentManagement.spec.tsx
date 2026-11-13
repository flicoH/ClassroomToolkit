/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 * **********************************************************************************************
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudentManagement } from "@/components/apps/StudentManagement";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/request", () => ({ default: mocks.request }));

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;

const initialClasses = [
  { id: "class-1", name: "一班", groups: [], students: [] },
  { id: "class-2", name: "二班", groups: [], students: [] }
];

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  mocks.request.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("StudentManagement class deletion constraints", () => {
  it("allows deleting a class when multiple classes exist, switches active class, and disables delete when only one remains", async () => {
    mocks.request.mockImplementation(async config => {
      if (config === "/api/classes") return [...initialClasses];
      if (typeof config === "object" && config.method === "DELETE") return { deleted: true };
      return null;
    });

    await act(async () => root.render(<StudentManagement />));

    const deleteClass1 = container.querySelector<HTMLButtonElement>('[aria-label="删除班级 一班"]')!;
    const deleteClass2 = container.querySelector<HTMLButtonElement>('[aria-label="删除班级 二班"]')!;
    expect(deleteClass1).toBeDefined();
    expect(deleteClass2).toBeDefined();
    expect(deleteClass1.disabled).toBe(false);
    expect(deleteClass2.disabled).toBe(false);

    // 选中二班作为当前激活班级
    const class2Tab = [...container.querySelectorAll<HTMLButtonElement>("aside button")].find(el =>
      el.textContent?.includes("二班")
    )!;
    await act(async () => class2Tab.click());
    expect(container.querySelector("header h2")?.textContent).toBe("二班");

    // 点击删除二班
    await act(async () => deleteClass2.click());

    // 验证弹出项目内 ConfirmDialog 二次确认弹窗
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog).toBeDefined();
    expect(dialog.textContent).toContain("删除班级");
    expect(dialog.textContent).toContain("确定删除班级「二班」吗？");

    // 点击确认删除
    const confirmBtn = [...dialog.querySelectorAll<HTMLButtonElement>("button")].find(
      b => b.textContent?.trim() === "删除"
    )!;
    await act(async () => confirmBtn.click());

    // 校验 DELETE 请求已触发
    expect(mocks.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "/api/classes/class-2",
        method: "DELETE"
      })
    );

    // 删除后二班移除，激活班级自动切换至首个剩余班级一班
    expect(container.textContent).not.toContain("二班");
    expect(container.querySelector("header h2")?.textContent).toBe("一班");

    // 仅剩一个班级时，一班的删除按钮必须禁用且显示至少保留一个班级提示
    const remainingDeleteBtn = container.querySelector<HTMLButtonElement>('[aria-label="删除班级 一班"]')!;
    expect(remainingDeleteBtn.disabled).toBe(true);
    expect(remainingDeleteBtn.title).toBe("最少保留一个班级");
  });

  it("cancels deleting class when cancel button is clicked in ConfirmDialog", async () => {
    mocks.request.mockImplementation(async config => {
      if (config === "/api/classes") return [...initialClasses];
      return null;
    });

    await act(async () => root.render(<StudentManagement />));

    const deleteClass2 = container.querySelector<HTMLButtonElement>('[aria-label="删除班级 二班"]')!;
    await act(async () => deleteClass2.click());

    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog).toBeDefined();

    const cancelBtn = [...dialog.querySelectorAll<HTMLButtonElement>("button")].find(
      b => b.textContent?.trim() === "取消"
    )!;
    await act(async () => cancelBtn.click());

    // 弹窗关闭，未发起 DELETE 请求，班级依然保留
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(mocks.request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "DELETE" }));
    expect(container.textContent).toContain("二班");
  });

  it("supports deleting class from edit modal when multiple classes exist, and blocks when only one remains", async () => {
    // 场景 1：2 个班级时，编辑弹窗内删除可用
    mocks.request.mockImplementation(async config => {
      if (config === "/api/classes") return [...initialClasses];
      return null;
    });

    await act(async () => root.render(<StudentManagement />));

    const editClass2 = container.querySelector<HTMLButtonElement>('[aria-label="编辑班级 二班"]')!;
    await act(async () => editClass2.click());

    const editDialog = container.querySelector('[role="dialog"]')!;
    expect(editDialog.textContent).toContain("编辑班级名称");
    expect(editDialog.textContent).toContain("删除当前班级");

    const deleteInModal = [...editDialog.querySelectorAll<HTMLButtonElement>("button")].find(b =>
      b.textContent?.includes("删除")
    )!;
    expect(deleteInModal.disabled).toBe(false);

    // 点击弹窗中的删除，关闭编辑弹窗并呼出二次确认弹窗
    await act(async () => deleteInModal.click());
    const confirmDialog = container.querySelector('[role="dialog"]')!;
    expect(confirmDialog.textContent).toContain("确定删除班级「二班」吗？");

    // 场景 2：仅 1 个班级时，编辑弹窗内删除禁用并提示
    act(() => root.unmount());
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    mocks.request.mockImplementation(async config => {
      if (config === "/api/classes") return [initialClasses[0]];
      return null;
    });

    await act(async () => root.render(<StudentManagement />));

    const editClass1 = container.querySelector<HTMLButtonElement>('[aria-label="编辑班级 一班"]')!;
    await act(async () => editClass1.click());

    const editDialogSingle = container.querySelector('[role="dialog"]')!;
    expect(editDialogSingle.textContent).toContain("最少保留一个班级，无法删除");
    const deleteInModalSingle = [...editDialogSingle.querySelectorAll<HTMLButtonElement>("button")].find(b =>
      b.textContent?.includes("删除")
    )!;
    expect(deleteInModalSingle.disabled).toBe(true);
  });
});
