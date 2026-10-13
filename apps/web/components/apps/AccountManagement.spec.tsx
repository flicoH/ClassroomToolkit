import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { AccountManagement } from "./AccountManagement";
import { useAuthStore } from "@/store/authStore";
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock("@/lib/request", () => ({ default: api, resetRequestCache: vi.fn() }));
const child = {
  id: "child",
  displayName: "李老师",
  account: "child-login",
  status: "active",
  createdAt: "2026-10-01T00:00:00Z",
  lastLoginAt: null
};
describe("account management", () => {
  let root: Root, box: HTMLDivElement;
  const buttons = () => [...box.querySelectorAll<HTMLButtonElement>("button")];
  const button = (label: string) => buttons().find(b => b.textContent === label)!;
  beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    useAuthStore.setState({
      user: {
        id: "owner",
        name: "主账号",
        email: "",
        accountType: "main",
        capabilities: { accountManagement: true, reportConfiguration: true }
      }
    });
    api.get.mockImplementation(async url =>
      url.endsWith("usage") || url.endsWith("usage-summary")
        ? { totals: { logins: 2, activeDays: 1, uses: 3 }, features: [], hours: [], days: [], reportActions: [] }
        : url.endsWith("activity") || url.endsWith("activity-summary")
          ? { items: [], total: 0, page: 1, pageSize: 20 }
          : { items: [child], used: 1, limit: 5 }
    );
    api.post.mockResolvedValue({});
    api.patch.mockResolvedValue({});
    api.delete.mockResolvedValue({});
    box = document.createElement("div");
    document.body.append(box);
    root = createRoot(box);
  });
  afterEach(() => {
    act(() => root.unmount());
    box.remove();
    useAuthStore.setState({ user: null });
  });
  async function render() {
    await act(async () => root.render(<AccountManagement />));
  }
  function input(label: string, value: string) {
    const node = [...box.querySelectorAll("label")].find(n => n.textContent === label)!.querySelector("input")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(node, value);
      node.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  it("denies direct opening for a subaccount without sending a management request", async () => {
    useAuthStore.setState({ user: { id: "child", name: "李", email: "", accountType: "sub" } });
    await render();
    expect(box.textContent).toContain("仅限主账号");
    expect(api.get).not.toHaveBeenCalled();
  });
  it("keeps fields on failed creation, permits retry and clears password on success", async () => {
    await render();
    await act(async () => button("创建子账号").click());
    input("用户名", "王老师");
    input("账号", "wang");
    input("密码", "secret123");
    api.post.mockRejectedValueOnce(new Error("账号已存在"));
    await act(async () =>
      box.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    );
    expect(box.textContent).toContain("账号已存在");
    expect(box.querySelector<HTMLInputElement>('input[type="password"]')!.value).toBe("secret123");
    await act(async () =>
      box.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    );
    expect(api.post).toHaveBeenLastCalledWith("/api/account-management/subaccounts", {
      displayName: "王老师",
      account: "wang",
      password: "secret123"
    });
    expect(box.querySelector('input[type="password"]')).toBeNull();
    expect(box.textContent).toContain("操作成功");
  });
  it("disables creation at quota including locked accounts", async () => {
    api.get.mockResolvedValue({ items: [{ ...child, status: "locked" }], used: 5, limit: 5 });
    await render();
    expect(button("创建子账号").disabled).toBe(true);
    expect(button("解锁")).toBeTruthy();
  });
  it("closes confirmation with Escape and only deletes after explicit confirmation", async () => {
    await render();
    await act(async () => button("删除").click());
    expect(box.querySelector('[role="dialog"]')).toBeTruthy();
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(box.querySelector('[role="dialog"]')).toBeNull();
    expect(api.delete).not.toHaveBeenCalled();
    await act(async () => button("删除").click());
    await act(async () => button("确认").click());
    expect(api.delete).toHaveBeenCalledWith("/api/account-management/subaccounts/child");
  });
  it("locks and unlocks using target status and displays individual usage", async () => {
    await render();
    await act(async () => button("锁定").click());
    await act(async () => button("确认").click());
    expect(api.patch).toHaveBeenCalledWith("/api/account-management/subaccounts/child/status", { status: "locked" });
    await act(async () => button("使用情况").click());
    expect(box.textContent).toContain("主动登录 2 次");
    expect(api.get).toHaveBeenCalledWith(
      "/api/account-management/subaccounts/child/usage",
      expect.objectContaining({
        params: expect.objectContaining({ start: expect.any(String), end: expect.any(String) })
      })
    );
  });
  it("supports rename and password reset with inline input and cancellation", async () => {
    await render();
    await act(async () => button("修改用户名").click());
    input("用户名", "新姓名");
    await act(async () =>
      box.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    );
    expect(api.patch).toHaveBeenCalledWith("/api/account-management/subaccounts/child", { displayName: "新姓名" });
    await act(async () => button("重置密码").click());
    input("密码", "newpass123");
    await act(async () =>
      box.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    );
    expect(api.post).toHaveBeenCalledWith("/api/account-management/subaccounts/child/reset-password", {
      password: "newpass123"
    });
    expect(box.querySelector('input[type="password"]')).toBeNull();
  });
  it("queries an owner-scoped team summary without treating owner as a child", async () => {
    await render();
    await act(async () => button("账号使用汇总").click());
    expect(api.get).toHaveBeenCalledWith("/api/account-management/subaccounts/usage-summary", expect.any(Object));
    expect(api.get).toHaveBeenCalledWith("/api/account-management/subaccounts/activity-summary", expect.any(Object));
    expect(box.textContent).toContain("主账号与全部子账号");
  });
});
