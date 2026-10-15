import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PetPoints } from "./PetPoints";
const api = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/request", () => ({ default: api.request }));

function initial() {
  return {
    id: "one",
    name: "测试甲",
    studentNo: "1",
    classId: "class",
    className: "测试班",
    group: "一组",
    score: 22,
    maxScore: 30,
    trophies: 3,
    level: 3,
    stage: "第3形态",
    petId: "sprout-puff",
    petName: "小芽",
    petProgress: 22,
    petExperience: 22,
    petHatched: true,
    absent: false,
    completedPets: 0,
    cycleId: "a",
    revision: 0,
    completionPending: false
  };
}

describe("PetPoints persisted workflows", () => {
  let root: Root, container: HTMLDivElement;
  let student = initial();
  let fail = false;
  let failedRefresh = false;
  let completed: unknown[] = [];
  let rejectBinding = false;
  let rewardDeleted = false;
  const writes = () =>
    api.request.mock.calls.map(([args]) => args).filter(args => typeof args !== "string" && args.method !== "GET");
  const button = (label: string) =>
    Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
      item => item.textContent?.trim() === label
    )!;
  const click = async (element: HTMLElement) => {
    await act(async () => {
      element.click();
    });
  };
  async function refreshFromSettings() {
    const cancel = button("取消");
    if (cancel) await click(cancel);
    await click(container.querySelector('[aria-label="设置"]')!);
    await click(button("刷新后端数据"));
    await click(button("确认刷新"));
  }
  async function mount() {
    await act(async () => root.render(<PetPoints />));
  }
  beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    student = initial();
    completed = [];
    fail = false;
    failedRefresh = false;
    rejectBinding = false;
    rewardDeleted = false;
    api.request.mockImplementation(
      async (args: string | { url: string; method: string; data: Record<string, unknown> }) => {
        if (typeof args === "string") {
          if (args.startsWith("/api/classes"))
            return args === "/api/classes"
              ? [
                  {
                    id: "class",
                    name: "测试班",
                    groups: ["一组"],
                    students: [{ id: "one", name: "测试甲", studentNo: "1", group: "一组" }]
                  }
                ]
              : {
                  id: "class",
                  name: "测试班",
                  groups: ["一组"],
                  students: [{ id: "one", name: "测试甲", studentNo: "1", group: "一组" }]
                };
          if (failedRefresh) throw new Error("刷新失败");
          return {
            students: [{ ...student }],
            completed,
            rubrics: [{ id: "r1", category: "课堂表现", label: "积极发言", score: 2, enabled: true }],
            rewards: rewardDeleted ? [] : [{ id: "gift", name: "贴纸", cost: 1, stock: 2, enabled: true }],
            records: [],
            redemptions: [],
            settings: { maxLevel: 10, finalEnergy: 100, version: 1 }
          };
        }
        if (args.url.endsWith("sync")) return [];
        if (fail) throw new Error("网络中断");
        if (args.method === "DELETE" && args.url === "/api/pet-points/rewards/gift") rewardDeleted = true;
        if (args.url.endsWith("/complete")) {
          completed = [
            {
              id: "completed-a",
              studentId: "one",
              cycleId: "a",
              petId: student.petId,
              petName: student.petName,
              level: 10,
              stage: "终极形态",
              rules: { maxLevel: 10, finalEnergy: 100, version: 1 },
              earnedBadges: 50,
              completedAt: "2026-10-14T08:00:00Z"
            }
          ];
          student = {
            ...student,
            petId: "",
            petName: "",
            petExperience: 2,
            petProgress: 0,
            completedPets: 1,
            cycleId: "b",
            revision: 1,
            completionPending: false
          };
        } else if (args.url.endsWith("/pet")) {
          if (rejectBinding) throw new Error("绑定失败");
          student = {
            ...student,
            petId: args.data.petId as string,
            petName: args.data.petName as string,
            revision: student.revision + 1
          };
        } else if (args.url.endsWith("/adjust")) {
          student = {
            ...student,
            score: student.score + Number(args.data.delta),
            petExperience: student.petExperience + Number(args.data.delta),
            revision: student.revision + 1
          };
        }
        return {};
      }
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
  it("opens manual scoring from the pet and preserves a failed restock draft and operation", async () => {
    await mount();
    await click(container.querySelector('[aria-label="为测试甲评分"]')!);
    expect(document.body.textContent).toContain("自定义分值");
    expect(document.body.textContent).toContain("常用项目");
    await click(document.querySelector('[aria-label="关闭积分调整"]')!);
    await click(container.querySelector('[aria-label="设置"]')!);
    await click(button("奖品配置"));
    const input = document.querySelector<HTMLInputElement>('[aria-label="为贴纸补充库存数量"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "5");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    fail = true;
    await click(button("补充库存"));
    const first = writes().at(-1);
    expect(first.url).toBe("/api/pet-points/rewards/gift/stock");
    expect(first.data.quantity).toBe(5);
    expect(input.value).toBe("5");
    fail = false;
    await click(button("补充库存"));
    expect(writes().at(-1).data).toEqual(first.data);
    expect(input.value).toBe("1");
  });
  it("allows clearing a custom score, rejects invalid drafts and submits the replacement value", async () => {
    await mount();
    await click(container.querySelector('[aria-label="为测试甲加分"]')!);
    const input = document.querySelector<HTMLInputElement>("#score-adjust-value")!;
    const fill = async (value: string) =>
      act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    const count = writes().length;
    for (const value of ["", "0", "201", "1.5", "-1"]) {
      await fill(value);
      expect(input.value).toBe(value);
      const confirm = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(item =>
        item.textContent?.startsWith("确认加")
      )!;
      expect(confirm.disabled).toBe(true);
      await click(confirm);
      expect(writes()).toHaveLength(count);
    }
    await fill("12");
    await click(button("确认加 12 分"));
    expect(writes().at(-1).data.delta).toBe(12);
  });
  it("confirms reward deletion, allows cancellation and keeps failed deletion retryable", async () => {
    await mount();
    await click(container.querySelector('[aria-label="设置"]')!);
    await click(button("奖品配置"));
    const count = writes().length;
    await click(document.querySelector('[aria-label="删除奖品贴纸"]')!);
    await click(button("取消"));
    expect(writes()).toHaveLength(count);
    await click(document.querySelector('[aria-label="删除奖品贴纸"]')!);
    fail = true;
    await click(button("确认删除"));
    const first = writes().at(-1);
    expect(document.body.textContent).toContain("已有兑换记录会保留");
    expect(document.querySelector('[aria-label="删除奖品贴纸"]')).not.toBeNull();
    fail = false;
    await click(button("确认删除"));
    expect(writes().at(-1).data).toEqual(first.data);
    expect(writes().at(-1).method).toBe("DELETE");
    expect(document.querySelector('[aria-label="删除奖品贴纸"]')).toBeNull();
    expect(document.body.textContent).toContain("暂无奖品，请先创建");
  });
  it("shows the compact reward shop with cards, balance, records and management", async () => {
    await mount();
    await click(button("兑换站"));
    const dialog = document.querySelector('[aria-label="积分兑换站"]')!;
    expect(dialog.className).toContain("max-w-[880px]");
    expect(dialog.className).toContain("max-h-[80dvh]");
    expect(dialog.querySelector("article")?.textContent).toContain("贴纸");
    expect(dialog.textContent).toContain("可用积分 22");
    await click(button("兑换记录"));
    expect(dialog.textContent).toContain("该学生暂无兑换记录");
    await click(button("商品列表"));
    expect(document.querySelector('[aria-label="兑换贴纸"]')).not.toBeNull();
    await click(button("商店管理"));
    expect(document.querySelector('[aria-label="关闭兑换站"]')).toBeNull();
    expect(document.querySelector('[aria-label="关闭设置"]')).not.toBeNull();
  });
  it("configures the full-level badge reward while preserving manual badge controls", async () => {
    await mount();
    await click(container.querySelector('[aria-label="设置"]')!);
    await click(button("等级规则"));
    const input = document.querySelector<HTMLInputElement>('[aria-label="满级奖励成长徽章"]')!;
    expect(input.value).toBe("1");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "0.5");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(button("保存设置"));
    expect(writes().at(-1).data.completionBadges).toBe(0.5);
    await click(document.querySelector('[aria-label="关闭设置"]')!);
    await click(container.querySelector('[aria-label="养成记录"]')!);
    expect(document.querySelector('[aria-label="增加成长徽章"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="减少成长徽章"]')).not.toBeNull();
    await click(document.querySelector('[aria-label="增加成长徽章"]')!);
    expect(writes().at(-1).data.delta).toBe(0.5);
  });
  it("uses a medal for teacher badge adjustments and shows derived trophies in history", async () => {
    student = { ...student, trophies: 5.5 };
    await mount();
    await click(container.querySelector('[aria-label="养成记录"]')!);
    const history = document.querySelector('[aria-label="测试甲 的成长历程"]')!;
    const trophyLabel = Array.from(history.querySelectorAll("span")).find(item => item.textContent === "当前奖杯")!;
    expect(trophyLabel.parentElement?.querySelector("strong")?.textContent).toBe("2");
    const badgeAmount = history.querySelector('[aria-label="增加成长徽章"]')?.previousElementSibling;
    expect(badgeAmount?.textContent).toContain("5.5");
    expect(badgeAmount?.querySelector("svg.lucide-medal")).not.toBeNull();
    expect(badgeAmount?.querySelector("svg.lucide-trophy")).toBeNull();
  });
  it.each([0, 0.5, 1.5, 2, 5.5])(
    "shows badge totals and whole trophies on cards, hiding zero counts (%s)",
    async amount => {
      student = { ...student, trophies: amount };
      await mount();
      const badges = container.querySelector(`[aria-label="成长徽章 ${amount}"]`);
      const trophies = container.querySelector(`[aria-label="奖杯 ${Math.floor(amount / 2)}"]`);
      expect(Boolean(badges)).toBe(amount > 0);
      expect(Boolean(trophies)).toBe(amount >= 2);
      if (badges) expect(badges.querySelector("svg.lucide-medal")).not.toBeNull();
      if (trophies) expect(trophies.querySelector("svg.lucide-trophy")).not.toBeNull();
    }
  );
  it("search and sort never submit filtered rosters or delete hidden students", async () => {
    await mount();
    const count = writes().length;
    const input = container.querySelector<HTMLInputElement>('input[placeholder="姓名、拼音、学号"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "不存在");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(writes()).toHaveLength(count);
    expect(writes()[0].data).toEqual({ classId: "class" });
  });
  it("HTTP browsers without randomUUID can score and retry the same operation id", async () => {
    vi.stubGlobal("crypto", { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) });
    await mount();
    await click(container.querySelector('[aria-label="为测试甲加分"]')!);
    fail = true;
    await click(button("确认加 1 分"));
    expect(document.body.textContent).toContain("加分 · 测试甲");
    expect(document.body.textContent).toContain("网络中断");
    const first = writes().at(-1).data;
    expect(first.operationId).toMatch(/^[\w-]{8,64}$/);
    fail = false;
    await click(button("确认加 1 分"));
    expect(writes().at(-1).data).toEqual(first);
    expect(document.querySelector('[aria-label="关闭积分调整"]')).toBeNull();
  });
  it("releases the operation lock when preparing an operation id fails", async () => {
    const randomUUID = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("编号生成失败");
      })
      .mockReturnValue("recovered-operation-id");
    vi.stubGlobal("crypto", { randomUUID });
    await mount();
    await click(container.querySelector('[aria-label="为测试甲加分"]')!);
    await click(button("确认加 1 分"));
    expect(document.body.textContent).toContain("编号生成失败");
    expect(button("确认加 1 分").hasAttribute("disabled")).toBe(false);
    await click(button("确认加 1 分"));
    expect(writes().at(-1).data.operationId).toBe("recovered-operation-id");
    expect(document.querySelector('[aria-label="关闭积分调整"]')).toBeNull();
  });
  it("successful scoring with failed refresh closes the draft and provides read-only refresh", async () => {
    await mount();
    await click(container.querySelector('[aria-label="为测试甲加分"]')!);
    failedRefresh = true;
    await click(button("确认加 1 分"));
    expect(document.body.textContent).toContain("已保存，刷新失败");
    const count = writes().length;
    failedRefresh = false;
    await refreshFromSettings();
    expect(writes()).toHaveLength(count);
  });
  it("completes A, opens B selection and keeps completed achievement and badge history after cancel or failure", async () => {
    student = {
      ...student,
      petExperience: 102,
      score: 102,
      petProgress: 100,
      level: 10,
      trophies: 50,
      completionPending: true
    };
    await mount();
    await click(container.querySelector('[aria-label="养成记录"]')!);
    await click(button("完成本轮"));
    await click(button("完成并选新宠物"));
    expect(writes().filter(write => write.url.endsWith("complete"))).toHaveLength(1);
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await click(container.querySelector('[aria-label="养成记录"]')!);
    expect(document.body.textContent).toContain("小芽 · Lv.10");
    expect(document.body.textContent).toContain("满级成长纪念");
    await click(button("选择新宠物，开始下一轮"));
    const option = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(item =>
      item.textContent?.includes("云绒熊")
    )!;
    expect(option).toBeDefined();
    await click(option);
    rejectBinding = true;
    await click(button("确认选择宠物蛋"));
    expect(document.body.textContent).toContain("绑定失败");
    expect(document.querySelector('[aria-label="关闭宠物选择"]')).not.toBeNull();
    expect(completed).toHaveLength(1);
    expect(student.completedPets).toBe(1);
  });
  it("uses accessible dialogs, traps focus, closes on Escape and shows the existing reward configuration", async () => {
    await mount();
    await click(container.querySelector('[aria-label="设置"]')!);
    await click(button("奖品配置"));
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.querySelector('[aria-label="奖品名称"]')).not.toBeNull();
    expect(dialog.textContent).toContain("贴纸");
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("ignores an older overview response after a newer refresh has completed", async () => {
    await mount();
    const original = api.request.getMockImplementation()!;
    let release: (value: unknown) => void = () => undefined;
    let old = true;
    api.request.mockImplementation((args: string | { url: string }) => {
      if (typeof args === "string" && args === "/api/pet-points" && old) {
        old = false;
        return new Promise(resolve => {
          release = resolve;
        });
      }
      return original(args);
    });
    await refreshFromSettings();
    student = { ...student, score: 55, petExperience: 55 };
    await refreshFromSettings();
    await act(async () =>
      release({
        students: [{ ...student, score: 999, petExperience: 999 }],
        completed: [],
        rubrics: [],
        rewards: [],
        records: [],
        redemptions: [],
        settings: { maxLevel: 10, finalEnergy: 100, version: 1 }
      })
    );
    expect(container.textContent).not.toContain("999");
    expect(container.textContent).toContain("55");
  });
  it("uses current-cycle experience for the next pet egg and every rounded catalog threshold", async () => {
    student = {
      ...student,
      score: 202,
      petExperience: 2,
      level: 1,
      petProgress: 0,
      petHatched: false,
      cycleId: "b",
      completedPets: 1
    };
    await mount();
    expect(container.querySelector('[aria-label="芽团兽宠物蛋，孵化进度2/11"]')).not.toBeNull();
    expect(container.textContent).not.toContain("能量已满");
    await click(container.querySelector('[aria-label="养成记录"]')!);
    await click(button("更换当前宠物（保留进度）"));
    await click(
      Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(item =>
        item.textContent?.includes("云绒熊")
      )!
    );
    const dialog = document.querySelector('[aria-label="为 测试甲 选择孵化星灵"]')!;
    expect(dialog.textContent).toContain("11 经验");
    expect(dialog.textContent).toContain("22 经验");
    expect(dialog.textContent).not.toContain("23 经验");
  });
  it("keeps the unsaved level draft when a conflict refresh loads newer settings", async () => {
    await mount();
    await click(container.querySelector('[aria-label="设置"]')!);
    await click(button("等级规则"));
    const input = document.querySelector<HTMLInputElement>('input[max="10"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "4");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const original = api.request.getMockImplementation()!;
    api.request.mockImplementation(args =>
      typeof args !== "string" && args.url.endsWith("/settings")
        ? Promise.reject({ response: { status: 409, data: { message: "规则冲突" } } })
        : original(args)
    );
    await click(button("保存设置"));
    expect(input.value).toBe("4");
    expect(document.body.textContent).toContain("规则冲突");
  });
  it("reports the server's actual processed and skipped counts when absence changed after selection", async () => {
    const original = api.request.getMockImplementation()!;
    api.request.mockImplementation(async args => {
      if (typeof args === "string" && args === "/api/pet-points") {
        const overview = await original(args);
        return { ...overview, students: [student, { ...student, id: "two", name: "测试乙" }] };
      }
      if (typeof args !== "string" && args.url.endsWith("/batch-evaluate"))
        return { processedIds: ["one"], skippedIds: ["two"] };
      return original(args);
    });
    await mount();
    await click(button("批量"));
    await click(button("全选"));
    await click(button("确定评分"));
    await click(
      Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(item =>
        item.textContent?.includes("积极发言")
      )!
    );
    await click(button("确认评分"));
    expect(document.body.textContent).toContain("已为 1 名学生完成评分，跳过 1 名请假学生");
  });
});
