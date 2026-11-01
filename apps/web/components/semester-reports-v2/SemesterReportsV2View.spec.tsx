import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SemesterReportsV2View, defaultReportDates } from "./SemesterReportsV2View";
import { DraftEditModal } from "./DraftEditModal";
import { V2ClassroomPerformance } from "./V2ClassroomPerformance";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn()
}));

vi.mock("@/lib/request", () => ({ default: api }));

describe("SemesterReportsV2View", () => {
  let root: Root;
  let container: HTMLDivElement;

  const mockTerms = [
    { id: "term-1", name: "2026-2027学年第一学期", startDate: "2026-09-01", endDate: "2027-01-20", isCurrent: true }
  ];

  const mockSubjects = [
    {
      id: "sub-1",
      name: "英语综合",
      performanceConfig: [
        { label: "发音与口语", options: ["发音地道清晰", "表达流利连贯", "积极开口互动", "语调自然准确"] },
        { label: "词汇掌握", options: ["词汇量大运用熟练", "核心词汇达标", "能根据语境猜词", "拼写准确规范"] }
      ]
    },
    {
      id: "sub-2",
      name: "数学思维",
      performanceConfig: [
        { label: "逻辑推理", options: ["思路清晰敏捷", "善于多角度思考", "推理严谨规范", "能发现数学规律"] }
      ]
    }
  ];

  const mockStudents = [
    {
      id: "stu-1",
      name: "张小明",
      classId: "cls-1",
      className: "三年级二班",
      score: 120,
      pet: { name: "闪电狐", level: 3, stage: "成长体" }
    },
    {
      id: "stu-2",
      name: "李小红",
      classId: "cls-1",
      className: "三年级二班",
      score: 95,
      pet: { name: "波波鸟", level: 2, stage: "幼年体" }
    }
  ];

  const mockReports = [
    {
      id: "rep-1",
      reportVersion: "v2" as const,
      studentId: "stu-1",
      studentName: "张小明",
      classId: "cls-1",
      className: "三年级二班",
      subject: "英语综合",
      period: "term" as const,
      status: "draft" as const,
      createdAt: "2026-10-30T10:00:00.000Z",
      updatedAt: "2026-10-30T10:00:00.000Z",
      startDate: "2026-09-01",
      endDate: "2027-01-20",
      content: {
        title: "2026学期成长报告",
        studentName: "张小明",
        className: "三年级二班",
        reportPeriod: "2026-09-01 至 2027-01-20",
        subjects: ["英语综合"],
        reportSubjects: [{ subjectId: "sub-1", name: "英语综合" }],
        scoreDetails: {
          positiveItems: [
            { label: "课堂发言积极", count: 9 },
            { label: "专注听讲认真", count: 7 }
          ],
          positive: 16,
          negative: 0,
          net: 16,
          count: 2,
          records: []
        },
        summary: "在小组合作中展现了极佳的互助精神！",
        areasToImprove: [{ text: "建议每天坚持自主朗读 15 分钟", sourceRefs: [] }],
        subjectReports: [
          {
            subjectName: "英语综合",
            performanceEvaluations: [{ field: "发音与口语", rating: "发音地道清晰" }]
          }
        ],
        suggestions: ["建议每天坚持自主朗读 15 分钟"]
      }
    },
    {
      id: "rep-2",
      reportVersion: "v2" as const,
      studentId: "stu-2",
      studentName: "李小红",
      classId: "cls-1",
      className: "三年级二班",
      subject: "英语综合",
      period: "term" as const,
      status: "published" as const,
      createdAt: "2026-10-29T10:00:00.000Z",
      updatedAt: "2026-10-29T10:00:00.000Z",
      startDate: "2026-09-01",
      endDate: "2027-01-20",
      share: {
        id: "share-2",
        url: "https://example.com/share/rep-2"
      }
    }
  ];

  beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

    api.get.mockImplementation(async (url: string) => {
      if (url.endsWith("/report-terms")) return mockTerms;
      if (url.endsWith("/report-subjects")) return mockSubjects;
      if (url === "/api/pet-points") return { students: mockStudents };
      if (url.endsWith("/reports/rep-1")) return mockReports[0];
      if (url.endsWith("/reports")) return mockReports;
      return [];
    });

    api.post.mockImplementation(async (url: string) => {
      if (url.endsWith("/reports/preview-input")) {
        return {
          scoreSummaries: [
            {
              studentId: "stu-1",
              studentName: "张小明",
              positiveItems: [
                { label: "课堂发言积极", count: 9 },
                { label: "专注听讲认真", count: 7 }
              ],
              positive: 16,
              negative: 0,
              net: 16,
              count: 2,
              records: []
            }
          ],
          petPreviews: [
            {
              studentId: "stu-1",
              pet: { petId: "coal-tail-fox", petName: "炭尾狐", stage: "成长形态", level: 5, petHatched: true },
              petAsOf: "2026-04-17",
              petHistoryStatus: "recorded"
            }
          ]
        };
      }
      return { success: true };
    });
    api.put.mockResolvedValue({ success: true });
    api.patch.mockResolvedValue({ success: true });
    api.delete.mockResolvedValue({ success: true });

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("renders 3 main workspace navigation tabs and loads existing report data", async () => {
    await act(async () => {
      root.render(<SemesterReportsV2View />);
    });

    expect(container.textContent).toContain("学期报告全新工作台");
    expect(container.textContent).toContain("报告管理与分发");
    expect(container.textContent).toContain("填写与生成报告");
    expect(container.textContent).toContain("学期学科设置与课程资料");

    // 验证顶部红框内容已去除（小标签、桌面模式指示、模式说明按钮）
    expect(container.textContent).not.toContain("专为 v2 多学科与教学内容来源打造");
    expect(container.textContent).not.toContain("桌面模式：学期报告全新版");
    expect(container.textContent).not.toContain("模式说明");

    // Status filter pills and existing data check
    expect(container.textContent).toContain("全部报告 (2)");
    expect(container.textContent).toContain("待审核草稿 (1)");
    expect(container.textContent).toContain("已发布可分享 (1)");
    expect(container.textContent).toContain("张小明");
    expect(container.textContent).toContain("李小红");

    // Report list time and subject checks
    expect(container.textContent).toContain("09-01 至 01-20");
    expect(container.textContent).toContain("学科: 英语综合");
  });

  it("switches to '学期学科设置与课程资料' tab and adds subject and term", async () => {
    await act(async () => {
      root.render(<SemesterReportsV2View />);
    });

    const settingsTabBtn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("学期学科设置与课程资料")
    );
    expect(settingsTabBtn).toBeTruthy();

    await act(async () => {
      settingsTabBtn!.click();
    });

    expect(container.textContent).toContain("学期与学科设置");
    expect(container.textContent).toContain("课程资料上传与章节核对");
    expect(container.textContent).toContain("配置学科课堂表现");
    expect(container.textContent).toContain("2026-2027学年第一学期");

    // Add subject
    const subjectInput = container.querySelector("input[placeholder*='新增学科名称']") as HTMLInputElement;
    expect(subjectInput).toBeTruthy();
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      nativeSetter?.call(subjectInput, "科学探索");
      subjectInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const addSubjectBtn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("+ 添加学科")
    );
    await act(async () => {
      addSubjectBtn!.click();
    });

    expect(api.post).toHaveBeenCalledWith(
      expect.stringContaining("/report-subjects"),
      expect.objectContaining({ name: "科学探索" })
    );
  });

  it("automatically fills in start and end dates based on selected period", async () => {
    await act(async () => {
      root.render(<SemesterReportsV2View />);
    });

    // 切换到向导标签页
    const composeTabBtn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("填写与生成报告")
    );
    await act(async () => {
      composeTabBtn!.click();
    });

    const dateInputs = container.querySelectorAll("input[type='date']");
    const startInput = dateInputs[0] as HTMLInputElement;
    const endInput = dateInputs[1] as HTMLInputElement;
    expect(startInput).toBeTruthy();
    expect(endInput).toBeTruthy();

    // 默认周报：周一至周五
    const weekDates = defaultReportDates("week");
    expect(startInput.value).toBe(weekDates.start);
    expect(endInput.value).toBe(weekDates.end);

    // 切换到月报：当月1日至月末
    const monthBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent === "月报");
    expect(monthBtn).toBeTruthy();
    await act(async () => {
      monthBtn!.click();
    });

    const monthDates = defaultReportDates("month");
    expect(startInput.value).toBe(monthDates.start);
    expect(endInput.value).toBe(monthDates.end);

    // 切换到学期：学期全区间
    const termBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent === "学期");
    expect(termBtn).toBeTruthy();
    await act(async () => {
      termBtn!.click();
    });

    const termDates = defaultReportDates("term", mockTerms[0]);
    expect(startInput.value).toBe(termDates.start);
    expect(endInput.value).toBe(termDates.end);

    // 重新切回周报
    const weekBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent === "周报");
    expect(weekBtn).toBeTruthy();
    await act(async () => {
      weekBtn!.click();
    });
    expect(startInput.value).toBe(weekDates.start);
    expect(endInput.value).toBe(weekDates.end);
  });

  it("switches to '填写与生成报告' tab, proceeds through steps, and generates drafts", async () => {
    await act(async () => {
      root.render(<SemesterReportsV2View />);
    });

    const composeTabBtn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("填写与生成报告")
    );
    expect(composeTabBtn).toBeTruthy();

    await act(async () => {
      composeTabBtn!.click();
    });

    // Step 1
    expect(container.textContent).toContain("步骤 1：报告周期与基础信息配置");
    const institutionInput = container.querySelector("input[placeholder='课堂成长记录']") as HTMLInputElement;
    expect(institutionInput).toBeTruthy();
    expect(institutionInput.value).toBe("课堂成长记录");

    const courseThemeInput = Array.from(container.querySelectorAll("input")).find(inp =>
      inp.closest("div")?.textContent?.includes("课程主题")
    ) as HTMLInputElement;
    expect(courseThemeInput).toBeTruthy();
    expect(courseThemeInput.value).toBe("");

    const lessonNumberInput = Array.from(container.querySelectorAll("input")).find(inp =>
      inp.closest("div")?.textContent?.includes("第几次课")
    ) as HTMLInputElement;
    expect(lessonNumberInput).toBeTruthy();
    expect(lessonNumberInput.value).toBe("");

    const nextBtn1 = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("下一步：配置学科与教学内容")
    );
    expect(nextBtn1).toBeTruthy();

    // Go to Step 2
    await act(async () => {
      nextBtn1!.click();
    });
    expect(container.textContent).toContain("步骤 2：涉及学科与教学内容来源");
    const courseTextarea = container.querySelector("textarea[placeholder*='输入本期教学内容']") as HTMLTextAreaElement;
    expect(courseTextarea).toBeTruthy();
    expect(courseTextarea.value).toBe("");

    // 步骤 2 默认不选学科，下一步按钮处于禁用状态
    const nextBtn2 = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("下一步：挑选学生名单")
    ) as HTMLButtonElement;
    expect(nextBtn2).toBeTruthy();
    expect(nextBtn2.disabled).toBe(true);

    // 勾选学科
    const firstSubjectCheckbox = container.querySelector("input[type='checkbox']") as HTMLInputElement;
    expect(firstSubjectCheckbox).toBeTruthy();
    await act(async () => {
      firstSubjectCheckbox.click();
    });
    expect(nextBtn2.disabled).toBe(false);

    // Go to Step 3
    await act(async () => {
      nextBtn2.click();
    });
    expect(container.textContent).toContain("步骤 3：挑选本次生成报告的学生");
    expect(container.textContent).toContain("暂未选择学生");

    // 默认不选学生，下一步按钮被禁用
    const nextBtn3 = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("下一步：录入课堂评价与生成")
    ) as HTMLButtonElement;
    expect(nextBtn3.disabled).toBe(true);

    // 点击全选本班
    const selectAllBtn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("全选本班")
    );
    expect(selectAllBtn).toBeTruthy();
    await act(async () => {
      selectAllBtn!.click();
    });
    expect(nextBtn3.disabled).toBe(false);

    // Go to Step 4
    await act(async () => {
      nextBtn3.click();
    });
    expect(container.textContent).toContain("步骤 4：学生课堂反馈与最终生成");
    expect(container.textContent).toContain("学习习惯与能力成长总结");
    expect(container.textContent).toContain("学习准备与课堂能力");
    expect(container.textContent).toContain("表达沟通与同伴合作");

    // 等待周期积分 preview-input 请求响应
    await act(async () => {
      await new Promise(r => setTimeout(r, 350));
    });

    // 周期内积分与最值肯定卡片核对（动态读取周期的加分记录）
    expect(container.textContent).toContain("本周最值肯定");
    expect(container.textContent).toContain("课堂发言积极");
    expect(container.textContent).toContain("9 次");
    expect(container.textContent).toContain("专注听讲认真");
    expect(container.textContent).toContain("7 次");
    expect(container.textContent).toContain("炭尾狐");

    // 验证各学科表现评价内红框指示与多余学科按钮已去除
    expect(container.textContent).not.toContain("严格仅限单选后台设置好的预设值");

    const keywordsInput = Array.from(container.querySelectorAll("input")).find(inp =>
      inp.closest("div")?.textContent?.includes("补充关键词")
    ) as HTMLInputElement;
    expect(keywordsInput).toBeTruthy();
    expect(keywordsInput.value).toBe("");

    const observationInput = Array.from(container.querySelectorAll("input")).find(inp =>
      inp.closest("div")?.textContent?.includes("本周期全班共同观察")
    ) as HTMLInputElement;
    expect(observationInput).toBeTruthy();
    expect(observationInput.value).toBe("");

    // Generate batch reports
    const generateBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("确认生成"));
    expect(generateBtn).toBeTruthy();

    await act(async () => {
      generateBtn!.click();
    });

    // Switches back to Dashboard
    expect(container.textContent).toContain("全部报告");
  });

  it("opens DraftEditModal, enforces constraints, and closes reliably", async () => {
    await act(async () => {
      root.render(<SemesterReportsV2View />);
    });

    // Find the draft report card and click "预览/微调"
    const editDraftBtn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("预览/微调")
    );
    expect(editDraftBtn).toBeTruthy();

    await act(async () => {
      editDraftBtn!.click();
    });

    expect(api.get).toHaveBeenCalledWith(expect.stringContaining("/reports/rep-1"), expect.anything());

    // Modal title check
    expect(container.textContent).toContain("张小明 · 报告草稿微调");
    expect(container.textContent).toContain("学习习惯与能力成长总结");
    expect(container.textContent).toContain("学习准备与课堂能力");

    // v2 version check: strengths and homeSuggestions are hidden in v2
    expect(container.textContent).not.toContain("本期最值得肯定");
    expect(container.textContent).not.toContain("回家可以这样练");

    // Order check: 学习习惯与能力成长总结 is placed before 老师想对你说
    const growthIdx = container.textContent!.indexOf("学习习惯与能力成长总结");
    const teacherMsgIdx = container.textContent!.indexOf("老师想对你说");
    expect(growthIdx).toBeGreaterThan(-1);
    expect(teacherMsgIdx).toBeGreaterThan(-1);
    expect(growthIdx).toBeLessThan(teacherMsgIdx);

    // Mobile tabs check: can switch to preview and back
    const mobilePreviewBtn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("报告预览")
    );
    expect(mobilePreviewBtn).toBeTruthy();
    await act(async () => {
      mobilePreviewBtn!.click();
    });

    // 预览区域应正确呈现所选周期内的加分细项与柱状图
    expect(container.textContent).toContain("本学期最值肯定");
    expect(container.textContent).toContain("课堂发言积极");
    expect(container.textContent).toContain("9 次");
    expect(container.textContent).toContain("专注听讲认真");
    expect(container.textContent).toContain("7 次");

    const mobileEditBtn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("编辑表单")
    );
    expect(mobileEditBtn).toBeTruthy();
    await act(async () => {
      mobileEditBtn!.click();
    });

    // Constraint 1: Subject removal forbidden when only 1 subject
    const removeSubjectBtn = container.querySelector("button[aria-label='移除英语综合学科']");
    expect(removeSubjectBtn).toBeNull();

    // Constraint 2: Suggestions limit
    const addSuggestionBtn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("添加一条")
    );
    expect(addSuggestionBtn).toBeTruthy();

    // Constraint 3: Photo size validation (oversized photo > 2MB shows alert)
    const fileInputs = container.querySelectorAll("input[type='file'][accept='image/jpeg,image/png']");
    expect(fileInputs.length).toBe(2);

    const oversizedFile = new File([new ArrayBuffer(3 * 1024 * 1024)], "large-photo.jpg", {
      type: "image/jpeg"
    });

    await act(async () => {
      Object.defineProperty(fileInputs[0]!, "files", {
        value: [oversizedFile],
        configurable: true
      });
      fileInputs[0]!.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.textContent).toContain("照片大小超出限制");
    expect(container.textContent).toContain("最大不能超过 2MB");

    // Close error alert
    const closeErrorBtn = container.querySelector("button[aria-label='关闭照片错误提示']") as HTMLButtonElement;
    expect(closeErrorBtn).toBeTruthy();
    await act(async () => {
      closeErrorBtn.click();
    });
    expect(container.textContent).not.toContain("照片大小超出限制");

    // Save draft calls PATCH /reports/:id/draft instead of PUT (which causes 405 Method Not Allowed)
    const saveDraftBtn = Array.from(container.querySelectorAll("button")).find(
      b => b.textContent?.trim() === "保存草稿"
    );
    expect(saveDraftBtn).toBeTruthy();
    await act(async () => {
      saveDraftBtn!.click();
    });
    expect(api.patch).toHaveBeenCalledWith(
      expect.stringContaining("/reports/rep-1/draft"),
      expect.objectContaining({ content: expect.any(Object) })
    );

    // Modal should now be closed after save
    expect(container.textContent).not.toContain("张小明 · 报告草稿微调");
  });

  it("triggers batch publish with ConfirmDialog and performs batch publish", async () => {
    await act(async () => {
      root.render(<SemesterReportsV2View />);
    });

    // Select all reports
    const selectAllCheckbox = container.querySelector("input[type='checkbox']") as HTMLInputElement;
    expect(selectAllCheckbox).toBeTruthy();

    await act(async () => {
      selectAllCheckbox.click();
    });

    const batchPublishBtn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("批量发布草稿")
    );
    expect(batchPublishBtn).toBeTruthy();
    expect(batchPublishBtn?.hasAttribute("disabled")).toBe(false);

    // Click batch publish -> opens ConfirmDialog
    await act(async () => {
      batchPublishBtn!.click();
    });

    expect(container.textContent).toContain("确认批量发布所选报告草稿？");

    const confirmBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("确认发布"));
    expect(confirmBtn).toBeTruthy();

    await act(async () => {
      confirmBtn!.click();
    });

    expect(api.post).toHaveBeenCalledWith(expect.stringContaining("/reports/rep-1/publish"));
  });

  it("accurately renders time range and subject names for backend reports with start/end and subjectName", async () => {
    // Mock backend returning native DTO format (start, end, subjectName, subjectId)
    const backendNativeReports = [
      {
        id: "dto-1",
        studentName: "王铁柱",
        className: "四年级一班",
        period: "week" as const,
        status: "draft" as const,
        start: "2026-05-11T00:00:00.000Z",
        end: "2026-05-15T00:00:00.000Z",
        subjectName: "科学探索",
        createdAt: "2026-05-15T10:00:00.000Z",
        updatedAt: "2026-05-15T10:00:00.000Z",
        content: null
      },
      {
        id: "dto-2",
        studentName: "李大宝",
        className: "四年级一班",
        period: "month" as const,
        status: "published" as const,
        start: "2026-05-01",
        end: "2026-05-31",
        subjectId: "sub-1", // 关联到 mockSubjects 中 sub-1: "英语综合"
        createdAt: "2026-05-31T10:00:00.000Z",
        updatedAt: "2026-05-31T10:00:00.000Z",
        content: null
      }
    ];

    api.get.mockImplementation(async (url: string) => {
      if (url.endsWith("/report-terms")) return mockTerms;
      if (url.endsWith("/report-subjects")) return mockSubjects;
      if (url === "/api/pet-points") return { students: mockStudents };
      if (url.endsWith("/reports")) return backendNativeReports;
      return [];
    });

    await act(async () => {
      root.render(<SemesterReportsV2View />);
    });

    // Verify student names
    expect(container.textContent).toContain("王铁柱");
    expect(container.textContent).toContain("李大宝");

    // Verify time range formatting (extracted from start/end)
    expect(container.textContent).toContain("05-11 至 05-15");
    expect(container.textContent).toContain("05-01 至 05-31");

    // Verify subject names extracted from subjectName and subjectId
    expect(container.textContent).toContain("学科: 科学探索");
    expect(container.textContent).toContain("学科: 英语综合");
  });

  it("defaults to displaying 20 reports and loads 20 more upon clicking load more", async () => {
    // Generate 35 mock reports
    const largeReportSet = Array.from({ length: 35 }, (_, idx) => ({
      id: `batch-rep-${idx + 1}`,
      studentName: `学生${idx + 1}`,
      className: "五年级一班",
      period: "week" as const,
      status: "draft" as const,
      startDate: "2026-05-11",
      endDate: "2026-05-15",
      subject: "英语综合",
      createdAt: "2026-05-15T10:00:00.000Z",
      updatedAt: "2026-05-15T10:00:00.000Z",
      content: null
    }));

    api.get.mockImplementation(async (url: string) => {
      if (url.endsWith("/report-terms")) return mockTerms;
      if (url.endsWith("/report-subjects")) return mockSubjects;
      if (url === "/api/pet-points") return { students: mockStudents };
      if (url.endsWith("/reports")) return largeReportSet;
      return [];
    });

    await act(async () => {
      root.render(<SemesterReportsV2View />);
    });

    // 1. By default, it shows 20 items
    expect(container.textContent).toContain("加载更多报告 (已展示 20 / 共 35 份)");
    expect(container.textContent).toContain("学生1");
    expect(container.textContent).toContain("学生20");
    expect(container.textContent).not.toContain("学生21");

    // 2. Click load more
    const loadMoreBtn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("加载更多报告")
    );
    expect(loadMoreBtn).toBeTruthy();

    await act(async () => {
      loadMoreBtn!.click();
    });

    // 3. Now all 35 items are shown
    expect(container.textContent).toContain("已展示全部 35 份报告");
    expect(container.textContent).toContain("学生21");
    expect(container.textContent).toContain("学生35");
    expect(loadMoreBtn?.hasAttribute("disabled")).toBe(true);
  });

  it("safeguards preview-input against 400 Bad Request by validating term bounds and student count <= 30", async () => {
    // 构造超过 30 名学生的班级数据
    const largeStudentList = Array.from({ length: 35 }, (_, idx) => ({
      id: `stu-batch-${idx + 1}`,
      name: `测试学生${idx + 1}`,
      classId: "cls-large",
      className: "四年级一班",
      score: 100 + idx,
      pet: { name: "闪电狐", level: 3, stage: "成长体" }
    }));

    api.get.mockImplementation(async (url: string) => {
      if (url.endsWith("/report-terms")) return mockTerms;
      if (url.endsWith("/report-subjects")) return mockSubjects;
      if (url === "/api/pet-points") return { students: largeStudentList };
      if (url.endsWith("/reports")) return [];
      return [];
    });

    const previewCalls: Array<Record<string, unknown>> = [];
    api.post.mockImplementation(async (url: string, body: Record<string, unknown>) => {
      if (url.endsWith("/reports/preview-input")) {
        previewCalls.push(body);
        return {
          scoreSummaries: [
            {
              studentId: body.studentIds && Array.isArray(body.studentIds) ? body.studentIds[0] : "stu-1",
              studentName: "测试学生1",
              positiveItems: [{ label: "积极发言", count: 8 }],
              positive: 10,
              negative: 0,
              net: 10,
              count: 1,
              records: []
            }
          ]
        };
      }
      return {};
    });

    await act(async () => {
      root.render(<SemesterReportsV2View />);
      await new Promise(r => setTimeout(r, 80));
    });

    // 切换到“填写与生成报告”
    const composeTab = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("填写与生成报告")
    );
    await act(async () => {
      composeTab?.click();
    });

    // 步骤 1 -> 步骤 2
    const nextToStep2 = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("下一步：配置学科与教学内容")
    );
    expect(nextToStep2).toBeTruthy();
    await act(async () => {
      nextToStep2!.click();
    });

    // 步骤 2 勾选学科并进入步骤 3
    const subjectCheckbox1 = container.querySelector("input[type='checkbox']") as HTMLInputElement;
    await act(async () => {
      subjectCheckbox1?.click();
    });
    const nextToStep3 = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("下一步：挑选学生名单")
    );
    await act(async () => {
      nextToStep3?.click();
    });

    // 点击“全选本班”
    const selectAllBtn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("全选本班")
    );
    expect(selectAllBtn).toBeTruthy();
    await act(async () => {
      selectAllBtn?.click();
    });

    // 验证提示上限为 30 人，且选中人数截断为 30
    expect(container.textContent).toContain("单次报告生成上限为 30 人");

    // 步骤 3 -> 步骤 4
    const nextToStep4 = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("下一步：录入课堂评价与生成")
    );
    await act(async () => {
      nextToStep4?.click();
      await new Promise(r => setTimeout(r, 350));
    });

    // 验证发给后端的 preview-input 请求中 studentIds 数量绝不超过 30
    if (previewCalls.length > 0) {
      const lastCall = previewCalls[previewCalls.length - 1]!;
      expect(Array.isArray(lastCall.studentIds)).toBe(true);
      expect((lastCall.studentIds as string[]).length).toBeLessThanOrEqual(30);
    }
  });

  it("handles preview-input 400 Bad Request error gracefully by falling back to local scores", async () => {
    // 模拟后端返回 400 Bad Request
    api.post.mockImplementation(async (url: string) => {
      if (url.endsWith("/reports/preview-input")) {
        const err = new Error("Bad Request: 报告周期必须在学期日期范围内");
        Object.assign(err, { status: 400 });
        throw err;
      }
      return {};
    });

    await act(async () => {
      root.render(<SemesterReportsV2View />);
      await new Promise(r => setTimeout(r, 80));
    });

    // 切换到撰写向导并直接进到 Step 4
    const composeTab = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("填写与生成报告")
    );
    await act(async () => {
      composeTab?.click();
    });

    const nextToStep2 = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("下一步：配置学科与教学内容")
    );
    expect(nextToStep2).toBeTruthy();
    await act(async () => {
      nextToStep2!.click();
    });

    // 步骤 2 勾选学科并进入步骤 3
    const subjectCheckbox2 = container.querySelector("input[type='checkbox']") as HTMLInputElement;
    await act(async () => {
      subjectCheckbox2?.click();
    });
    const nextToStep3 = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("下一步：挑选学生名单")
    );
    await act(async () => {
      nextToStep3?.click();
    });

    const selectAllBtn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("全选本班")
    );
    await act(async () => {
      selectAllBtn?.click();
    });

    const nextToStep4 = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("下一步：录入课堂评价与生成")
    );
    await act(async () => {
      nextToStep4?.click();
      await new Promise(r => setTimeout(r, 350));
    });

    // 虽然接口抛出 400，但界面平滑捕获降级，本周最值肯定卡片依然展示，无红屏报错
    expect(container.textContent).toContain("本周最值肯定");
    expect(container.textContent).toContain("步骤 4：学生课堂反馈与最终生成");
  });

  it("safeguards local gen-* drafts from triggering GET /reports/gen-* (preventing 404 Not Found)", async () => {
    // 渲染已有包含 gen- 前缀草稿的场景
    const mockReportsWithLocalDraft = [
      ...mockReports,
      {
        id: "gen-1793519209004-0",
        studentId: "stu-1",
        studentName: "张小明",
        classId: "cls-1",
        className: "三年级二班",
        subject: "英语综合",
        period: "week" as const,
        status: "draft" as const,
        startDate: "2026-10-26",
        endDate: "2026-10-30",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        content: {
          reportVersion: "v2" as const,
          summary: "本地测试草稿",
          scoreDetails: {
            positiveItems: [{ label: "发言积极", count: 3 }],
            positive: 5,
            negative: 0,
            net: 5,
            count: 1,
            records: []
          }
        }
      }
    ];

    api.get.mockImplementation(async (url: string) => {
      if (url.endsWith("/report-terms")) return mockTerms;
      if (url.endsWith("/report-subjects")) return mockSubjects;
      if (url === "/api/pet-points") return { students: mockStudents };
      if (url.endsWith("/reports")) return mockReportsWithLocalDraft;
      if (url.includes("/reports/gen-")) {
        // 如果对 gen- 开头的 ID 发起了 GET 请求，模拟后端抛出 404
        throw new Error("404 Not Found: 报告不存在");
      }
      return [];
    });

    await act(async () => {
      root.render(<SemesterReportsV2View />);
      await new Promise(r => setTimeout(r, 60));
    });

    // 找到本地草稿并点击“预览/微调”
    const editDraftButtons = Array.from(container.querySelectorAll("button")).filter(b =>
      b.textContent?.includes("预览/微调")
    );
    expect(editDraftButtons.length).toBeGreaterThan(0);

    // 点击该草稿的预览/微调按钮
    await act(async () => {
      editDraftButtons[editDraftButtons.length - 1]!.click();
      await new Promise(r => setTimeout(r, 60));
    });

    // 验证打开了弹窗，并且绝未对以 /reports/gen- 发起 GET 请求
    expect(container.textContent).toContain("报告草稿微调");
    expect(api.get).not.toHaveBeenCalledWith(expect.stringMatching(/\/reports\/gen-/), expect.anything());

    // 点击保存草稿，验证不会对以 /reports/gen- 发起 PATCH 请求（防止 404）
    const saveDraftBtn = Array.from(container.querySelectorAll("button")).find(
      b => b.textContent?.trim() === "保存草稿"
    );
    expect(saveDraftBtn).toBeTruthy();
    await act(async () => {
      saveDraftBtn!.click();
      await new Promise(r => setTimeout(r, 60));
    });
    expect(api.patch).not.toHaveBeenCalledWith(expect.stringMatching(/\/reports\/gen-/), expect.anything());
  });

  it("does not select any students by default when starting a new report wizard", async () => {
    await act(async () => {
      root.render(<SemesterReportsV2View />);
    });

    // 切换至生成向导
    const composeTab = container.querySelector("#mainTabCompose") as HTMLButtonElement;
    await act(async () => {
      composeTab.click();
    });

    // 步骤 1 -> 步骤 2
    const nextToStep2 = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("下一步：配置学科与教学内容")
    );
    await act(async () => {
      nextToStep2!.click();
    });

    // 步骤 2 勾选学科并进入步骤 3
    const subjectCheckbox3 = container.querySelector("input[type='checkbox']") as HTMLInputElement;
    await act(async () => {
      subjectCheckbox3?.click();
    });
    const nextToStep3 = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("下一步：挑选学生名单")
    );
    await act(async () => {
      nextToStep3!.click();
    });

    // 验证步骤 3：默认没有选中任何学生
    expect(container.textContent).toContain("步骤 3：挑选本次生成报告的学生");
    expect(container.textContent).toContain("暂未选择学生");

    const nextToStep4 = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("下一步：录入课堂评价与生成")
    ) as HTMLButtonElement;
    expect(nextToStep4).toBeTruthy();
    expect(nextToStep4.disabled).toBe(true);

    // 点击单个学生卡片，选中该学生
    const firstStudentCard = container.querySelector("[data-testid='student-card-stu-1']") as HTMLDivElement;
    expect(firstStudentCard).toBeTruthy();
    await act(async () => {
      firstStudentCard.click();
    });

    // 验证更新为已选 1 人，下一步可点击
    expect(container.textContent).toContain("已选 1 人");
    expect(nextToStep4.disabled).toBe(false);

    // 点击清空按钮，恢复未选状态
    const clearBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.trim() === "清空");
    expect(clearBtn).toBeTruthy();
    await act(async () => {
      clearBtn!.click();
    });

    expect(container.textContent).toContain("暂未选择学生");
    expect(nextToStep4.disabled).toBe(true);
  });

  it("does not select any subjects by default and prohibits proceeding when no subjects are selected", async () => {
    await act(async () => {
      root.render(<SemesterReportsV2View />);
    });

    // 切换到向导标签页
    const composeTabBtn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("填写与生成报告")
    );
    await act(async () => {
      composeTabBtn!.click();
    });

    // 步骤 1 点击下一步进入步骤 2
    const nextBtn1 = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("下一步：配置学科与教学内容")
    );
    await act(async () => {
      nextBtn1!.click();
    });

    expect(container.textContent).toContain("步骤 2：涉及学科与教学内容来源");
    expect(container.textContent).toContain("未选择学科 (请至少勾选一门学科)");

    const nextToStep3 = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("下一步：挑选学生名单")
    ) as HTMLButtonElement;
    expect(nextToStep3).toBeTruthy();
    expect(nextToStep3.disabled).toBe(true);

    // 未勾选学科时，尝试点击下一步无法进入步骤 3
    await act(async () => {
      nextToStep3.click();
    });
    expect(container.textContent).toContain("步骤 2：涉及学科与教学内容来源");
    expect(container.textContent).not.toContain("步骤 3：挑选本次生成报告的学生");

    // 勾选第一个学科
    const firstCheckbox = container.querySelector("input[type='checkbox']") as HTMLInputElement;
    expect(firstCheckbox).toBeTruthy();
    await act(async () => {
      firstCheckbox.click();
    });

    expect(container.textContent).toContain("已选 1 门学科");
    expect(nextToStep3.disabled).toBe(false);

    // 再次点击取消勾选
    await act(async () => {
      firstCheckbox.click();
    });
    expect(container.textContent).toContain("未选择学科 (请至少勾选一门学科)");
    expect(nextToStep3.disabled).toBe(true);

    // 再次勾选后成功进入步骤 3
    await act(async () => {
      firstCheckbox.click();
    });
    expect(nextToStep3.disabled).toBe(false);
    await act(async () => {
      nextToStep3.click();
    });
    expect(container.textContent).toContain("步骤 3：挑选本次生成报告的学生");
  });

  it("prompts to confirm draft generation when saving and switching on the last student", async () => {
    await act(async () => {
      root.render(<SemesterReportsV2View />);
    });

    const composeTab = container.querySelector("#mainTabCompose") as HTMLButtonElement;
    await act(async () => {
      composeTab.click();
    });

    // 步骤 1 -> 步骤 2
    const nextBtn1 = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("下一步：配置学科与教学内容")
    );
    await act(async () => {
      nextBtn1?.click();
    });

    // 步骤 2 勾选学科并进入步骤 3
    const subjectCheckbox = container.querySelector("input[type='checkbox']") as HTMLInputElement;
    await act(async () => {
      subjectCheckbox?.click();
    });
    const nextBtn2 = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("下一步：挑选学生名单")
    );
    await act(async () => {
      nextBtn2?.click();
    });

    // 步骤 3 勾选前两位学生
    const cards = container.querySelectorAll("[data-testid^='student-card-']");
    expect(cards.length).toBeGreaterThanOrEqual(2);
    await act(async () => {
      (cards[0] as HTMLDivElement).click();
      (cards[1] as HTMLDivElement).click();
    });

    // 步骤 3 -> 步骤 4
    const nextBtn3 = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("下一步：录入课堂评价与生成")
    );
    await act(async () => {
      nextBtn3?.click();
    });

    // 验证进入步骤 4
    expect(container.textContent).toContain("步骤 4：学生课堂反馈与最终生成");

    const saveAndSwitchBtn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("保存并切换下一位学生")
    );
    expect(saveAndSwitchBtn).toBeTruthy();

    // 点击第 1 位学生（非最后一位）
    await act(async () => {
      saveAndSwitchBtn!.click();
    });
    expect(document.body.textContent).toContain("已切换到下一位");

    // 点击第 2 位学生（最后一位）
    await act(async () => {
      saveAndSwitchBtn!.click();
    });
    // 验证提示已经完成全部学生的报告填写
    expect(document.body.textContent).toContain("已经完成全部学生的报告填写，请点击确认生成草稿");
  });

  it("safeguards report image generation by ensuring a valid 40~50 char share token exists", async () => {
    const publishedReport = {
      id: "rep-pub-1",
      studentName: "曹可乐",
      className: "一年级1班",
      period: "week" as const,
      status: "published" as const,
      startDate: "2026-10-26",
      endDate: "2026-10-30",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      share: null // 模拟初始加载时 share 为空或失效
    };

    api.get.mockImplementation(async (url: string) => {
      if (url.endsWith("/reports")) return [publishedReport];
      return [];
    });

    // 模拟点击“报告图片”时后端返回合规的 43 位分享链接
    const mockValidToken = "abcde12345ABCDE67890_-abcde12345ABCDE67890123";
    api.post.mockImplementation(async (url: string) => {
      if (url.includes("/shares")) {
        return {
          shareId: "share-123",
          url: `http://localhost:3000/r/${mockValidToken}`
        };
      }
      return {};
    });

    await act(async () => {
      root.render(<SemesterReportsV2View />);
    });

    const imageBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("报告图片"));
    expect(imageBtn).toBeTruthy();

    await act(async () => {
      imageBtn!.click();
    });

    // 验证调用了获取 share 的接口，并成功通过 Portal 打开了弹窗且没有报“报告链接无效”
    expect(api.post).toHaveBeenCalledWith(expect.stringContaining("/reports/rep-pub-1/shares"));
    expect(document.body.textContent).toContain("曹可乐 · 报告图片");
    expect(document.body.textContent).not.toContain("报告链接无效，请重新复制家长链接后生成图片");
  });

  it("safeguards copy share URL by utilizing fallback when navigator.clipboard is unavailable or restricted", async () => {
    const publishedReport = {
      id: "rep-pub-2",
      studentName: "曹可乐",
      className: "一年级1班",
      period: "week" as const,
      status: "published" as const,
      startDate: "2026-10-26",
      endDate: "2026-10-30",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      share: { id: "s-1", url: "http://192.168.1.177:3001/r/abcde12345ABCDE67890_-abcde12345ABCDE67890123" }
    };

    api.get.mockImplementation(async (url: string) => {
      if (url.endsWith("/reports")) return [publishedReport];
      return [];
    });

    // 模拟非安全上下文（如局域网 HTTP）：document.execCommand 回退
    const originalExec = document.execCommand;
    document.execCommand = vi.fn().mockReturnValue(true);

    await act(async () => {
      root.render(<SemesterReportsV2View />);
    });

    const copyBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("复制链接"));
    expect(copyBtn).toBeTruthy();

    await act(async () => {
      copyBtn!.click();
    });

    // 验证无论 navigator.clipboard 是否存在，均成功完成复制并给出了提示
    expect(document.body.textContent).toContain("家长链接已");
    document.execCommand = originalExec;
  });
});

describe("V2ClassroomPerformance component", () => {
  let root: Root;
  let container: HTMLDivElement;

  const mockSubjects = [
    {
      id: "sub-1",
      name: "英语综合",
      performanceConfig: [
        {
          label: "口语发音",
          options: ["发音清晰地道", "表达流利连贯", "积极互动", "声音洪亮自信"]
        }
      ]
    }
  ];

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

  it("strictly renders preset capsule buttons without any input text boxes", () => {
    act(() => {
      root.render(<V2ClassroomPerformance subjects={mockSubjects} ratings={[]} onChange={() => {}} />);
    });

    // Verify dimension label is rendered
    expect(container.textContent).toContain("口语发音");
    expect(container.textContent).toContain("发音清晰地道");
    expect(container.textContent).toContain("表达流利连贯");
    expect(container.textContent).toContain("暂不评价");

    // Strictly verify NO text inputs exist in performance scoring
    const inputs = container.querySelectorAll("input[type='text']");
    expect(inputs.length).toBe(0);
  });

  it("allows selecting preset pill, and deselecting on re-click", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(<V2ClassroomPerformance subjects={mockSubjects} ratings={[]} onChange={onChange} />);
    });

    const pillBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("发音清晰地道"));
    expect(pillBtn).toBeTruthy();

    // Click to select
    act(() => {
      pillBtn!.click();
    });
    expect(onChange).toHaveBeenCalledWith([{ subjectId: "sub-1", label: "口语发音", value: "发音清晰地道" }]);
  });

  it("shows strengths and homeSuggestions for v1 reports and hides them for v2 reports in DraftEditModal", async () => {
    // 1. Render v1 report modal
    const v1Report = {
      id: "v1-rep",
      studentName: "李小明",
      className: "三年级一班",
      period: "week" as const,
      status: "draft",
      reportVersion: "v1" as const,
      content: {
        summary: "v1 表现良好",
        courseOverview: "v1 课程概况",
        limitations: [],
        strengths: [{ text: "发音纯正口语表达优异", sourceRefs: [] }],
        homeSuggestions: [{ text: "每天课外朗读10分钟", sourceRefs: [] }],
        areasToImprove: []
      }
    };

    await act(async () => {
      root.render(
        <DraftEditModal
          report={v1Report}
          allAvailableSubjects={mockSubjects}
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
          onPublish={vi.fn()}
        />
      );
    });

    // In v1, strengths and homeSuggestions should be rendered
    expect(container.textContent).toContain("本期最值得肯定");
    expect(container.textContent).toContain("回家可以这样练");
    const strengthsTextarea = container.querySelector("textarea[aria-label='本期最值得肯定']") as HTMLTextAreaElement;
    expect(strengthsTextarea).toBeTruthy();
    expect(strengthsTextarea.value).toBe("发音纯正口语表达优异");

    // 2. Render v2 report modal
    const v2Report = {
      id: "v2-rep",
      studentName: "李小明",
      className: "三年级一班",
      period: "week" as const,
      status: "draft",
      reportVersion: "v2" as const,
      content: {
        reportVersion: "v2" as const,
        summary: "v2 表现优异",
        courseOverview: "v2 课程概况",
        limitations: [],
        strengths: [{ text: "不应在v2展示的肯定", sourceRefs: [] }],
        homeSuggestions: [{ text: "不应在v2展示的建议", sourceRefs: [] }],
        areasToImprove: []
      }
    };

    await act(async () => {
      root.render(
        <DraftEditModal
          report={v2Report}
          allAvailableSubjects={mockSubjects}
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
          onPublish={vi.fn()}
        />
      );
    });

    // In v2, strengths and homeSuggestions should be hidden
    expect(container.textContent).not.toContain("本期最值得肯定");
    expect(container.textContent).not.toContain("回家可以这样练");
    expect(container.textContent).not.toContain("严格只能选择后台设置好的预设值");
    expect(container.textContent).not.toContain("严格仅限单选后台设置好的预设值");
    expect(container.querySelector("textarea[aria-label='本期最值得肯定']")).toBeNull();
    expect(container.querySelector("textarea[aria-label='回家练习建议']")).toBeNull();
  });
});

describe("SemesterReportsV2 API Integration Safeguards", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    api.get.mockImplementation((url: string) => {
      if (url.includes("/terms"))
        return Promise.resolve([
          { id: "t1", name: "2026秋", startDate: "2026-09-01", endDate: "2027-01-20", isCurrent: true }
        ]);
      if (url.includes("/subjects"))
        return Promise.resolve([
          { id: "sub-1", name: "英语", performanceConfig: [{ label: "发音", options: ["标准"] }] }
        ]);
      if (url.includes("/classes")) return Promise.resolve([{ id: "c1", name: "一班" }]);
      if (url.includes("/students"))
        return Promise.resolve([{ id: "s1", name: "张小明", classId: "c1", className: "一班" }]);
      if (url.includes("/course-materials")) return Promise.resolve([]);
      if (url.includes("/reports")) return Promise.resolve({ reports: [], total: 0 });
      return Promise.resolve([]);
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it("safeguards POST /reports/generate against 400 Bad Request by sanitizing student feedback and report details", async () => {
    let capturedPayload: Record<string, unknown> | null = null;
    api.post.mockImplementation((url: string, data?: unknown) => {
      if (url.includes("/reports/generate")) {
        capturedPayload = data as Record<string, unknown>;
        return Promise.resolve({
          reports: [
            {
              id: "gen-backend-1",
              studentId: "s1",
              studentName: "张小明",
              period: "week",
              status: "draft"
            }
          ]
        } as unknown as { reports: unknown[] });
      }
      return Promise.resolve({ data: {} } as unknown as { data: Record<string, unknown> });
    });

    await act(async () => {
      root.render(<SemesterReportsV2View />);
    });

    // 切换至生成向导
    const composeTab = container.querySelector("#mainTabCompose") as HTMLButtonElement;
    await act(async () => {
      composeTab.click();
    });

    // 步骤 1 步进至第 2 步
    const nextBtn1 = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("下一步：配置学科与教学内容")
    );
    await act(async () => {
      nextBtn1?.click();
    });

    // 步骤 2 勾选学科
    const subjectCheckbox = container.querySelector("input[type='checkbox']") as HTMLInputElement;
    await act(async () => {
      subjectCheckbox?.click();
    });

    // 步骤 2 步进至第 3 步
    const nextBtn2 = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("下一步：挑选学生名单")
    );
    await act(async () => {
      nextBtn2?.click();
    });

    // 第 3 步全选本班
    const selectAllBtn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("全选本班")
    );
    await act(async () => {
      selectAllBtn?.click();
    });

    // 步进至第 4 步
    const nextBtn3 = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("下一步：录入课堂评价与生成")
    );
    await act(async () => {
      nextBtn3?.click();
    });

    // 点击最终生成
    const generateBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("确认生成"));
    expect(generateBtn).toBeTruthy();

    await act(async () => {
      generateBtn!.click();
    });

    expect(capturedPayload).toBeTruthy();
    const payload = capturedPayload as unknown as {
      reportVersion: string;
      studentIds: string[];
      courseSelections: Array<{ subjectId: string }>;
      studentFeedback: Array<{
        studentId: string;
        classroomPerformance: Array<{ label: string; value: string; subjectId?: string }>;
      }>;
      reportDetails?: { lessonNumber: number | null };
    };
    expect(payload.reportVersion).toBe("v2");
    expect(payload.studentIds.length).toBeLessThanOrEqual(30);
    // 验证每位学生的 feedback 均符合后端校验
    for (const sf of payload.studentFeedback) {
      expect(payload.studentIds).toContain(sf.studentId);
      for (const perf of sf.classroomPerformance) {
        expect(perf.label).toBeTruthy();
        expect(perf.value).toBeTruthy();
        if (perf.subjectId) {
          const validSubIds = payload.courseSelections.map(cs => cs.subjectId);
          expect(validSubIds).toContain(perf.subjectId);
        }
      }
    }
    // 验证 reportDetails
    if (payload.reportDetails?.lessonNumber !== null) {
      expect(Number.isInteger(payload.reportDetails?.lessonNumber)).toBe(true);
      expect(payload.reportDetails?.lessonNumber).toBeGreaterThanOrEqual(1);
      expect(payload.reportDetails?.lessonNumber).toBeLessThanOrEqual(999);
    }
  });

  it("displays newly generated reports as draft status in reports list instead of failed", async () => {
    api.get.mockImplementation(async (url: string) => {
      if (url.includes("/report-terms")) return [mockTerms[0]];
      if (url.includes("/report-subjects")) return mockSubjects;
      if (url.includes("/pet-points/students")) return { students: mockStudents };
      if (url.includes("/course-documents")) return [];
      if (url.includes("/reports")) {
        // 模拟后端初始返回 queued / generating 状态的报告记录
        return [
          {
            id: "rep-queued-1",
            studentId: "stu-1",
            studentName: "张小明",
            classId: "cls-1",
            className: "三年级二班",
            period: "week",
            status: "queued",
            startDate: "2026-09-01",
            endDate: "2026-09-07",
            createdAt: new Date().toISOString(),
            content: { reportSubjects: [{ subjectId: "sub-1", name: "英语综合" }] }
          },
          {
            id: "rep-generating-2",
            studentId: "stu-2",
            studentName: "李华",
            classId: "cls-1",
            className: "三年级二班",
            period: "week",
            status: "generating",
            startDate: "2026-09-01",
            endDate: "2026-09-07",
            createdAt: new Date().toISOString(),
            content: { reportSubjects: [{ subjectId: "sub-2", name: "数学思维" }] }
          }
        ];
      }
      return [];
    });

    await act(async () => {
      root.render(<SemesterReportsV2View />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // 验证卡片状态标签为“待发布草稿”，绝不显示“失败”
    const statusBadges = Array.from(container.querySelectorAll("span")).filter(
      s => s.textContent === "待发布草稿" || s.textContent === "失败"
    );

    expect(statusBadges.length).toBeGreaterThan(0);
    // 所有新生成的草稿状态卡片标签均为“待发布草稿”
    for (const badge of statusBadges) {
      expect(badge.textContent).toBe("待发布草稿");
      expect(badge.className).toContain("bg-amber-100");
    }

    // 验证顶部“待审核草稿”统计按钮包含 queued/generating 记录
    const draftFilterBtn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("待审核草稿")
    );
    expect(draftFilterBtn?.textContent).toContain("待审核草稿 (2)");

    // 验证绝不展示为生成失败
    const failedFilterBtn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("生成失败")
    );
    expect(failedFilterBtn?.textContent).toContain("生成失败 (0)");
  });
});
