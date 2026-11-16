import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { statusStyles, TaskStats, type TaskItem } from "./TaskStats";

const demoTasks: TaskItem[] = [
  {
    id: "demo-task-1",
    title: "数学第一单元随堂练习与订正",
    className: "高一(1)班",
    type: "status",
    statusCount: 4,
    createdAt: "2026-11-16",
    items: [
      { id: "sub-1", title: "订正第 1 题集合错题" },
      { id: "sub-2", title: "完成课后思考题第 3 问" },
      { id: "sub-3", title: "上传草稿纸核验记录" }
    ],
    students: [
      {
        id: "s1",
        name: "陈小明",
        studentNo: "01",
        status: "已完成",
        checkedItemIds: ["sub-1", "sub-2", "sub-3"],
        photo: null
      },
      {
        id: "s2",
        name: "林晓雨",
        studentNo: "02",
        status: "待提交",
        checkedItemIds: ["sub-1"],
        photo: null
      },
      {
        id: "s3",
        name: "张伟",
        studentNo: "03",
        status: "待提交",
        checkedItemIds: ["sub-1", "sub-2"],
        photo: null
      },
      {
        id: "s4",
        name: "王芳",
        studentNo: "04",
        status: "未完成",
        checkedItemIds: [],
        photo: null
      },
      {
        id: "s5",
        name: "李娜",
        studentNo: "05",
        status: "已完成",
        checkedItemIds: ["sub-1", "sub-2", "sub-3"],
        photo: null
      },
      {
        id: "s6",
        name: "刘强",
        studentNo: "06",
        status: "未完成",
        checkedItemIds: [],
        photo: null
      },
      {
        id: "s7",
        name: "赵敏",
        studentNo: "07",
        status: "待提交",
        checkedItemIds: ["sub-2"],
        photo: null
      },
      {
        id: "s8",
        name: "孙阳",
        studentNo: "08",
        status: "已完成",
        checkedItemIds: ["sub-1", "sub-2", "sub-3"],
        photo: null
      }
    ]
  },
  {
    id: "demo-task-2",
    title: "语文晨读打卡（无子项手动轮转演示）",
    className: "高一(2)班",
    type: "status",
    statusCount: 3,
    createdAt: "2026-11-15",
    items: [],
    students: [
      { id: "s1", name: "陈小明", studentNo: "01", status: "已完成", photo: null },
      { id: "s2", name: "林晓雨", studentNo: "02", status: "待改正", photo: null },
      { id: "s3", name: "张伟", studentNo: "03", status: "未完成", photo: null },
      { id: "s4", name: "王芳", studentNo: "04", status: "已完成", photo: null }
    ]
  }
];

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/request", () => ({ default: mocks.request }));

describe("TaskStats Subitems & 三态 Logic", () => {
  it("defines status styles with correct colors and labels", () => {
    expect(statusStyles["已完成"].label).toContain("已完成（绿色）");
    expect(statusStyles["已完成"].bar).toContain("bg-emerald-500");

    expect(statusStyles["待改正"].label).toContain("待改正（红色）");
    expect(statusStyles["待改正"].bar).toContain("bg-rose-500");

    expect(statusStyles["未完成"].label).toContain("未完成（灰色）");
    expect(statusStyles["未完成"].bar).toContain("bg-slate-400");
  });
});

describe("TaskStats UI Component", () => {
  let root: ReturnType<typeof createRoot>;
  let container: HTMLDivElement;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mocks.request.mockReset();
    mocks.request.mockImplementation(async (input: string | { url: string; data?: { checked: boolean } }) => {
      if (input === "/api/task-stats") return demoTasks;
      if (input === "/api/classes") return [{ id: "class-1", name: "高一(1)班", students: [], groups: [] }];
      if (typeof input !== "string" && input.url.includes("/items/")) {
        const itemId = input.url.split("/").at(-1)!;
        const student = demoTasks[0]!.students[1]!;
        const checkedItemIds = [...(student.checkedItemIds ?? []), itemId];
        const previous = input.url.endsWith("/sub-3") ? [...checkedItemIds, "sub-2"] : checkedItemIds;
        return {
          id: student.id,
          checkedItemIds: previous,
          status: previous.length === 3 ? "已完成" : "待提交"
        };
      }
      return [];
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders task list with subitems badge and enters detail view with 4-column layout", async () => {
    await act(async () => {
      root.render(<TaskStats />);
    });

    // 验证初始示例任务卡片展示子项标签
    expect(container.textContent).toContain("任务统计");
    expect(container.textContent).toContain("数学第一单元随堂练习与订正");
    expect(container.textContent).toContain("含 3 个子项");

    // 点击进入详情页
    const taskCard = container.querySelector("article");
    expect(taskCard).not.toBeNull();
    await act(async () => {
      taskCard?.click();
    });

    // 验证详情页具有卡片模式 4 列网格类名 (xl:grid-cols-4)
    const mainGrid = container.querySelector("main");
    expect(mainGrid?.className).toContain("xl:grid-cols-4");

    // 卡片顶部保留学生信息，下方展示子项及完成数
    expect(container.textContent).toContain("陈小明");
    expect(container.textContent).toContain("#01");
    expect(container.textContent).toContain("订正第 1 题集合错题");
    expect(container.textContent).toContain("0/3 完成");
    expect(container.querySelector("main + footer")?.textContent).toContain("全班完成进度统计");
    expect(container.querySelector("footer")?.textContent).toContain("3/8 人已完成");
    const search = container.querySelector<HTMLInputElement>('input[placeholder="查找学员/学号..."]');
    expect(search).not.toBeNull();
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setValue?.call(search, "林晓雨");
      search?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(mainGrid?.textContent).not.toContain("陈小明");
    expect(container.querySelector("footer")?.textContent).toContain("3/8 人已完成");

    // 验证子项复选框存在并可勾选
    const checkboxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(checkboxes.length).toBeGreaterThan(0);
  });

  it("toggles subitem checkbox and derives student status", async () => {
    await act(async () => {
      root.render(<TaskStats />);
    });

    const taskCard = container.querySelector("article");
    await act(async () => {
      taskCard?.click();
    });

    // 查找林晓雨卡片（初始勾选了 1 项，状态为「待提交」）
    const studentCard = [...container.querySelectorAll("main > div")].find(
      el => el.textContent?.includes("林晓雨") && el.textContent?.includes("#02")
    );
    expect(studentCard).toBeDefined();
    expect(studentCard?.textContent).toContain("待提交");

    // 勾选未勾选的第 2 项子项
    const checkboxes = studentCard?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(checkboxes).toBeDefined();
    expect(checkboxes?.[0]?.checked).toBe(true);
    expect(checkboxes?.[1]?.checked).toBe(false);

    await act(async () => {
      checkboxes?.[1]?.click();
    });
    await act(async () => {
      checkboxes?.[2]?.click();
    });
    expect(studentCard?.textContent).toContain("3/3 完成");
    expect(studentCard?.textContent).toContain("已完成");
  });

  it("keeps the saved checklist and reports failed writes", async () => {
    await act(async () => {
      root.render(<TaskStats />);
    });
    await act(async () => {
      container.querySelector("article")?.click();
    });
    const checkbox = container.querySelector<HTMLInputElement>('input[aria-label^="林晓雨 - 完成"]');
    expect(checkbox?.checked).toBe(false);
    mocks.request.mockRejectedValueOnce(new Error("Unavailable"));
    await act(async () => {
      checkbox?.click();
    });
    expect(checkbox?.checked).toBe(false);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("进度保存失败");
  });

  it("returns from the edit form to the task list", async () => {
    await act(async () => {
      root.render(<TaskStats />);
    });
    await act(async () => {
      container.querySelector("article")?.click();
    });
    await act(async () => {
      [...container.querySelectorAll("button")].find(button => button.textContent === "编辑任务设置")?.click();
    });
    expect(container.querySelector("h2")?.textContent).toBe("编辑任务");
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="返回任务列表"]')?.click();
    });
    expect(container.querySelector("article")).not.toBeNull();
    expect(container.querySelector("footer")).toBeNull();
  });

  it("shows task progress and filters the report inclusively by creation date", async () => {
    await act(async () => {
      root.render(<TaskStats />);
    });
    expect(container.querySelector("article")?.textContent).toContain("待提交 3");
    await act(async () => {
      [...container.querySelectorAll("button")].find(button => button.textContent === "统计")?.click();
    });
    expect(container.querySelector("h1")?.textContent).toBe("任务完成统计");
    expect(container.textContent).toContain("5 / 12");
    const setDate = async (id: string, value: string) => {
      const input = container.querySelector<HTMLInputElement>(`#${id}`);
      expect(input).not.toBeNull();
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
        input?.dispatchEvent(new Event("input", { bubbles: true }));
        input?.dispatchEvent(new Event("change", { bubbles: true }));
      });
    };
    await setDate("task-report-from", "2026-11-16");
    await setDate("task-report-to", "2026-11-16");
    expect(container.textContent).toContain("3 / 8");
    expect(container.textContent).not.toContain("语文晨读打卡");
    const student = [...container.querySelectorAll("details")].find(row =>
      row.querySelector("summary")?.textContent?.includes("林晓雨")
    );
    expect(student?.querySelector("summary")?.textContent).toContain("待提交 1");
    await act(async () => {
      student?.querySelector("summary")?.click();
    });
    expect(student?.open).toBe(true);
    expect(student?.textContent).toContain("订正第 1 题集合错题");
    expect(student?.textContent).toContain("上传草稿纸核验记录");

    await setDate("task-report-to", "2026-11-15");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("开始日期不能晚于结束日期");
    await setDate("task-report-from", "2026-11-17");
    await setDate("task-report-to", "2026-11-17");
    expect(container.textContent).toContain("这个日期范围内没有任务");
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="返回任务列表"]')?.click();
    });
    expect(container.querySelectorAll("article")).toHaveLength(2);
  });

  it("combines the classroom filter with the date range across all report sections", async () => {
    await act(async () => {
      root.render(<TaskStats />);
    });
    await act(async () => {
      [...container.querySelectorAll("button")].find(button => button.textContent === "统计")?.click();
    });
    const classroom = container.querySelector<HTMLSelectElement>("#task-report-class");
    expect([...(classroom?.options ?? [])].map(option => option.text)).toEqual(["全部班级", "高一(1)班", "高一(2)班"]);
    await act(async () => {
      if (classroom) classroom.value = "高一(2)班";
      classroom?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.textContent).toContain("2 / 4");
    expect(container.textContent).not.toContain("数学第一单元随堂练习与订正");
    expect(container.textContent).not.toContain("孙阳");

    const from = container.querySelector<HTMLInputElement>("#task-report-from");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(from, "2026-11-16");
      from?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelector('[role="status"]')?.textContent).toContain("没有任务");
  });

  it("marks a checked student for correction and completes all subitems on review", async () => {
    await act(async () => {
      root.render(<TaskStats />);
    });
    await act(async () => {
      container.querySelector("article")?.click();
    });
    const cards = [...container.querySelectorAll("main > div")];
    const partial = cards.find(card => card.textContent?.includes("#02"));
    const zero = cards.find(card => card.textContent?.includes("#04"));
    const button = partial?.querySelector("button");
    expect(zero?.querySelector("button")).toBeNull();
    expect(button?.textContent).toBe("待改正");
    mocks.request.mockResolvedValueOnce({
      id: "s2",
      status: "待改正",
      checkedItemIds: ["sub-1"],
      needsCorrection: true
    });
    await act(async () => {
      button?.click();
    });
    expect(mocks.request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: "/api/task-stats/demo-task-1/students/s2/review",
        data: { action: "requestCorrection" }
      })
    );
    expect(button?.textContent).toBe("已完成");
    expect(partial?.textContent).toContain("1/3 完成");
    mocks.request.mockResolvedValueOnce({
      id: "s2",
      status: "已完成",
      checkedItemIds: ["sub-1", "sub-2", "sub-3"],
      needsCorrection: false
    });
    await act(async () => {
      button?.click();
    });
    expect(button?.textContent).toBe("待改正");
    expect(partial?.textContent).toContain("3/3 完成");
  });

  it("ranks single-task progress with ties and switches to remaining subitems", async () => {
    // jsdom does not implement the native dialog methods.
    if (!HTMLDialogElement.prototype.showModal) {
      HTMLDialogElement.prototype.showModal = function () {
        this.open = true;
      };
      HTMLDialogElement.prototype.close = function () {
        this.open = false;
      };
    }
    await act(async () => {
      root.render(<TaskStats />);
    });
    await act(async () => {
      container.querySelector("article")?.click();
    });
    await act(async () => {
      [...container.querySelectorAll("button")].find(button => button.textContent === "排名")?.click();
    });
    const dialog = container.querySelector("dialog");
    expect(dialog?.open).toBe(true);
    expect(dialog?.querySelector("h2")?.textContent).toBe("完成排行榜");
    const modes = dialog?.querySelector('[role="group"][aria-label="榜单类型"]');
    expect(modes?.querySelector('[aria-pressed="true"]')?.textContent).toBe("完成任务");
    expect(dialog?.textContent).toContain("已完成子项 / 总数");
    expect(
      [...dialog!.querySelectorAll("li [aria-label]")].slice(0, 4).map(rank => rank.getAttribute("aria-label"))
    ).toEqual(["第 1 名", "第 1 名", "第 1 名", "第 4 名"]);
    await act(async () => {
      [...dialog!.querySelectorAll("button")].find(button => button.textContent === "未完成任务")?.click();
    });
    expect(dialog?.querySelector("h2")?.textContent).toBe("未完成排行榜");
    expect(modes?.querySelector('[aria-pressed="true"]')?.textContent).toBe("未完成任务");
    expect(dialog?.textContent).toContain("未完成子项 / 总数");
    expect(dialog?.querySelector("li")?.textContent).toContain("王芳");
    await act(async () => {
      dialog?.dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    expect(container.querySelector("dialog")).toBeNull();
  });

  it("uses final statuses in the filtered cross-task leaderboard", async () => {
    await act(async () => {
      root.render(<TaskStats />);
    });
    await act(async () => {
      [...container.querySelectorAll("button")].find(button => button.textContent === "排行榜")?.click();
    });
    expect(container.querySelector("h2")?.textContent).toBe("完成排行榜");
    expect(container.querySelector("ol li")?.textContent).toContain("陈小明");
    const classroom = container.querySelector<HTMLSelectElement>("#task-report-class")!;
    await act(async () => {
      classroom.value = "高一(1)班";
      classroom.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      [...container.querySelectorAll("button")].find(button => button.textContent === "未完成任务")?.click();
    });
    expect(classroom.value).toBe("高一(1)班");
    expect(container.textContent).toContain("高一(1)班 · 1 项任务");
    expect(container.textContent).toContain("未完成任务 / 总数");
    const names = container.querySelector("ol")?.textContent;
    expect(names).toContain("王芳");
    expect(names).toContain("刘强");
    expect(names).not.toContain("林晓雨");
  });

  it("returns from the create form to the task list", async () => {
    await act(async () => {
      root.render(<TaskStats />);
    });

    const createBtn = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b =>
      b.textContent?.includes("新建任务")
    );
    expect(createBtn).toBeDefined();

    await act(async () => {
      createBtn?.click();
    });

    // 验证进入新建任务表单
    expect(container.textContent).toContain("新建任务");
    expect(container.textContent).toContain("任务内容子项");

    // 点击添加子项
    const addSubItemBtn = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b =>
      b.textContent?.includes("添加子项")
    );
    expect(addSubItemBtn).toBeDefined();

    await act(async () => {
      addSubItemBtn?.click();
    });

    expect(container.textContent).toContain("4 种任务状态");
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="返回任务列表"]')?.click();
    });
    expect(container.querySelector("article")).not.toBeNull();
    expect(container.textContent).not.toContain("添加子项");
  });
});
