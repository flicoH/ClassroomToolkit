import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StudentManagement } from "@/components/apps/StudentManagement";
import { StudentAvatar } from "./StudentAvatar";

const mocks = vi.hoisted(() => ({ request: vi.fn(), prepare: vi.fn() }));
vi.mock("@/lib/request", () => ({ default: mocks.request }));
vi.mock("./student-photo", () => ({ prepareStudentPhoto: mocks.prepare }));
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
const student = { id: "class:one", name: "小明", studentNo: "1", gender: "", photo: null as string | null };

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  mocks.request.mockReset();
  mocks.prepare.mockReset();
  mocks.request.mockImplementation(async config => {
    if (config === "/api/classes") return [{ id: "class", name: "一班", groups: [], students: [student] }];
    return { ...student, photo: config.method === "DELETE" ? null : "data:image/jpeg;base64,saved" };
  });
  mocks.prepare.mockResolvedValue(new File(["jpeg"], "student-photo.jpg", { type: "image/jpeg" }));
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function button(text: string) {
  return [...container.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === text)!;
}
async function edit() {
  await act(async () => root.render(<StudentManagement />));
  const trigger = container.querySelector<HTMLButtonElement>('[aria-label="编辑学生"]')!;
  trigger.focus();
  act(() => trigger.click());
  return trigger;
}
async function choose() {
  const input = container.querySelector<HTMLInputElement>('[aria-label="上传学生照片"]')!;
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [new File(["png"], "photo.png", { type: "image/png" })]
  });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
}

it("previews, uploads and removes a student photo, closes on Escape and restores focus", async () => {
  const trigger = await edit();
  expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("编辑学生");
  await choose();
  expect(container.querySelector('img[alt="小明的照片预览"]')?.getAttribute("src")).toBe("blob:preview");
  expect(container.querySelector("article img")).toBeNull();
  await act(async () => button("保存照片").click());
  expect(container.querySelector("article img")?.getAttribute("src")).toBe("data:image/jpeg;base64,saved");
  const config = mocks.request.mock.calls.find(([value]) => value.method === "POST")![0];
  expect(config.url).toBe("/api/classes/class/students/class%3Aone/photo");
  expect(config.data.get("file").type).toBe("image/jpeg");
  expect(container.textContent).toContain("照片已保存");
  expect(button("更换照片")).toBeDefined();
  act(() => button("移除照片").click());
  act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  act(() => button("移除照片").click());
  await act(async () => button("移除").click());
  expect(container.querySelector("article img")).toBeNull();
  expect(container.textContent).toContain("照片已移除");
  expect(button("上传照片")).toBeDefined();
  act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it("provides a prominent upload button that opens the image picker without submitting student details", async () => {
  await edit();
  const upload = button("上传照片");
  expect(upload).toBeDefined();
  expect(upload.type).toBe("button");
  expect(upload.className).toContain("bg-blue-600");
  expect(upload.className).toContain("min-h-11");
  const input = container.querySelector<HTMLInputElement>('[aria-label="上传学生照片"]')!;
  expect(input.hidden).toBe(true);
  const openPicker = vi.spyOn(input, "click").mockImplementation(() => {});
  act(() => upload.click());
  expect(openPicker).toHaveBeenCalledTimes(1);
  expect(mocks.request).toHaveBeenCalledTimes(1);
  await choose();
  expect(container.querySelector('img[alt="小明的照片预览"]')).not.toBeNull();
  expect(button("保存照片").disabled).toBe(false);
});

it("preserves the saved avatar on processing/upload failure, supports retry and prevents repeated writes", async () => {
  mocks.request.mockResolvedValueOnce([
    { id: "class", name: "一班", groups: [], students: [{ ...student, photo: "data:image/jpeg;base64,original" }] }
  ]);
  await edit();
  mocks.prepare.mockRejectedValueOnce(new Error("图片无法读取"));
  await choose();
  expect(container.textContent).toContain("图片无法读取");
  expect(mocks.request).toHaveBeenCalledTimes(1);
  await choose();
  mocks.request.mockRejectedValueOnce(new Error("上传失败"));
  await act(async () => button("保存照片").click());
  expect(container.textContent).toContain("上传失败");
  expect(container.querySelector("article img")?.getAttribute("src")).toBe("data:image/jpeg;base64,original");
  let complete!: (value: unknown) => void;
  mocks.request.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        complete = resolve;
      })
  );
  act(() => {
    button("保存照片").click();
    button("保存照片").click();
  });
  expect(button("确定").disabled).toBe(true);
  expect(button("更换照片").disabled).toBe(true);
  expect(mocks.request.mock.calls.filter(([value]) => value.method === "POST")).toHaveLength(2);
  await act(async () => complete({ ...student, photo: "data:image/jpeg;base64,retried" }));
  expect(container.querySelector("article img")?.getAttribute("src")).toContain("retried");
});

it("falls back to initials after an image error and retries a replacement", () => {
  act(() => root.render(<StudentAvatar name="小明" photo="data:image/jpeg;base64,first" />));
  act(() => container.querySelector("img")!.dispatchEvent(new Event("error")));
  expect(container.querySelector("img")).toBeNull();
  expect(container.textContent).toBe("小");
  act(() => root.render(<StudentAvatar name="小明" photo="data:image/jpeg;base64,second" />));
  expect(container.querySelector("img")?.getAttribute("src")).toContain("second");
});
