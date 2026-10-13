import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { useAuthStore } from "@/store/authStore";
import { useWindowStore } from "@/store/windowStore";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("account management desktop icon", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    useWindowStore.setState({ windows: [], nextZIndex: 10 });
    useAuthStore.setState({
      user: {
        id: "main",
        name: "主账号",
        email: "",
        accountType: "main",
        capabilities: { accountManagement: true, reportConfiguration: true }
      }
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useAuthStore.setState({ user: null });
    useWindowStore.setState({ windows: [] });
  });
  it("uses the same cartoon canvas, background and highlight treatment as the other desktop tools", () => {
    act(() => root.render(<Home />));
    const buttons = [...container.querySelectorAll("button")];
    const account = buttons.find(button => button.textContent === "账号管理")!.querySelector("svg")!;
    const countdown = buttons.find(button => button.textContent === "倒计时")!.querySelector("svg")!;
    expect(account.getAttribute("viewBox")).toBe(countdown.getAttribute("viewBox"));
    expect(account.getAttribute("viewBox")).toBe("0 0 64 64");
    expect(account.querySelector('rect[x="7"][y="7"][rx="17"]')).not.toBeNull();
    expect(account.querySelector("linearGradient stop")).not.toBeNull();
    expect(account.querySelector('path[stroke-opacity=".38"]')).not.toBeNull();
    expect(account.classList.contains("drop-shadow-md")).toBe(true);
    expect(account.getAttribute("aria-hidden")).toBe("true");
  });
  it("keeps the account management icon hidden for subaccounts", () => {
    useAuthStore.setState({
      user: {
        id: "sub",
        name: "子账号",
        email: "",
        accountType: "sub",
        capabilities: { accountManagement: false, reportConfiguration: false }
      }
    });
    act(() => root.render(<Home />));
    expect([...container.querySelectorAll("button")].some(button => button.textContent === "账号管理")).toBe(false);
  });
});
