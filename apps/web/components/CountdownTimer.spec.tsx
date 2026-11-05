/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 * **********************************************************************************************
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CountdownTimer } from "./CountdownTimer";
import { useCountdownStore } from "@/store/countdownStore";

// Mock request 避免发起真实网络调用
vi.mock("@/lib/request", () => ({
  default: vi.fn().mockResolvedValue({})
}));

describe("CountdownTimer and Stopwatch component", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

    // Mock HTMLCanvasElement.getContext 与 ResizeObserver
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      setTransform: vi.fn(),
      translate: vi.fn(),
      roundRect: vi.fn(),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arcTo: vi.fn(),
      arc: vi.fn(),
      ellipse: vi.fn(),
      quadraticCurveTo: vi.fn(),
      bezierCurveTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      clip: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      createLinearGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
      createRadialGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() })
    });

    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    // 重置 store 为初始状态
    act(() => {
      useCountdownStore.setState({
        timerMode: "countdown",
        totalSeconds: 300,
        remainingSeconds: 300,
        isRunning: false,
        stopwatchElapsedSeconds: 0,
        stopwatchTargetSeconds: 0,
        stopwatchIsRunning: false,
        stopwatchLaps: [],
        stopwatchTheme: "rocket"
      });
    });

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  async function mount() {
    await act(async () => {
      root.render(<CountdownTimer />);
    });
  }

  it("renders countdown mode by default with water drip title and formatted digits", async () => {
    await mount();
    expect(container.textContent).toContain("滴水倒计");
    expect(container.textContent).toContain("05:00");
    expect(container.textContent).toContain("⏱️ 倒计时");
    expect(container.textContent).toContain("🚀 正计时");
  });

  it("switches to child-friendly stopwatch mode when clicking the top-right stopwatch button", async () => {
    await mount();

    // 点击右上角 正计时 切换按钮
    const swBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("正计时"));
    expect(swBtn).toBeDefined();

    await act(async () => {
      swBtn?.click();
    });

    // 验证正计时特征：火箭/树苗/气球主题与果冻大数字
    expect(container.textContent).toContain("火箭");
    expect(container.textContent).toContain("树苗");
    expect(container.textContent).toContain("气球");
    expect(container.textContent).toContain("开始探索");
    expect(container.textContent).toContain("目标: 自由计时");
  });

  it("allows setting stopwatch target time via modal presets", async () => {
    await mount();

    // 切换到正计时
    const swBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("正计时"));
    await act(async () => {
      swBtn?.click();
    });

    // 点击 设时间 按钮
    const setTargetBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("设时间"));
    expect(setTargetBtn).toBeDefined();

    await act(async () => {
      setTargetBtn?.click();
    });

    // 验证弹窗出现
    expect(container.textContent).toContain("设置正计时目标时间");

    // 点击 3分钟 预设
    const preset3Btn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("3分钟"));
    expect(preset3Btn).toBeDefined();

    await act(async () => {
      preset3Btn?.click();
    });

    // 点击 确认保存目标
    const confirmBtn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("确认保存目标")
    );
    await act(async () => {
      confirmBtn?.click();
    });

    // 验证目标生效并更新显示
    expect(useCountdownStore.getState().stopwatchTargetSeconds).toBe(180);
    expect(container.textContent).toContain("目标: 03:00");
    expect(container.textContent).toContain("目标挑战: 03:00");
  });

  it("supports recording classroom laps in stopwatch mode", async () => {
    await mount();

    // 切换到正计时
    const swBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("正计时"));
    await act(async () => {
      swBtn?.click();
    });

    // 模拟运行 45 秒
    act(() => {
      useCountdownStore.getState().setStopwatchElapsedSeconds(45);
    });

    // 点击 打卡 按钮
    const lapBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("打卡"));
    expect(lapBtn).toBeDefined();

    await act(async () => {
      lapBtn?.click();
    });

    expect(useCountdownStore.getState().stopwatchLaps.length).toBe(1);
    expect(container.textContent).toContain("第 1 棒");
    expect(container.textContent).toContain("00:45");
  });

  it("switches back to countdown mode smoothly", async () => {
    await mount();

    // 先切到正计时
    const swBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("正计时"));
    await act(async () => {
      swBtn?.click();
    });
    expect(container.textContent).toContain("开始探索");

    // 切回倒计时
    const cdBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("倒计时"));
    await act(async () => {
      cdBtn?.click();
    });
    expect(container.textContent).toContain("滴水倒计");
    expect(useCountdownStore.getState().timerMode).toBe("countdown");
  });
});
