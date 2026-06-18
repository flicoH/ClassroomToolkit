/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 * **********************************************************************************************
 */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, RotateCcw, Settings, X } from "lucide-react";
import { useCountdownStore } from "@/store/countdownStore";

function formatTime(seconds: number, showHours: boolean): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  if (showHours) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function easeInQuad(t: number) {
  return t * t;
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

/** 滴水 Canvas 动画组件 */
function WaterDrip({ progress, isRunning }: { progress: number; isRunning: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const progressRef = useRef(progress);
  const displayProgressRef = useRef(progress);
  const timeRef = useRef(0);
  const runningRef = useRef(isRunning);
  const trailSeedsRef = useRef([-0.58, 0.32, -0.18, 0.48, -0.36]);
  const splashSeedsRef = useRef([
    { angle: -0.95, speed: 0.72, radius: 0.95 },
    { angle: -0.48, speed: 0.9, radius: 0.72 },
    { angle: 0.02, speed: 0.66, radius: 1.05 },
    { angle: 0.44, speed: 0.86, radius: 0.82 },
    { angle: 0.9, speed: 0.74, radius: 0.64 }
  ]);
  // 用 ref 持有尺寸信息，避免闭包过期
  const sizeRef = useRef({ w: 260, h: 420, dpr: 1 });

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);
  useEffect(() => {
    runningRef.current = isRunning;
  }, [isRunning]);

  // 坐标系：逻辑尺寸 200x360
  const W = 200;
  const H = 360;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    /** 设置 Canvas 缓冲区尺寸（HiDPI 支持） */
    const setupSize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(rect.width, 100);
      const h = Math.max(rect.height, 160);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w, h, dpr };
    };

    setupSize();
    const ro = new ResizeObserver(setupSize);
    ro.observe(container);

    let lastTime = performance.now();

    /** 绘制水滴形状（泪滴形） */
    function drawDrop(x: number, y: number, size: number, alpha: number) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(x, y - size);
      ctx.bezierCurveTo(x + size * 0.8, y - size * 0.5, x + size * 0.9, y + size * 0.4, x, y + size);
      ctx.bezierCurveTo(x - size * 0.9, y + size * 0.4, x - size * 0.8, y - size * 0.5, x, y - size);
      ctx.closePath();

      const dropGrad = ctx.createRadialGradient(x - size * 0.2, y - size * 0.2, size * 0.1, x, y + size * 0.3, size);
      dropGrad.addColorStop(0, "rgba(147,197,253,0.95)");
      dropGrad.addColorStop(0.4, "rgba(59,130,246,0.85)");
      dropGrad.addColorStop(1, "rgba(37,99,235,0.75)");
      ctx.fillStyle = dropGrad;
      ctx.fill();

      // 高光
      ctx.beginPath();
      ctx.ellipse(x - size * 0.25, y - size * 0.35, size * 0.18, size * 0.28, -0.4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fill();

      ctx.restore();
    }

    const draw = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.033);
      lastTime = now;

      // 平滑插值
      const target = progressRef.current;
      const diff = target - displayProgressRef.current;
      const lerpFactor = 1 - Math.exp(-dt * 10);
      displayProgressRef.current += diff * lerpFactor;
      if (Math.abs(diff) < 0.0008) {
        displayProgressRef.current = target;
      }

      const prog = displayProgressRef.current;
      timeRef.current += dt;

      const { w, h } = sizeRef.current;
      const scaleX = w / W;
      const scaleY = h / H;
      const cx = w / 2;

      ctx.clearRect(0, 0, w, h);

      // ====== 容器参数 ======
      const glassX = 35 * scaleX;
      const glassW = 130 * scaleX;
      const glassTop = 28 * scaleY;
      const glassBottom = 336 * scaleY;
      const glassR = 16 * scaleX;
      const glassH = glassBottom - glassTop;

      // 水位：prog=1 时空（刚开始），prog=0 时满（倒计时结束，水位从底部上涨）
      const collectProg = Math.max(0, 1 - prog);
      const maxWaterH = glassH * 0.85;
      const waterH = collectProg * maxWaterH;
      const waterSurfaceY = glassBottom - waterH;

      // ---- 外框圆角矩形 ----
      ctx.save();
      roundRect(ctx, glassX - 10, glassTop - 6, glassW + 20, glassH + 16, glassR + 6);
      ctx.strokeStyle = "rgba(148,163,184,0.22)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // ---- 玻璃容器轮廓 ----
      roundRect(ctx, glassX, glassTop, glassW, glassH, glassR);
      ctx.fillStyle = "rgba(148,198,245,0.04)";
      ctx.fill();
      ctx.strokeStyle = "rgba(148,198,245,0.30)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // ====== 底部积水（随时间上涨，带波动） ======
      if (collectProg > 0.005 && waterH > 4) {
        ctx.save();
        roundRect(ctx, glassX + 2, glassTop + 2, glassW - 4, glassH - 4, glassR - 2);
        ctx.clip();

        const waveAmp = 2.2 * scaleY;
        const waveFreq = 0.08;
        const t = timeRef.current;

        ctx.beginPath();
        ctx.moveTo(glassX + 4, waterSurfaceY);
        for (let wx = glassX + 4; wx <= glassX + glassW - 4; wx += 3) {
          const wy =
            waterSurfaceY +
            Math.sin((wx / scaleX) * waveFreq + t * 2.4) * waveAmp +
            Math.sin((wx / scaleX) * 0.035 - t * 1.6) * waveAmp * 0.38;
          ctx.lineTo(wx, wy);
        }
        ctx.lineTo(glassX + glassW - 4, glassBottom - 4);
        ctx.lineTo(glassX + 4, glassBottom - 4);
        ctx.closePath();

        const waterGrad = ctx.createLinearGradient(cx, waterSurfaceY, cx, glassBottom);
        waterGrad.addColorStop(0, "rgba(96,165,250,0.65)");
        waterGrad.addColorStop(0.15, "rgba(59,130,246,0.55)");
        waterGrad.addColorStop(0.7, "rgba(37,99,235,0.45)");
        waterGrad.addColorStop(1, "rgba(29,78,216,0.38)");
        ctx.fillStyle = waterGrad;
        ctx.fill();

        // 水面高光线
        ctx.beginPath();
        ctx.moveTo(glassX + 12, waterSurfaceY - 1);
        for (let wx = glassX + 12; wx <= glassX + glassW - 12; wx += 3) {
          ctx.lineTo(
            wx,
            waterSurfaceY +
              Math.sin((wx / scaleX) * waveFreq + t * 2.4) * waveAmp +
              Math.sin((wx / scaleX) * 0.035 - t * 1.6) * waveAmp * 0.38 -
              1
          );
        }
        ctx.strokeStyle = "rgba(191,219,254,0.45)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.restore();
      }

      // ====== 水龙头 / 出水口 ======
      const spoutCX = cx;
      const spoutCY = glassTop - 18 * scaleY;

      // 龙头管身
      ctx.save();
      roundRect(ctx, spoutCX - 9 * scaleX, spoutCY - 24 * scaleY, 18 * scaleX, 28 * scaleY, 4 * scaleX);
      const pipeGrad = ctx.createLinearGradient(spoutCX - 9 * scaleX, 0, spoutCX + 9 * scaleX, 0);
      pipeGrad.addColorStop(0, "rgba(148,163,184,0.50)");
      pipeGrad.addColorStop(0.3, "rgba(203,213,225,0.70)");
      pipeGrad.addColorStop(0.7, "rgba(148,163,184,0.50)");
      pipeGrad.addColorStop(1, "rgba(100,116,139,0.45)");
      ctx.fillStyle = pipeGrad;
      ctx.fill();
      ctx.strokeStyle = "rgba(148,163,184,0.40)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      // 喇叭口
      ctx.beginPath();
      ctx.moveTo(spoutCX - 7 * scaleX, spoutCY + 4 * scaleY);
      ctx.quadraticCurveTo(spoutCX - 14 * scaleX, spoutCY + 14 * scaleY, spoutCX - 5 * scaleX, spoutCY + 18 * scaleY);
      ctx.lineTo(spoutCX + 5 * scaleX, spoutCY + 18 * scaleY);
      ctx.quadraticCurveTo(spoutCX + 14 * scaleX, spoutCY + 14 * scaleY, spoutCX + 7 * scaleX, spoutCY + 4 * scaleY);
      ctx.closePath();
      ctx.fillStyle = "rgba(180,190,205,0.32)";
      ctx.fill();
      ctx.strokeStyle = "rgba(148,163,184,0.32)";
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // ====== 下落的水滴动画（仅在运行时显示） ======
      if (runningRef.current && prog > 0.005 && prog < 0.998) {
        const dropCycle = 0.82;
        const dropSize = 5.5 * scaleX;

        const startY = spoutCY + 20 * scaleY;
        const endY = waterSurfaceY - 5 * scaleY;
        const fallDist = endY - startY;

        // 使用两个错开的相位形成连续水滴流，避免单滴循环重置时出现空档。
        for (let stream = 0; stream < 2; stream++) {
          const phase = (((timeRef.current / dropCycle + stream * 0.5) % 1) + 1) % 1;
          const easedPhase = easeInQuad(phase);
          const dropY = startY + easedPhase * fallDist;
          const fadeIn = Math.min(phase / 0.08, 1);
          const fadeOut = Math.min((1 - phase) / 0.12, 1);
          const dropAlpha = Math.min(fadeIn, fadeOut);
          const wobble = Math.sin(timeRef.current * 8 + stream * Math.PI) * 0.7 * scaleX;

          drawDrop(spoutCX + wobble, dropY, dropSize * (0.78 + phase * 0.42), dropAlpha);

          // 尾迹粒子使用稳定偏移，避免每帧随机跳动。
          for (let i = 1; i <= 4; i++) {
            const trailPhase = phase - i * 0.045;
            if (trailPhase > 0 && trailPhase < 1) {
              const ty = startY + easeInQuad(trailPhase) * fallDist;
              const seed = trailSeedsRef.current[(i + stream) % trailSeedsRef.current.length] ?? 0;
              const tx = spoutCX + seed * 2.2 * scaleX + Math.sin(timeRef.current * 5 + i) * 0.25 * scaleX;
              drawDrop(tx, ty, dropSize * 0.28 * (1 - i * 0.14), 0.24 * (1 - i * 0.16) * dropAlpha);
            }
          }

          // 飞溅效果同样使用稳定种子，让水花扩散自然而不闪烁。
          if (phase > 0.84) {
            const splashT = (phase - 0.84) / 0.16;
            const splashEase = easeOutCubic(splashT);
            splashSeedsRef.current.forEach(seed => {
              const sx = spoutCX + Math.sin(seed.angle) * splashEase * 18 * scaleX * seed.speed;
              const sy = endY - Math.cos(seed.angle) * splashEase * 13 * scaleY * seed.speed;
              const sr = seed.radius * 1.4 * scaleX * (1 - splashT * 0.45);
              drawDrop(sx, sy, sr, 0.38 * (1 - splashT) * dropAlpha);
            });
          }
        }
      }

      // ====== 玻璃反光高光 ======
      ctx.beginPath();
      ctx.moveTo(glassX + 10, glassTop + 12);
      ctx.lineTo(glassX + 18, glassTop + glassH * 0.42);
      ctx.quadraticCurveTo(glassX + 14, glassTop + glassH * 0.56, glassX + 22, glassTop + glassH * 0.62);
      const shineGrad = ctx.createLinearGradient(glassX + 10, glassTop + 12, glassX + 22, glassTop + glassH * 0.62);
      shineGrad.addColorStop(0, "rgba(191,219,254,0.22)");
      shineGrad.addColorStop(0.5, "rgba(186,230,253,0.04)");
      shineGrad.addColorStop(1, "rgba(191,219,254,0.10)");
      ctx.strokeStyle = shineGrad;
      ctx.lineWidth = 2.5 * scaleX;
      ctx.lineCap = "round";
      ctx.stroke();

      // 刻度线
      ctx.save();
      roundRect(ctx, glassX + 2, glassTop + 2, glassW - 4, glassH - 4, glassR - 2);
      ctx.clip();
      ctx.strokeStyle = "rgba(148,198,245,0.12)";
      ctx.lineWidth = 0.6;
      for (let tick = 1; tick <= 9; tick++) {
        const ty = glassTop + (tick / 10) * glassH;
        ctx.beginPath();
        ctx.moveTo(glassX + glassW - 8 * scaleX, ty);
        ctx.lineTo(glassX + glassW - 2 * scaleX, ty);
        ctx.stroke();
      }
      ctx.restore();

      animFrameRef.current = requestAnimationFrame(draw);
    };

    animFrameRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      ro.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}

/** 绘制圆角矩形路径 */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export function CountdownTimer() {
  const rawTotal = useCountdownStore(s => s.totalSeconds) || 300;
  const rawTimeLeft = useCountdownStore(s => s.remainingSeconds) || 300;
  const isRunning = useCountdownStore(s => s.isRunning);
  const setTotalSeconds = useCountdownStore(s => s.setTotalSeconds);
  const setRemainingSeconds = useCountdownStore(s => s.setRemainingSeconds);
  const setIsRunning = useCountdownStore(s => s.setIsRunning);
  const resetStore = useCountdownStore(s => s.reset);

  // 安全值，永远不为 NaN/undefined/负数
  const totalSeconds = Math.max(1, Number(rawTotal) || 300);
  const timeLeft = Math.max(0, Number(rawTimeLeft) || totalSeconds);

  const [showSettings, setShowSettings] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 设置面板中的时分秒临时值
  const [setH, setSetH] = useState(Math.floor(totalSeconds / 3600));
  const [setM, setSetM] = useState(Math.floor((totalSeconds % 3600) / 60));
  const [setS, setSetS] = useState(totalSeconds % 60);

  // 打开设置时同步当前时长到输入框
  useEffect(() => {
    if (showSettings) {
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;
      setSetH(h);
      setSetM(m);
      setSetS(s);
    }
  }, [showSettings, totalSeconds]);

  const progress = totalSeconds > 0 ? timeLeft / totalSeconds : 0;

  // ====== 核心计时逻辑（纯时间戳方式）======
  useEffect(() => {
    // 清除旧的定时器
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }

    if (!isRunning) return;

    // ===== 立即校正剩余时间（解决最小化/卸载后显示延迟）=====
    const s = useCountdownStore.getState();
    if (s.startTime && s.totalSeconds > 0) {
      const elapsed = Math.floor((Date.now() - s.startTime) / 1000);
      const correctedRemaining = Math.max(0, s.totalSeconds - elapsed);
      if (correctedRemaining <= 0) {
        // 已经超时了
        s.setRemainingSeconds(0);
        s.setIsRunning(false);
        return;
      }
      // 立即同步，不等 interval
      if (Math.abs(correctedRemaining - (Number(s.remainingSeconds) || 0)) > 0.5) {
        s.setRemainingSeconds(correctedRemaining);
      }
    }

    // 每秒 tick：根据 startTime 计算真正的剩余时间并写入 store
    tickRef.current = setInterval(() => {
      const s2 = useCountdownStore.getState();
      if (!s2.startTime || s2.totalSeconds <= 0) return;

      const elapsed = Math.floor((Date.now() - s2.startTime) / 1000);
      const remaining = Math.max(0, s2.totalSeconds - elapsed);

      if (remaining <= 0) {
        // 时间到
        s2.setRemainingSeconds(0);
        s2.setIsRunning(false);
        if (tickRef.current) clearInterval(tickRef.current);
        return;
      }

      // 只更新剩余时间显示值
      s2.setRemainingSeconds(remaining);
    }, 1000);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [isRunning]);

  const handleToggle = useCallback(() => {
    const s = useCountdownStore.getState();

    if (!isRunning) {
      // 开始前确保数据有效
      const currentRemaining = Math.max(0, Number(s.remainingSeconds) || 0);
      const currentTotal = Math.max(1, Number(s.totalSeconds) || totalSeconds);

      if (currentRemaining <= 0 || !s.startTime) {
        // 重置为完整的总时长再开始
        s.setTotalSeconds(currentTotal);
        s.setRemainingSeconds(currentTotal);
      }
      // 开始：设置 startTime 并标记运行
      s.setIsRunning(true);
    } else {
      // 暂停：记录当前剩余时间，清除 startTime
      const currentRemaining = Math.max(0, Number(s.remainingSeconds) || 0);
      s.setIsRunning(false);
      s.setRemainingSeconds(currentRemaining);
    }
  }, [isRunning, totalSeconds]);

  const handleReset = useCallback(() => resetStore(), [resetStore]);

  /** 确认自定义时分秒 */
  const handleConfirmTime = useCallback(() => {
    const secs = (setH || 0) * 3600 + (setM || 0) * 60 + (setS || 0);
    if (secs <= 0) return;
    setTotalSeconds(secs);
    setRemainingSeconds(secs);
    setIsRunning(false);
    setShowSettings(false);
  }, [setH, setM, setS, setTotalSeconds, setRemainingSeconds, setIsRunning]);

  return (
    <div className="flex items-center justify-center w-full h-full select-none bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] rounded-xl relative">
      {/* 左侧：文字 + 计时 + 按钮 */}
      <div className="flex flex-col justify-center pr-8 pl-6 shrink-0">
        <h1
          className="text-4xl font-bold mb-3"
          style={{
            background: "linear-gradient(135deg,#60a5fa,#3b82f6)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent"
          }}
        >
          滴水倒计
        </h1>
        <p className="text-sm text-slate-400/80 mb-10">每一滴水落下的瞬间，都是时间的回响。</p>

        <div
          className={`font-black tracking-wider leading-none mb-10 tabular-nums text-white ${totalSeconds >= 3600 ? "text-[56px]" : "text-[72px]"}`}
        >
          {formatTime(timeLeft, totalSeconds >= 3600)}
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleToggle}
            className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
            style={{ background: "linear-gradient(135deg,#3b82f6,#2563eb)" }}
          >
            {isRunning ? <Pause className="h-7 w-7 text-white" /> : <Play className="h-7 w-7 text-white ml-0.5" />}
          </button>
          <button
            onClick={handleReset}
            className="w-14 h-14 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center backdrop-blur-sm transition-colors hover:bg-white/15 active:scale-95 cursor-pointer"
          >
            <RotateCcw className="h-5 w-5 text-slate-300" />
          </button>
          <button
            onClick={() => setShowSettings(prev => !prev)}
            className="w-14 h-14 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center backdrop-blur-sm transition-colors hover:bg-white/15 active:scale-95 cursor-pointer"
          >
            <Settings className="h-5 w-5 text-slate-300" />
          </button>
        </div>
      </div>

      {/* 右侧：滴水动画 */}
      <div className="relative w-[260px] h-[420px] shrink-0 mr-4">
        {/* 背景光晕 */}
        <div
          className="absolute inset-0 rounded-[28px]"
          style={{
            background: "radial-gradient(circle at 50% 35%, rgba(59,130,246,0.07), transparent 70%)"
          }}
        />
        <WaterDrip progress={progress} isRunning={isRunning} />
      </div>

      {/* ====== 设置面板 ====== */}
      {showSettings && (
        <div className="absolute inset-0 flex items-center justify-center z-50">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm rounded-xl"
            onClick={() => setShowSettings(false)}
          />

          <div className="relative bg-slate-800/95 border border-white/10 rounded-2xl p-6 shadow-2xl min-w-[300px]">
            <button
              onClick={() => setShowSettings(false)}
              className="absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <X className="h-4 w-4 text-slate-400" />
            </button>

            <h3 className="text-lg font-semibold text-white mb-5">设置倒计时时长</h3>

            {/* 时分秒输入 */}
            <div className="flex items-center gap-2 mb-6 justify-center">
              {[
                { value: setH, set: setSetH, max: 99, label: "时" },
                { value: setM, set: setSetM, max: 59, label: "分" },
                { value: setS, set: setSetS, max: 59, label: "秒" }
              ].map(({ value, set, max, label }) => (
                <div key={label} className="flex flex-col items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={max}
                    value={value}
                    onChange={e => {
                      const v = parseInt(e.target.value) || 0;
                      if (v >= 0 && v <= max) set(v);
                      else if (e.target.value === "") set(0);
                    }}
                    className="w-16 h-12 text-center text-xl font-bold bg-slate-700/60 border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-400/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-xs text-slate-400">{label}</span>
                </div>
              ))}
            </div>

            {/* 快捷选项 */}
            <div className="grid grid-cols-3 gap-2 mb-5">
              {[1, 3, 5, 10, 15, 30].map(min => (
                <button
                  key={min}
                  onClick={() => {
                    const h = Math.floor(min / 60);
                    const m = min % 60;
                    setSetH(h);
                    setSetM(m);
                    setSetS(0);
                  }}
                  className={`py-2 px-2.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    (setH || 0) * 60 + setM === min && !setS
                      ? "bg-blue-500/90 text-white shadow-md shadow-blue-500/25"
                      : "bg-white/8 text-slate-300 hover:bg-white/15 border border-white/10"
                  }`}
                >
                  {min}分钟
                </button>
              ))}
            </div>

            {/* 确认按钮 */}
            <button
              onClick={handleConfirmTime}
              disabled={(setH || 0) * 3600 + (setM || 0) * 60 + (setS || 0) <= 0}
              className="w-full py-2.5 rounded-xl text-sm font-semibold cursor-pointer transition-all bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
            >
              确认
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
