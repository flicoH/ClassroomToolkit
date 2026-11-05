/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 * **********************************************************************************************
 */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, RotateCcw, Settings, X } from "lucide-react";
import { useCountdownStore, type StopwatchTheme, type StopwatchTargetAction } from "@/store/countdownStore";

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

function formatSwDigits(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec || 0));
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

/** Web Audio 纯原生合成音效 */
const soundSynth = {
  ctx: null as AudioContext | null,
  getAudioContext() {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  },
  playPop() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch {
      // ignore
    }
  },
  playChime() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1);
        gain.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.1);
        osc.stop(ctx.currentTime + i * 0.1 + 0.4);
      });
    } catch {
      // ignore
    }
  },
  playFanfare() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
        gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.6);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.12);
        osc.stop(ctx.currentTime + i * 0.12 + 0.6);
      });
    } catch {
      // ignore
    }
  }
};

/** 静态星空粒子数据 */
const STARS = [
  { left: 12, top: 18, size: 2.2, opacity: 0.8, duration: 2.1, delay: 0.2 },
  { left: 24, top: 35, size: 1.8, opacity: 0.6, duration: 2.8, delay: 0.5 },
  { left: 45, top: 12, size: 2.5, opacity: 0.9, duration: 1.8, delay: 0.1 },
  { left: 68, top: 22, size: 2.0, opacity: 0.7, duration: 2.5, delay: 0.8 },
  { left: 82, top: 15, size: 3.0, opacity: 0.95, duration: 2.0, delay: 0.3 },
  { left: 91, top: 40, size: 1.5, opacity: 0.5, duration: 3.2, delay: 1.2 },
  { left: 15, top: 65, size: 2.8, opacity: 0.85, duration: 2.3, delay: 0.7 },
  { left: 32, top: 78, size: 1.6, opacity: 0.6, duration: 2.9, delay: 1.5 },
  { left: 55, top: 85, size: 2.2, opacity: 0.75, duration: 2.4, delay: 0.4 },
  { left: 74, top: 62, size: 1.9, opacity: 0.65, duration: 2.7, delay: 0.9 },
  { left: 88, top: 75, size: 2.6, opacity: 0.9, duration: 1.9, delay: 0.6 },
  { left: 8, top: 45, size: 2.0, opacity: 0.7, duration: 2.6, delay: 1.1 },
  { left: 38, top: 48, size: 1.4, opacity: 0.5, duration: 3.0, delay: 1.4 },
  { left: 62, top: 52, size: 2.4, opacity: 0.8, duration: 2.2, delay: 0.3 },
  { left: 95, top: 25, size: 1.7, opacity: 0.6, duration: 2.7, delay: 0.8 },
  { left: 5, top: 88, size: 2.5, opacity: 0.85, duration: 2.1, delay: 1.0 },
  { left: 48, top: 30, size: 1.8, opacity: 0.7, duration: 2.5, delay: 0.5 },
  { left: 28, top: 92, size: 2.2, opacity: 0.8, duration: 2.4, delay: 1.3 },
  { left: 80, top: 90, size: 1.5, opacity: 0.55, duration: 3.1, delay: 0.2 },
  { left: 65, top: 5, size: 2.7, opacity: 0.9, duration: 2.0, delay: 0.9 }
];

/** 滴水 Canvas 动画组件（100% 恢复最初原版实现） */
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
  const sizeRef = useRef({ w: 260, h: 420, dpr: 1 });

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);
  useEffect(() => {
    runningRef.current = isRunning;
  }, [isRunning]);

  const W = 200;
  const H = 360;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const maybeCtx = canvas.getContext("2d");
    if (!maybeCtx) return;
    const ctx = maybeCtx;

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

      ctx.beginPath();
      ctx.ellipse(x - size * 0.25, y - size * 0.35, size * 0.18, size * 0.28, -0.4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fill();

      ctx.restore();
    }

    const draw = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.033);
      lastTime = now;

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

      const glassX = 35 * scaleX;
      const glassW = 130 * scaleX;
      const glassTop = 28 * scaleY;
      const glassBottom = 336 * scaleY;
      const glassR = 16 * scaleX;
      const glassH = glassBottom - glassTop;

      const collectProg = Math.max(0, 1 - prog);
      const maxWaterH = glassH * 0.85;
      const waterH = collectProg * maxWaterH;
      const waterSurfaceY = glassBottom - waterH;

      ctx.save();
      roundRect(ctx, glassX - 10, glassTop - 6, glassW + 20, glassH + 16, glassR + 6);
      ctx.strokeStyle = "rgba(148,163,184,0.22)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      roundRect(ctx, glassX, glassTop, glassW, glassH, glassR);
      ctx.fillStyle = "rgba(148,198,245,0.04)";
      ctx.fill();
      ctx.strokeStyle = "rgba(148,198,245,0.30)";
      ctx.lineWidth = 2;
      ctx.stroke();

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

      const spoutCX = cx;
      const spoutCY = glassTop - 18 * scaleY;

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

      if (runningRef.current && prog > 0.005 && prog < 0.998) {
        const dropCycle = 0.82;
        const dropSize = 5.5 * scaleX;

        const startY = spoutCY + 20 * scaleY;
        const endY = waterSurfaceY - 5 * scaleY;
        const fallDist = endY - startY;

        for (let stream = 0; stream < 2; stream++) {
          const phase = (((timeRef.current / dropCycle + stream * 0.5) % 1) + 1) % 1;
          const easedPhase = easeInQuad(phase);
          const dropY = startY + easedPhase * fallDist;
          const fadeIn = Math.min(phase / 0.08, 1);
          const fadeOut = Math.min((1 - phase) / 0.12, 1);
          const dropAlpha = Math.min(fadeIn, fadeOut);
          const wobble = Math.sin(timeRef.current * 8 + stream * Math.PI) * 0.7 * scaleX;

          drawDrop(spoutCX + wobble, dropY, dropSize * (0.78 + phase * 0.42), dropAlpha);

          for (let i = 1; i <= 4; i++) {
            const trailPhase = phase - i * 0.045;
            if (trailPhase > 0 && trailPhase < 1) {
              const ty = startY + easeInQuad(trailPhase) * fallDist;
              const seed = trailSeedsRef.current[(i + stream) % trailSeedsRef.current.length] ?? 0;
              const tx = spoutCX + seed * 2.2 * scaleX + Math.sin(timeRef.current * 5 + i) * 0.25 * scaleX;
              drawDrop(tx, ty, dropSize * 0.28 * (1 - i * 0.14), 0.24 * (1 - i * 0.16) * dropAlpha);
            }
          }

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

/** 绘制圆角矩形路径（原版实现） */
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

/** 正计时专用舞台 Canvas（100% 移植 demo.html 的绘制逻辑与参数） */
function ChildStage({
  theme,
  isRunning,
  elapsedSeconds,
  targetSeconds
}: {
  theme: StopwatchTheme;
  isRunning: boolean;
  elapsedSeconds: number;
  targetSeconds: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);

  const themeRef = useRef(theme);
  const runningRef = useRef(isRunning);
  const elapsedRef = useRef(elapsedSeconds);
  const targetRef = useRef(targetSeconds);
  const stageTimeRef = useRef(0);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);
  useEffect(() => {
    runningRef.current = isRunning;
  }, [isRunning]);
  useEffect(() => {
    elapsedRef.current = elapsedSeconds;
  }, [elapsedSeconds]);
  useEffect(() => {
    targetRef.current = targetSeconds;
  }, [targetSeconds]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const maybeCtx = canvas.getContext("2d");
    if (!maybeCtx) return;
    const ctx = maybeCtx;

    const planets = [
      { x: 0.2, y: 0.35, r: 20, color: "#f472b6", ring: true },
      { x: 0.8, y: 0.45, r: 16, color: "#38bdf8", ring: false },
      { x: 0.28, y: 0.72, r: 12, color: "#facc15", ring: false }
    ];

    const setupSize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(rect.width, 240);
      const h = Math.max(rect.height, 280);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    setupSize();
    const ro = new ResizeObserver(setupSize);
    ro.observe(container);

    const render = () => {
      const rect = container.getBoundingClientRect();
      const w = Math.max(rect.width, 240);
      const h = Math.max(rect.height, 280);

      ctx.clearRect(0, 0, w, h);
      stageTimeRef.current += 0.025;
      const stageTime = stageTimeRef.current;

      const curTheme = themeRef.current;
      const isRun = runningRef.current;
      const elapsed = elapsedRef.current;
      const target = targetRef.current;

      const cx = w / 2;

      if (curTheme === "rocket") {
        const progress = target > 0 ? Math.min(1, elapsed / target) : Math.min(1, elapsed / 300);
        // 大幅抬升火箭起始高度，居中舒适展示（startY 提升至 h * 0.52，终点升至 h * 0.18）
        const startY = h * 0.52;
        const endY = h * 0.18;
        const climbY = startY - progress * (startY - endY);
        const bobbing = isRun ? Math.sin(stageTime * 4) * 5 : Math.sin(stageTime * 1.5) * 3;
        const rocketY = climbY + bobbing;

        // 目标糖果星球与胜利红旗
        if (target > 0) {
          const goalPlanetX = w * 0.76;
          const goalPlanetY = h * 0.16;
          ctx.save();
          // 柔和发光晕染
          ctx.fillStyle = "rgba(251, 191, 36, 0.2)";
          ctx.beginPath();
          ctx.arc(goalPlanetX, goalPlanetY, 32, 0, Math.PI * 2);
          ctx.fill();

          // 星球本体
          ctx.fillStyle = "#f59e0b";
          ctx.beginPath();
          ctx.arc(goalPlanetX, goalPlanetY, 22, 0, Math.PI * 2);
          ctx.fill();

          // 环绕光环
          ctx.strokeStyle = "rgba(254, 240, 138, 0.65)";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.ellipse(goalPlanetX, goalPlanetY, 32, 8, -0.35, 0, Math.PI * 2);
          ctx.stroke();

          // 旗杆
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(goalPlanetX, goalPlanetY - 22);
          ctx.lineTo(goalPlanetX, goalPlanetY - 42);
          ctx.stroke();

          // 招展胜利红旗
          ctx.fillStyle = "#ef4444";
          ctx.beginPath();
          ctx.moveTo(goalPlanetX, goalPlanetY - 22);
          ctx.lineTo(goalPlanetX + 18, goalPlanetY - 32);
          ctx.lineTo(goalPlanetX, goalPlanetY - 40);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }

        // 周围浮动行星
        planets.forEach(p => {
          ctx.save();
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(w * p.x, h * p.y + Math.sin(stageTime + p.x * 10) * 5, p.r, 0, Math.PI * 2);
          ctx.fill();
          if (p.ring) {
            ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.ellipse(
              w * p.x,
              h * p.y + Math.sin(stageTime + p.x * 10) * 5,
              p.r * 1.8,
              p.r * 0.45,
              -0.3,
              0,
              Math.PI * 2
            );
            ctx.stroke();
          }
          ctx.restore();
        });

        // 喷射尾焰与呼吸烟雾粒子
        if (isRun) {
          const flameH = 24 + Math.sin(stageTime * 18) * 8;
          ctx.save();
          // 高亮核心内焰
          ctx.fillStyle = "#facc15";
          ctx.beginPath();
          ctx.moveTo(cx - 9, rocketY + 46);
          ctx.lineTo(cx, rocketY + 46 + flameH + 10);
          ctx.lineTo(cx + 9, rocketY + 46);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.moveTo(cx - 5, rocketY + 46);
          ctx.lineTo(cx, rocketY + 46 + flameH * 0.6);
          ctx.lineTo(cx + 5, rocketY + 46);
          ctx.closePath();
          ctx.fill();
          ctx.restore();

          // 柔和散开烟雾云
          for (let i = 0; i < 5; i++) {
            const puffY = rocketY + 58 + i * 14 + ((stageTime * 24) % 16);
            const puffX = cx + Math.sin(stageTime * 8 + i * 1.4) * (8 + i * 2);
            const puffR = 8 + i * 3.5;
            ctx.save();
            ctx.fillStyle = i % 2 === 0 ? "rgba(244, 63, 94, 0.55)" : "rgba(251, 191, 36, 0.65)";
            ctx.beginPath();
            ctx.arc(puffX, puffY, puffR, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }

        // 精致火箭本体
        ctx.save();
        if (ctx.translate) {
          ctx.translate(cx, rocketY);
        }

        // 左尾翼
        ctx.fillStyle = "#ec4899";
        ctx.beginPath();
        ctx.moveTo(-20, 16);
        ctx.quadraticCurveTo(-38, 38, -38, 50);
        ctx.quadraticCurveTo(-24, 46, -14, 42);
        ctx.closePath();
        ctx.fill();

        // 右尾翼
        ctx.beginPath();
        ctx.moveTo(20, 16);
        ctx.quadraticCurveTo(38, 38, 38, 50);
        ctx.quadraticCurveTo(24, 46, 14, 42);
        ctx.closePath();
        ctx.fill();

        // 喷气口
        ctx.fillStyle = "#475569";
        ctx.beginPath();
        ctx.moveTo(-11, 42);
        ctx.lineTo(-13, 48);
        ctx.lineTo(13, 48);
        ctx.lineTo(11, 42);
        ctx.closePath();
        ctx.fill();

        // 火箭白色流线舱体
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.ellipse(0, 10, 27, 44, 0, 0, Math.PI * 2);
        ctx.fill();

        // 火箭顶部头锥（玫粉）
        ctx.fillStyle = "#f43f5e";
        ctx.beginPath();
        ctx.arc(0, -16, 26, Math.PI * 1.15, Math.PI * 1.85);
        ctx.fill();

        // 舷窗外环与湛蓝玻璃
        ctx.fillStyle = "#0284c7";
        ctx.beginPath();
        ctx.arc(0, 8, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#cbd5e1";
        ctx.lineWidth = 3;
        ctx.stroke();

        // 舷窗玻璃高光
        ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
        ctx.beginPath();
        ctx.arc(-4, 5, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      } else if (curTheme === "sprout") {
        // 树苗/树木成长主题：生机勃勃的绿意树冠与稳固挺拔的主干（完全静止扎根生长，不摇摆晃动）
        const growthFactor = target > 0 ? Math.min(1, elapsed / target) : Math.min(1, elapsed / 180);

        // 地平线高度（适度抬升，避免沉底）
        const groundY = h * 0.7;

        // 1. 阳光光晕与柔和绿地小山丘
        ctx.save();
        ctx.fillStyle = "rgba(16, 185, 129, 0.12)";
        ctx.beginPath();
        ctx.arc(cx, groundY - 80, 100 + growthFactor * 30, 0, Math.PI * 2);
        ctx.fill();

        // 草坪草坡
        ctx.fillStyle = "#047857";
        ctx.beginPath();
        ctx.ellipse(cx, groundY + 80, w * 0.65, 100, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#10b981";
        ctx.beginPath();
        ctx.ellipse(cx, groundY + 70, w * 0.6, 85, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 2. 树干生长计算（稳稳扎根地面，笔直向上挺拔生长，绝不摇摆晃动）
        const treeH = 50 + growthFactor * 100;
        const trunkTopX = cx;
        const trunkTopY = groundY - treeH;

        // 绘制木质树干与分枝
        ctx.save();
        ctx.strokeStyle = "#78350f";
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        // 主树干（随成长逐渐粗壮，稳固垂直）
        const trunkWidth = 10 + growthFactor * 8;
        ctx.lineWidth = trunkWidth;
        ctx.beginPath();
        ctx.moveTo(cx, groundY + 6);
        ctx.lineTo(trunkTopX, trunkTopY);
        ctx.stroke();

        // 树干内层高光树纹
        ctx.strokeStyle = "#92400e";
        ctx.lineWidth = Math.max(3, trunkWidth - 5);
        ctx.beginPath();
        ctx.moveTo(cx - 1, groundY + 4);
        ctx.lineTo(trunkTopX - 1, trunkTopY + 4);
        ctx.stroke();

        // 随树干高度生长出的侧枝（对称扎实，不晃动）
        if (growthFactor > 0.25) {
          // 左分枝
          const branch1Y = groundY - treeH * 0.45;
          const branch1EndX = cx - 28 - growthFactor * 14;
          const branch1EndY = branch1Y - 18;
          ctx.strokeStyle = "#78350f";
          ctx.lineWidth = Math.max(4, trunkWidth * 0.55);
          ctx.beginPath();
          ctx.moveTo(cx, branch1Y);
          ctx.quadraticCurveTo(cx - 12, branch1Y - 8, branch1EndX, branch1EndY);
          ctx.stroke();

          // 左分枝上的树叶簇（静止稳定）
          const drawLeafCluster = (leafX: number, leafY: number, scale: number) => {
            const offsets = [
              { dx: 0, dy: -6, rx: 12, ry: 15, rot: 0, c: "#059669" },
              { dx: -10, dy: -2, rx: 10, ry: 13, rot: -0.5, c: "#10b981" },
              { dx: 10, dy: -2, rx: 10, ry: 13, rot: 0.5, c: "#34d399" },
              { dx: 0, dy: 6, rx: 11, ry: 13, rot: 0, c: "#047857" }
            ];
            offsets.forEach(o => {
              ctx.save();
              ctx.fillStyle = o.c;
              ctx.beginPath();
              ctx.ellipse(
                leafX + o.dx * scale,
                leafY + o.dy * scale,
                o.rx * scale,
                o.ry * scale,
                o.rot,
                0,
                Math.PI * 2
              );
              ctx.fill();
              ctx.restore();
            });
          };

          drawLeafCluster(branch1EndX, branch1EndY, 0.75 + growthFactor * 0.35);

          // 右分枝
          if (growthFactor > 0.4) {
            const branch2Y = groundY - treeH * 0.65;
            const branch2EndX = cx + 30 + growthFactor * 14;
            const branch2EndY = branch2Y - 16;
            ctx.strokeStyle = "#78350f";
            ctx.lineWidth = Math.max(3.5, trunkWidth * 0.48);
            ctx.beginPath();
            ctx.moveTo(cx, branch2Y);
            ctx.quadraticCurveTo(cx + 14, branch2Y - 6, branch2EndX, branch2EndY);
            ctx.stroke();

            drawLeafCluster(branch2EndX, branch2EndY, 0.75 + growthFactor * 0.35);
          }
        }

        // 3. 树顶茂密树冠（或幼苗初发双叶）
        if (growthFactor <= 0.25) {
          // 初期：萌萌的双子叶初芽，水滴高光
          const leafScale = 0.8 + growthFactor * 1.5;
          ctx.fillStyle = "#34d399";
          ctx.beginPath();
          ctx.ellipse(trunkTopX - 14 * leafScale, trunkTopY, 13 * leafScale, 7 * leafScale, -0.4, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = "#10b981";
          ctx.beginPath();
          ctx.ellipse(trunkTopX + 14 * leafScale, trunkTopY, 13 * leafScale, 7 * leafScale, 0.4, 0, Math.PI * 2);
          ctx.fill();

          // 叶脉
          ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(trunkTopX, trunkTopY);
          ctx.lineTo(trunkTopX - 18 * leafScale, trunkTopY - 2);
          ctx.moveTo(trunkTopX, trunkTopY);
          ctx.lineTo(trunkTopX + 18 * leafScale, trunkTopY - 2);
          ctx.stroke();

          // 露珠
          ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
          ctx.beginPath();
          ctx.arc(trunkTopX - 10 * leafScale, trunkTopY - 2, 2.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // 成熟蓬松树冠：多层圆润云朵形绿色叶团，深浅交错，尽显茂盛生机（完全静止挺拔，不晃动）
          const canopyScale = 0.7 + growthFactor * 0.6;
          const canopyY = trunkTopY - 14;

          const crownPuffs = [
            // 底层深绿树冠阴影
            { dx: 0, dy: 10, r: 28, c: "#047857" },
            { dx: -24, dy: 8, r: 24, c: "#065f46" },
            { dx: 24, dy: 8, r: 24, c: "#065f46" },
            // 中层翠绿树冠本体
            { dx: -26, dy: -10, r: 26, c: "#059669" },
            { dx: 26, dy: -10, r: 26, c: "#059669" },
            { dx: 0, dy: -14, r: 32, c: "#10b981" },
            // 顶层鲜嫩浅绿与阳光反射
            { dx: -14, dy: -24, r: 22, c: "#34d399" },
            { dx: 14, dy: -24, r: 22, c: "#34d399" },
            { dx: 0, dy: -32, r: 24, c: "#6ee7b7" }
          ];

          crownPuffs.forEach(p => {
            ctx.save();
            ctx.fillStyle = p.c;
            ctx.beginPath();
            ctx.arc(trunkTopX + p.dx * canopyScale, canopyY + p.dy * canopyScale, p.r * canopyScale, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          });

          // 树冠上的红彤彤小苹果果实（丰收喜悦成就感，稳固悬挂）
          if (growthFactor > 0.5) {
            const fruitCount = Math.min(5, Math.floor((growthFactor - 0.4) * 8) + 1);
            const fruitPositions = [
              { dx: -18, dy: -8 },
              { dx: 18, dy: -6 },
              { dx: 0, dy: 2 },
              { dx: -22, dy: 12 },
              { dx: 20, dy: 14 }
            ];

            fruitPositions.slice(0, fruitCount).forEach(fp => {
              const fx = trunkTopX + fp.dx * canopyScale;
              const fy = canopyY + fp.dy * canopyScale;

              // 红苹果本体
              ctx.save();
              ctx.fillStyle = "#ef4444";
              ctx.beginPath();
              ctx.arc(fx, fy, 5.5, 0, Math.PI * 2);
              ctx.fill();

              // 苹果高光点
              ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
              ctx.beginPath();
              ctx.arc(fx - 1.5, fy - 1.5, 1.5, 0, Math.PI * 2);
              ctx.fill();

              // 小果蒂果梗
              ctx.strokeStyle = "#78350f";
              ctx.lineWidth = 1.2;
              ctx.beginPath();
              ctx.moveTo(fx, fy - 5.5);
              ctx.lineTo(fx + 1.5, fy - 8.5);
              ctx.stroke();
              ctx.restore();
            });
          }
        }
        ctx.restore();
      } else {
        // 气球主题：温润柔和、饱满立体的多巴胺气球束 + 漂浮白云 + 可爱小熊吊篮
        const progress = target > 0 ? Math.min(1, elapsed / target) : Math.min(1, elapsed / 300);
        const startY = h * 0.52;
        const endY = h * 0.18;
        const climbY = startY - progress * (startY - endY);
        const sway = Math.sin(stageTime * 1.8) * 7;
        const bY = climbY + sway;
        const swayX = cx + Math.sin(stageTime * 1.4) * 5;

        // 背景：漂浮柔和白云（不再突兀，天空意境）
        const drawCloud = (cloudX: number, cloudY: number, scale: number) => {
          ctx.save();
          ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
          ctx.beginPath();
          ctx.arc(cloudX, cloudY, 18 * scale, 0, Math.PI * 2);
          ctx.arc(cloudX + 16 * scale, cloudY - 8 * scale, 22 * scale, 0, Math.PI * 2);
          ctx.arc(cloudX + 36 * scale, cloudY - 4 * scale, 18 * scale, 0, Math.PI * 2);
          ctx.arc(cloudX + 46 * scale, cloudY + 4 * scale, 13 * scale, 0, Math.PI * 2);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        };

        const c1X = ((stageTime * 6) % (w + 140)) - 70;
        const c2X = ((stageTime * 4 + w * 0.55) % (w + 160)) - 80;
        drawCloud(c1X, h * 0.22, 1.0);
        drawCloud(c2X, h * 0.74, 1.25);

        // 运行时飘落的梦幻微粒
        if (isRun) {
          for (let i = 0; i < 4; i++) {
            const spX = swayX + Math.sin(stageTime * 3 + i * 2) * 45;
            const spY = bY + 40 + ((stageTime * 20 + i * 25) % 80);
            ctx.save();
            ctx.fillStyle = i % 2 === 0 ? "rgba(251, 191, 36, 0.75)" : "rgba(244, 114, 182, 0.75)";
            ctx.beginPath();
            ctx.arc(spX, spY, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }

        // 气球汇聚打结中心
        const knotX = swayX;
        const knotY = bY + 38;

        // 饱满自然的簇状气球组（各具角度与层次，带饱满光斑）
        const balloonCluster = [
          { ox: 0, oy: -36, rx: 20, ry: 25, color: "#f43f5e", rot: 0 },
          { ox: -20, oy: -22, rx: 18, ry: 23, color: "#38bdf8", rot: -0.18 },
          { ox: 20, oy: -22, rx: 18, ry: 23, color: "#fbbf24", rot: 0.18 },
          { ox: -12, oy: -6, rx: 16, ry: 21, color: "#34d399", rot: -0.08 },
          { ox: 12, oy: -6, rx: 16, ry: 21, color: "#c084fc", rot: 0.08 }
        ];

        // 1. 气球丝线（优雅曲线汇拢到绳结）
        ctx.save();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
        ctx.lineWidth = 1.2;
        balloonCluster.forEach(b => {
          const bx = swayX + b.ox;
          const by = bY + b.oy + b.ry;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.quadraticCurveTo((bx + knotX) / 2 + b.ox * 0.2, (by + knotY) / 2, knotX, knotY);
          ctx.stroke();
        });
        ctx.restore();

        // 2. 绘制每个饱满气球（圆润本体 + 底部小气嘴 + 左上方高光弧）
        balloonCluster.forEach(b => {
          ctx.save();
          if (ctx.translate) {
            ctx.translate(swayX + b.ox, bY + b.oy);
            ctx.rotate(b.rot);
          }

          // 气球本体
          ctx.fillStyle = b.color;
          ctx.beginPath();
          ctx.ellipse(0, 0, b.rx, b.ry, 0, 0, Math.PI * 2);
          ctx.fill();

          // 底部小气嘴
          ctx.beginPath();
          ctx.moveTo(-3, b.ry);
          ctx.lineTo(3, b.ry);
          ctx.lineTo(0, b.ry + 4);
          ctx.closePath();
          ctx.fill();

          // 柔润月牙形高光
          ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
          ctx.beginPath();
          ctx.ellipse(-b.rx * 0.35, -b.ry * 0.35, b.rx * 0.24, b.ry * 0.36, -0.4, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
        });

        // 丝线汇聚处的小蝴蝶结
        ctx.save();
        ctx.fillStyle = "#ec4899";
        ctx.beginPath();
        ctx.ellipse(knotX - 5, knotY, 5, 3, -0.3, 0, Math.PI * 2);
        ctx.ellipse(knotX + 5, knotY, 5, 3, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 连向吊篮的双绳
        const basketY = knotY + 18;
        ctx.save();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(knotX, knotY);
        ctx.lineTo(swayX - 14, basketY);
        ctx.moveTo(knotX, knotY);
        ctx.lineTo(swayX + 14, basketY);
        ctx.stroke();

        // 温暖藤编小篮
        ctx.fillStyle = "#b45309";
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(swayX - 16, basketY, 32, 22, 5);
        } else {
          ctx.rect(swayX - 16, basketY, 32, 22);
        }
        ctx.fill();

        // 编织横纹
        ctx.strokeStyle = "rgba(254, 243, 199, 0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(swayX - 16, basketY + 7);
        ctx.lineTo(swayX + 16, basketY + 7);
        ctx.moveTo(swayX - 16, basketY + 14);
        ctx.lineTo(swayX + 16, basketY + 14);
        ctx.stroke();

        // 探头趴在篮边的小熊
        const bearX = swayX;
        const bearY = basketY - 2;

        // 小熊圆耳朵与粉耳心
        ctx.fillStyle = "#92400e";
        ctx.beginPath();
        ctx.arc(bearX - 8, bearY - 8, 4.5, 0, Math.PI * 2);
        ctx.arc(bearX + 8, bearY - 8, 4.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#f472b6";
        ctx.beginPath();
        ctx.arc(bearX - 8, bearY - 8, 2, 0, Math.PI * 2);
        ctx.arc(bearX + 8, bearY - 8, 2, 0, Math.PI * 2);
        ctx.fill();

        // 小熊脑袋
        ctx.fillStyle = "#92400e";
        ctx.beginPath();
        ctx.arc(bearX, bearY, 11, 0, Math.PI * 2);
        ctx.fill();

        // 奶油小鼻吻
        ctx.fillStyle = "#fef3c7";
        ctx.beginPath();
        ctx.ellipse(bearX, bearY + 3, 5, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // 小鼻子
        ctx.fillStyle = "#451a03";
        ctx.beginPath();
        ctx.arc(bearX, bearY + 2, 1.8, 0, Math.PI * 2);
        ctx.fill();

        // 萌萌眼睛
        ctx.fillStyle = "#451a03";
        ctx.beginPath();
        ctx.arc(bearX - 4, bearY - 1, 1.5, 0, Math.PI * 2);
        ctx.arc(bearX + 4, bearY - 1, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // 腮红
        ctx.fillStyle = "rgba(244, 63, 94, 0.45)";
        ctx.beginPath();
        ctx.arc(bearX - 7, bearY + 3, 2.2, 0, Math.PI * 2);
        ctx.arc(bearX + 7, bearY + 3, 2.2, 0, Math.PI * 2);
        ctx.fill();

        // 扒在篮框上的两只小熊爪
        ctx.fillStyle = "#92400e";
        ctx.beginPath();
        ctx.arc(bearX - 9, basketY + 2, 3.5, 0, Math.PI * 2);
        ctx.arc(bearX + 9, basketY + 2, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      ro.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

export function CountdownTimer() {
  // Store 全局计时器模式与音效
  const timerMode = useCountdownStore(s => s.timerMode);
  const setTimerMode = useCountdownStore(s => s.setTimerMode);
  const soundEnabled = useCountdownStore(s => s.soundEnabled);
  const toggleSound = useCountdownStore(s => s.toggleSound);

  // 倒计时 Store 状态（原版字段）
  const rawTotal = useCountdownStore(s => s.totalSeconds);
  const rawTimeLeft = useCountdownStore(s => s.remainingSeconds);
  const isRunning = useCountdownStore(s => s.isRunning);
  const setTotalSeconds = useCountdownStore(s => s.setTotalSeconds);
  const setRemainingSeconds = useCountdownStore(s => s.setRemainingSeconds);
  const setIsRunning = useCountdownStore(s => s.setIsRunning);
  const resetStore = useCountdownStore(s => s.reset);

  // 正计时 Store 状态
  const stopwatchElapsedSeconds = useCountdownStore(s => s.stopwatchElapsedSeconds);
  const stopwatchTargetSeconds = useCountdownStore(s => s.stopwatchTargetSeconds);
  const isStopwatchRunning = useCountdownStore(s => s.stopwatchIsRunning);
  const stopwatchTheme = useCountdownStore(s => s.stopwatchTheme);
  const stopwatchTargetAction = useCountdownStore(s => s.stopwatchTargetAction);
  const stopwatchLaps = useCountdownStore(s => s.stopwatchLaps);
  const setStopwatchTargetSeconds = useCountdownStore(s => s.setStopwatchTargetSeconds);
  const setStopwatchTargetAction = useCountdownStore(s => s.setStopwatchTargetAction);
  const setStopwatchTheme = useCountdownStore(s => s.setStopwatchTheme);
  const setStopwatchIsRunning = useCountdownStore(s => s.setStopwatchIsRunning);
  const addStopwatchLap = useCountdownStore(s => s.addStopwatchLap);
  const clearStopwatchLaps = useCountdownStore(s => s.clearStopwatchLaps);
  const resetStopwatchStore = useCountdownStore(s => s.resetStopwatch);

  // 安全值，永远不为 NaN/undefined/负数（原版计算方式）
  const totalSeconds = Math.max(1, Number(rawTotal) || 300);
  const timeLeft = Math.min(totalSeconds, Math.max(0, Number(rawTimeLeft) || 0));

  // 倒计时设置面板（原版）
  const [showSettings, setShowSettings] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 倒计时设置面板中的时分秒临时值（原版）
  const [setH, setSetH] = useState(Math.floor(totalSeconds / 3600));
  const [setM, setSetM] = useState(Math.floor((totalSeconds % 3600) / 60));
  const [setS, setSetS] = useState(totalSeconds % 60);

  // 正计时目标设置面板
  const [showSwTargetSettings, setShowSwTargetSettings] = useState(false);
  const [targetH, setTargetH] = useState(Math.floor(stopwatchTargetSeconds / 3600));
  const [targetM, setTargetM] = useState(Math.floor((stopwatchTargetSeconds % 3600) / 60));
  const [targetS, setTargetS] = useState(stopwatchTargetSeconds % 60);
  const [targetActionLocal, setTargetActionLocal] = useState<StopwatchTargetAction>(stopwatchTargetAction);

  // 正计时毫秒与跳动动效
  const [isTickBouncing, setIsTickBouncing] = useState(false);
  const [msDisplay, setMsDisplay] = useState("00");

  // 达成横幅通知
  const [celebrationToast, setCelebrationToast] = useState<{ show: boolean; msg: string }>({
    show: false,
    msg: ""
  });
  const unlockedMilestonesRef = useRef<Set<number>>(new Set());
  const swTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 打开设置时同步当前时长到输入框（原版）
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

  // 打开正计时设置时同步值
  useEffect(() => {
    if (showSwTargetSettings) {
      setTargetH(Math.floor(stopwatchTargetSeconds / 3600));
      setTargetM(Math.floor((stopwatchTargetSeconds % 3600) / 60));
      setTargetS(stopwatchTargetSeconds % 60);
      setTargetActionLocal(stopwatchTargetAction);
    }
  }, [showSwTargetSettings, stopwatchTargetSeconds, stopwatchTargetAction]);

  const progress = totalSeconds > 0 ? timeLeft / totalSeconds : 0;

  // ====== 核心倒计时逻辑（纯时间戳方式，完全保持原版）======
  useEffect(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }

    if (!isRunning) return;

    const s = useCountdownStore.getState();
    if (s.startTime && s.totalSeconds > 0) {
      const elapsed = Math.floor((Date.now() - s.startTime) / 1000);
      const correctedRemaining = Math.max(0, s.totalSeconds - elapsed);
      if (correctedRemaining <= 0) {
        s.setRemainingSeconds(0);
        s.setIsRunning(false);
        return;
      }
      if (Math.abs(correctedRemaining - (Number(s.remainingSeconds) || 0)) > 0.5) {
        s.setRemainingSeconds(correctedRemaining);
      }
    }

    tickRef.current = setInterval(() => {
      const s2 = useCountdownStore.getState();
      if (!s2.startTime || s2.totalSeconds <= 0) return;

      const elapsed = Math.floor((Date.now() - s2.startTime) / 1000);
      const remaining = Math.max(0, s2.totalSeconds - elapsed);

      if (remaining <= 0) {
        s2.setRemainingSeconds(0);
        s2.setIsRunning(false);
        if (tickRef.current) clearInterval(tickRef.current);
        return;
      }

      s2.setRemainingSeconds(remaining);
    }, 1000);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [isRunning]);

  const handleToggle = useCallback(() => {
    const s = useCountdownStore.getState();

    if (!isRunning) {
      const currentRemaining = Math.max(0, Number(s.remainingSeconds) || 0);
      const currentTotal = Math.max(1, Number(s.totalSeconds) || totalSeconds);

      if (currentRemaining <= 0) {
        s.setTotalSeconds(currentTotal);
        s.setRemainingSeconds(currentTotal);
      }
      s.setIsRunning(true);
    } else {
      const currentRemaining = Math.max(0, Number(s.remainingSeconds) || 0);
      s.setIsRunning(false);
      s.setRemainingSeconds(currentRemaining);
    }
  }, [isRunning, totalSeconds]);

  const handleReset = useCallback(() => resetStore(), [resetStore]);

  /** 确认自定义时分秒（倒计时原版实现） */
  const handleConfirmTime = useCallback(() => {
    const secs = (setH || 0) * 3600 + (setM || 0) * 60 + (setS || 0);
    if (secs <= 0) return;
    setTotalSeconds(secs);
    setRemainingSeconds(secs);
    setIsRunning(false);
    setShowSettings(false);
  }, [setH, setM, setS, setTotalSeconds, setRemainingSeconds, setIsRunning]);

  // ====== 核心正计时引擎 ======
  useEffect(() => {
    if (swTickRef.current) {
      clearInterval(swTickRef.current);
      swTickRef.current = null;
    }

    if (!isStopwatchRunning) {
      return;
    }

    let lastSec = stopwatchElapsedSeconds;

    swTickRef.current = setInterval(() => {
      const s = useCountdownStore.getState();
      if (!s.stopwatchStartTime) return;

      const diffMs = Date.now() - s.stopwatchStartTime;
      const currentTotalSec = Math.floor(diffMs / 1000);
      const localMs = Math.floor((diffMs % 1000) / 10);
      setMsDisplay(String(localMs).padStart(2, "0"));

      if (currentTotalSec !== lastSec) {
        lastSec = currentTotalSec;
        s.setStopwatchElapsedSeconds(currentTotalSec);

        setIsTickBouncing(true);
        setTimeout(() => setIsTickBouncing(false), 120);
        if (s.soundEnabled) soundSynth.playPop();

        if (s.stopwatchTargetSeconds > 0 && currentTotalSec >= s.stopwatchTargetSeconds) {
          if (!unlockedMilestonesRef.current.has(s.stopwatchTargetSeconds)) {
            unlockedMilestonesRef.current.add(s.stopwatchTargetSeconds);
            if (s.soundEnabled) soundSynth.playFanfare();
            const minStr = formatSwDigits(s.stopwatchTargetSeconds);
            setCelebrationToast({
              show: true,
              msg: `🎯 目标达成！已专注完成 ${minStr}！太棒啦！🎉`
            });
            setTimeout(() => setCelebrationToast({ show: false, msg: "" }), 4000);

            if (s.stopwatchTargetAction === "stop") {
              s.setStopwatchIsRunning(false);
              s.setStopwatchElapsedSeconds(s.stopwatchTargetSeconds);
            }
          }
        } else if (s.stopwatchTargetSeconds === 0) {
          const milestones = [
            { sec: 60, title: "太棒啦！小朋友们已经专注了 1 分钟！🌟" },
            { sec: 180, title: "超厉害！专注达人 3 分钟！🏆" },
            { sec: 300, title: "太神奇了！毅力小超人 5 分钟！⭐" },
            { sec: 600, title: "宇宙奇迹！终极探索家 10 分钟！👑" }
          ];
          for (const m of milestones) {
            if (currentTotalSec >= m.sec && !unlockedMilestonesRef.current.has(m.sec)) {
              unlockedMilestonesRef.current.add(m.sec);
              if (s.soundEnabled) soundSynth.playChime();
              setCelebrationToast({ show: true, msg: m.title });
              setTimeout(() => setCelebrationToast({ show: false, msg: "" }), 4000);
              break;
            }
          }
        }
      }
    }, 50);

    return () => {
      if (swTickRef.current) clearInterval(swTickRef.current);
    };
  }, [isStopwatchRunning, stopwatchElapsedSeconds]);

  const handleToggleStopwatch = useCallback(() => {
    if (isStopwatchRunning) {
      setStopwatchIsRunning(false);
    } else {
      setStopwatchIsRunning(true);
    }
  }, [isStopwatchRunning, setStopwatchIsRunning]);

  const handleResetStopwatch = useCallback(() => {
    unlockedMilestonesRef.current.clear();
    resetStopwatchStore();
    setMsDisplay("00");
  }, [resetStopwatchStore]);

  const handleConfirmStopwatchTarget = useCallback(() => {
    const secs = (targetH || 0) * 3600 + (targetM || 0) * 60 + (targetS || 0);
    setStopwatchTargetSeconds(Math.max(0, secs));
    setStopwatchTargetAction(targetActionLocal);
    unlockedMilestonesRef.current.clear();
    setShowSwTargetSettings(false);
  }, [targetH, targetM, targetS, targetActionLocal, setStopwatchTargetSeconds, setStopwatchTargetAction]);

  // =========================================================================
  // 模式一：经典滴水倒计时（完全保持原版的结构、类名、动画与样式）
  // =========================================================================
  if (timerMode === "countdown") {
    return (
      <div className="relative flex h-full w-full select-none flex-col overflow-y-auto bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] p-5 text-white md:flex-row md:items-center md:justify-center md:gap-5 md:overflow-hidden md:rounded-xl md:p-0">
        {/* 右上角：在倒计时的功能中的右上角加入一个正计时切换按钮 */}
        <div className="absolute top-3.5 right-3.5 z-40 flex items-center gap-2">
          <div className="flex items-center rounded-full border border-white/12 bg-white/[0.08] p-[3px] backdrop-blur-md">
            <button
              type="button"
              onClick={() => setTimerMode("countdown")}
              className="flex items-center gap-1.5 rounded-[20px] px-3.5 py-1.5 text-[13px] font-semibold bg-gradient-to-r from-[#3b82f6] to-[#2563eb] text-white shadow-[0_4px_12px_rgba(37,99,235,0.35)] cursor-pointer"
            >
              <span>⏱️ 倒计时</span>
              {isRunning && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
            </button>
            <button
              type="button"
              onClick={() => setTimerMode("stopwatch")}
              className="flex items-center gap-1.5 rounded-[20px] px-3.5 py-1.5 text-[13px] font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <span>🚀 正计时</span>
              {isStopwatchRunning && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
            </button>
          </div>
        </div>

        {/* 左侧：文字 + 计时 + 按钮（原版最初设计） */}
        <div className="flex shrink-0 flex-col items-center justify-center text-center md:items-start md:pl-4 md:text-left">
          <h1
            className="mb-2 text-3xl font-bold sm:text-4xl md:mb-3"
            style={{
              background: "linear-gradient(135deg,#60a5fa,#3b82f6)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent"
            }}
          >
            滴水倒计
          </h1>
          <p className="mb-6 max-w-[18rem] text-sm leading-6 text-slate-400/80 md:mb-7">
            每一滴水落下的瞬间，都是时间的回响。
          </p>

          <div
            className={`mb-7 font-black leading-none tracking-wider tabular-nums text-white md:mb-8 ${
              totalSeconds >= 3600 ? "text-[clamp(44px,13vw,56px)]" : "text-[clamp(56px,17vw,72px)]"
            }`}
          >
            {formatTime(timeLeft, totalSeconds >= 3600)}
          </div>

          <div className="flex items-center justify-center gap-3 md:gap-4">
            <button
              onClick={handleToggle}
              className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-2xl shadow-lg transition-all duration-200 hover:scale-105 active:scale-95"
              style={{ background: "linear-gradient(135deg,#3b82f6,#2563eb)" }}
              aria-label={isRunning ? "暂停倒计时" : "开始倒计时"}
            >
              {isRunning ? <Pause className="h-7 w-7 text-white" /> : <Play className="h-7 w-7 text-white ml-0.5" />}
            </button>
            <button
              onClick={handleReset}
              className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/10 backdrop-blur-sm transition-colors hover:bg-white/15 active:scale-95"
              aria-label="重置倒计时"
            >
              <RotateCcw className="h-5 w-5 text-slate-300" />
            </button>
            <button
              onClick={() => setShowSettings(prev => !prev)}
              className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/10 backdrop-blur-sm transition-colors hover:bg-white/15 active:scale-95"
              aria-label="设置倒计时时长"
            >
              <Settings className="h-5 w-5 text-slate-300" />
            </button>
          </div>
        </div>

        {/* 右侧：滴水动画（原版最初设计） */}
        <div className="relative mx-auto mt-5 h-[min(44dvh,360px)] w-[min(68vw,240px)] shrink-0 md:mx-0 md:mt-0 md:h-[420px] md:w-[260px]">
          {/* 背景光晕 */}
          <div
            className="absolute inset-0 rounded-[28px]"
            style={{
              background: "radial-gradient(circle at 50% 35%, rgba(59,130,246,0.07), transparent 70%)"
            }}
          />
          <WaterDrip progress={progress} isRunning={isRunning} />
        </div>

        {/* ====== 设置面板（原版最初设计） ====== */}
        {showSettings && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm md:rounded-xl"
              onClick={() => setShowSettings(false)}
            />

            <div className="relative w-full max-w-[360px] rounded-2xl border border-white/10 bg-slate-800/95 p-5 shadow-2xl sm:p-6">
              <button
                onClick={() => setShowSettings(false)}
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/10"
                aria-label="关闭设置"
              >
                <X className="h-4 w-4 text-slate-400" />
              </button>

              <h3 className="mb-5 text-lg font-semibold text-white">设置倒计时时长</h3>

              {/* 时分秒输入 */}
              <div className="mb-6 grid grid-cols-3 gap-2">
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
                      className="h-12 w-full rounded-xl border border-white/10 bg-slate-700/60 text-center text-xl font-bold text-white focus:border-blue-400/50 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <span className="text-xs text-slate-400">{label}</span>
                  </div>
                ))}
              </div>

              {/* 快捷选项 */}
              <div className="mb-5 grid grid-cols-3 gap-2">
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
                    className={`cursor-pointer rounded-lg px-2.5 py-2 text-xs font-medium transition-all ${
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
                className="w-full cursor-pointer rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                确认
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // 模式二：幼小儿童新颖正计时（参考倒计时同构双栏布局，兼具童趣美感）
  // =========================================================================
  return (
    <div
      className="relative flex h-full w-full select-none flex-col overflow-y-auto p-5 text-white md:flex-row md:items-center md:justify-center md:gap-8 md:overflow-hidden md:rounded-xl md:p-0"
      style={{
        background: "radial-gradient(ellipse at 50% 20%, #1e1b4b 0%, #0f172a 70%, #020617 100%)"
      }}
    >
      {/* 背景闪烁星空微粒 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {STARS.map((star, idx) => (
          <div
            key={idx}
            className="absolute rounded-full bg-white animate-pulse"
            style={{
              width: `${star.size}px`,
              height: `${star.size}px`,
              left: `${star.left}%`,
              top: `${star.top}%`,
              opacity: star.opacity,
              filter: "blur(0.5px)",
              animationDuration: `${star.duration}s`,
              animationDelay: `${star.delay}s`
            }}
          />
        ))}
      </div>

      {/* 右上角模式切换胶囊与音效开关 */}
      <div className="absolute top-3.5 right-3.5 z-40 flex items-center gap-2">
        <div className="flex items-center rounded-full bg-white/[0.07] p-[3px] backdrop-blur-md">
          <button
            type="button"
            onClick={() => setTimerMode("countdown")}
            className="flex items-center gap-1.5 rounded-[20px] px-3.5 py-1.5 text-[13px] font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <span>⏱️ 倒计时</span>
            {isRunning && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
          </button>
          <button
            type="button"
            onClick={() => setTimerMode("stopwatch")}
            className="flex items-center gap-1.5 rounded-[20px] px-3.5 py-1.5 text-[13px] font-semibold bg-gradient-to-r from-[#ec4899] to-[#f43f5e] text-white shadow-[0_4px_12px_rgba(244,63,94,0.35)] cursor-pointer"
          >
            <span>🚀 正计时</span>
            {isStopwatchRunning && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
          </button>
        </div>

        <button
          type="button"
          onClick={toggleSound}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.07] text-sm text-slate-300 transition-colors hover:bg-white/15 hover:text-white cursor-pointer"
          title={soundEnabled ? "音效开启" : "音效静音"}
          aria-label={soundEnabled ? "音效开启" : "音效静音"}
        >
          {soundEnabled ? "🔔" : "🔕"}
        </button>
      </div>

      {/* 左侧：排版参考倒计时（精致童趣标题 + 主题胶囊 + 果冻立体大字 + 激励星光条 + 控制按钮） */}
      <div className="relative flex shrink-0 flex-col items-center justify-center text-center md:items-start md:pl-4 md:text-left z-10 max-w-[440px]">
        {/* 动态童趣主标题与副标题（对齐倒计时左侧节奏，避免背景裁剪块状渐变渲染缺陷） */}
        <div className="mb-1 flex flex-wrap items-center justify-center gap-2 md:justify-start">
          <h1
            key={stopwatchTheme}
            className={`text-3xl font-extrabold sm:text-4xl tracking-tight bg-clip-text text-transparent select-none ${
              stopwatchTheme === "rocket"
                ? "bg-gradient-to-r from-rose-400 via-pink-400 to-amber-300"
                : stopwatchTheme === "sprout"
                  ? "bg-gradient-to-r from-emerald-400 via-teal-300 to-yellow-300"
                  : "bg-gradient-to-r from-pink-400 via-fuchsia-400 to-sky-300"
            }`}
            style={{
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent"
            }}
          >
            {stopwatchTheme === "rocket" ? "星际探索" : stopwatchTheme === "sprout" ? "幼苗成长" : "童趣气球"}
          </h1>
        </div>
        <p className="mb-3 max-w-[20rem] text-xs leading-5 text-slate-300/80 md:text-sm md:leading-6">
          {stopwatchTheme === "rocket"
            ? "伴随火箭升空，每一步探索都是成长！"
            : stopwatchTheme === "sprout"
              ? "每一秒的专注，都在见证生命的茁壮成长。"
              : "伴随气球轻盈高飞，记录每一个闪光瞬间。"}
        </p>

        {/* 顶部主题与目标设定行（无突兀边框，柔和背景融入） */}
        <div className="mb-3 flex flex-wrap items-center justify-center gap-2 md:justify-start">
          <div className="flex items-center gap-1 rounded-xl bg-white/[0.07] p-[3px] backdrop-blur-sm shadow-sm">
            <button
              type="button"
              onClick={() => setStopwatchTheme("rocket")}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold cursor-pointer transition-all ${
                stopwatchTheme === "rocket"
                  ? "bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-[0_2px_8px_rgba(244,63,94,0.4)]"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <span>🚀 火箭</span>
            </button>
            <button
              type="button"
              onClick={() => setStopwatchTheme("sprout")}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold cursor-pointer transition-all ${
                stopwatchTheme === "sprout"
                  ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-[0_2px_8px_rgba(16,185,129,0.4)]"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <span>🌱 树苗</span>
            </button>
            <button
              type="button"
              onClick={() => setStopwatchTheme("balloon")}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold cursor-pointer transition-all ${
                stopwatchTheme === "balloon"
                  ? "bg-gradient-to-r from-pink-500 to-purple-500 text-white shadow-[0_2px_8px_rgba(236,72,153,0.4)]"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <span>🎈 气球</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowSwTargetSettings(true)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-bold cursor-pointer transition-all hover:scale-105 active:scale-95 shadow-sm ${
              stopwatchTargetSeconds > 0 && stopwatchElapsedSeconds > stopwatchTargetSeconds
                ? "bg-red-500/20 text-red-200 animate-pulse"
                : stopwatchTargetSeconds > 0
                  ? "bg-amber-400/[0.15] text-amber-200 hover:bg-amber-400/25"
                  : "bg-white/[0.07] text-slate-300 hover:bg-white/[0.12] hover:text-white"
            }`}
            title="点击设置正计时目标时间"
          >
            <span>🎯 目标: </span>
            <span>
              {stopwatchTargetSeconds > 0
                ? `${formatSwDigits(stopwatchTargetSeconds)} (${Math.min(
                    100,
                    Math.round((stopwatchElapsedSeconds / stopwatchTargetSeconds) * 100)
                  )}%)`
                : "自由计时"}
            </span>
            <span className="ml-1 text-[11px] underline opacity-85">设时间</span>
          </button>
        </div>

        {/* 状态胶囊提示（无突兀边框，采用通透软底色） */}
        <div
          className="mb-2.5 inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-bold transition-all"
          style={{
            background: isStopwatchRunning
              ? "rgba(16, 185, 129, 0.14)"
              : stopwatchElapsedSeconds >= (stopwatchTargetSeconds || Infinity) && stopwatchTargetSeconds > 0
                ? "rgba(251, 191, 36, 0.14)"
                : "rgba(244, 63, 94, 0.14)",
            color: isStopwatchRunning
              ? "#34d399"
              : stopwatchElapsedSeconds >= (stopwatchTargetSeconds || Infinity) && stopwatchTargetSeconds > 0
                ? "#fde047"
                : "#fda4af"
          }}
        >
          <span>
            {isStopwatchRunning
              ? "🚀"
              : stopwatchTargetSeconds > 0 && stopwatchElapsedSeconds >= stopwatchTargetSeconds
                ? "🎉"
                : "🌟"}
          </span>
          <span>
            {isStopwatchRunning
              ? stopwatchTargetSeconds > 0
                ? `正飞向目标 (${Math.min(
                    100,
                    Math.round((stopwatchElapsedSeconds / stopwatchTargetSeconds) * 100)
                  )}%) 🚀`
                : "正在星际漫游中... ⭐"
              : stopwatchTargetSeconds > 0 && stopwatchElapsedSeconds >= stopwatchTargetSeconds
                ? "目标已圆满达成！"
                : stopwatchElapsedSeconds > 0
                  ? "已暂停探索"
                  : "准备起航！点击开始探索"}
          </span>
        </div>

        {/* 正计时果冻立体大字 */}
        <div className="mb-3 flex flex-wrap items-baseline justify-center gap-2 md:justify-start">
          <div
            className={`font-black tabular-nums tracking-[-1px] text-white transition-transform duration-75 inline-block ${
              isTickBouncing ? "scale-105" : "scale-100"
            }`}
            style={{
              fontSize: "clamp(54px, 15vw, 68px)",
              lineHeight: 1,
              textShadow:
                stopwatchTheme === "rocket"
                  ? "0 4px 0 #be185d, 0 10px 24px rgba(244, 63, 94, 0.4)"
                  : stopwatchTheme === "sprout"
                    ? "0 4px 0 #047857, 0 10px 24px rgba(16, 185, 129, 0.4)"
                    : "0 4px 0 #831843, 0 10px 24px rgba(236, 72, 153, 0.4)"
            }}
          >
            {formatSwDigits(stopwatchElapsedSeconds)}
          </div>
          <div
            className="font-extrabold tabular-nums transition-colors"
            style={{
              fontSize: "clamp(24px, 6vw, 30px)",
              color: stopwatchTheme === "rocket" ? "#f472b6" : stopwatchTheme === "sprout" ? "#34d399" : "#38bdf8"
            }}
          >
            .{msDisplay}
          </div>
          {stopwatchTargetSeconds > 0 && stopwatchElapsedSeconds > stopwatchTargetSeconds && (
            <div className="rounded-lg bg-orange-500/20 px-2 py-0.5 text-xs font-extrabold text-orange-400 animate-pulse">
              超时 +{formatSwDigits(stopwatchElapsedSeconds - stopwatchTargetSeconds)}
            </div>
          )}
        </div>

        {/* 儿童里程碑即时激励星光条（自然通透底色，去除硬边框） */}
        <div className="mb-5 w-full max-w-[380px] rounded-2xl bg-white/[0.05] p-3 backdrop-blur-md shadow-inner">
          <div className="flex justify-between text-[11px] font-semibold text-slate-200 mb-1.5">
            <span>
              {stopwatchTargetSeconds > 0
                ? `🎯 目标挑战: ${formatSwDigits(stopwatchTargetSeconds)}`
                : "⭐ 专注探索进度"}
            </span>
            <span className="font-mono">
              {stopwatchTargetSeconds > 0
                ? `${Math.min(
                    100,
                    Math.round((stopwatchElapsedSeconds / stopwatchTargetSeconds) * 100)
                  )}% (${formatSwDigits(stopwatchElapsedSeconds)} / ${formatSwDigits(stopwatchTargetSeconds)})`
                : `已坚持 ${Math.floor(stopwatchElapsedSeconds / 60)} 分 ${stopwatchElapsedSeconds % 60} 秒`}
            </span>
          </div>

          <div className="relative h-2.5 w-full rounded-full overflow-hidden bg-black/35">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(
                  100,
                  (stopwatchElapsedSeconds / (stopwatchTargetSeconds > 0 ? stopwatchTargetSeconds : 600)) * 100
                )}%`,
                background:
                  stopwatchTheme === "sprout"
                    ? "linear-gradient(90deg, #10b981, #34d399, #facc15, #fbbf24)"
                    : stopwatchTheme === "balloon"
                      ? "linear-gradient(90deg, #ec4899, #a855f7, #38bdf8, #10b981)"
                      : "linear-gradient(90deg, #ec4899, #f43f5e, #fbbf24, #10b981)",
                boxShadow:
                  stopwatchTheme === "sprout" ? "0 0 10px rgba(16, 185, 129, 0.7)" : "0 0 10px rgba(244, 63, 94, 0.7)"
              }}
            />
          </div>

          <div className="mt-1.5 flex justify-between px-1">
            {stopwatchTargetSeconds > 0
              ? [
                  { p: 0.25, label: "25%", icon: "🚀" },
                  { p: 0.5, label: "50%", icon: "⭐" },
                  { p: 0.75, label: "75%", icon: "🌟" },
                  { p: 1.0, label: "100%", icon: "🏆" }
                ].map((q, idx) => {
                  const unlocked = stopwatchElapsedSeconds >= stopwatchTargetSeconds * q.p;
                  return (
                    <div
                      key={idx}
                      className={`flex flex-col items-center text-[10px] transition-all duration-200 ${
                        unlocked
                          ? "text-yellow-300 scale-110 font-bold drop-shadow-[0_2px_8px_rgba(250,204,21,0.6)]"
                          : "text-slate-400 opacity-60"
                      }`}
                    >
                      <span className="text-sm">{q.icon}</span>
                      <span>{q.label}</span>
                    </div>
                  );
                })
              : [
                  { time: 60, label: "1分", icon: "⭐" },
                  { time: 180, label: "3分", icon: "🌟" },
                  { time: 300, label: "5分", icon: "🏆" },
                  { time: 600, label: "10分", icon: "👑" }
                ].map((n, idx) => {
                  const unlocked = stopwatchElapsedSeconds >= n.time;
                  return (
                    <div
                      key={idx}
                      className={`flex flex-col items-center text-[10px] transition-all duration-200 ${
                        unlocked
                          ? "text-yellow-300 scale-110 font-bold drop-shadow-[0_2px_8px_rgba(250,204,21,0.6)]"
                          : "text-slate-400 opacity-60"
                      }`}
                    >
                      <span className="text-sm">{n.icon}</span>
                      <span>{n.label}</span>
                    </div>
                  );
                })}
          </div>
        </div>

        {/* 控制按钮群：对称参考倒计时（大主控按钮 + 重置 + 打卡 + 设置） */}
        <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
          <button
            type="button"
            onClick={handleToggleStopwatch}
            className="flex h-16 items-center justify-center gap-2.5 rounded-2xl px-7 text-base font-extrabold text-white cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 shadow-lg"
            style={{
              background: isStopwatchRunning
                ? "linear-gradient(135deg, #10b981, #059669)"
                : stopwatchTheme === "sprout"
                  ? "linear-gradient(135deg, #10b981, #047857)"
                  : stopwatchTheme === "balloon"
                    ? "linear-gradient(135deg, #ec4899, #be185d)"
                    : "linear-gradient(135deg, #f43f5e, #e11d48)",
              boxShadow: isStopwatchRunning
                ? "0 10px 24px -4px rgba(16, 185, 129, 0.5), inset 0 2px 0 rgba(255, 255, 255, 0.35)"
                : stopwatchTheme === "sprout"
                  ? "0 10px 24px -4px rgba(16, 185, 129, 0.5), inset 0 2px 0 rgba(255, 255, 255, 0.35)"
                  : "0 10px 24px -4px rgba(244, 63, 94, 0.5), inset 0 2px 0 rgba(255, 255, 255, 0.35)"
            }}
            aria-label={isStopwatchRunning ? "暂停正计时" : "开始正计时"}
          >
            {isStopwatchRunning ? (
              <Pause className="h-6 w-6 text-white" />
            ) : (
              <Play className="ml-0.5 h-6 w-6 text-white" />
            )}
            <span className="text-base font-extrabold">
              {isStopwatchRunning ? "暂停探索" : stopwatchElapsedSeconds > 0 ? "继续探索" : "开始探索"}
            </span>
          </button>

          <button
            type="button"
            onClick={handleResetStopwatch}
            className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-2xl bg-white/[0.08] backdrop-blur-md transition-all hover:bg-white/[0.14] active:scale-95 shadow-sm text-slate-300 hover:text-white"
            title="重置"
            aria-label="重置正计时"
          >
            <RotateCcw className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => {
              addStopwatchLap();
              if (soundEnabled) soundSynth.playPop();
            }}
            className="flex h-14 items-center gap-1.5 cursor-pointer rounded-2xl bg-white/[0.08] px-4 backdrop-blur-md transition-all hover:bg-white/[0.14] active:scale-95 shadow-sm text-slate-300 hover:text-white"
            title="在课堂互动中插旗打卡"
            aria-label="在课堂互动中插旗打卡"
          >
            <span className="text-lg">🚩</span>
            <span className="text-xs font-bold">打卡</span>
            {stopwatchLaps.length > 0 && (
              <span className="ml-0.5 rounded-full bg-rose-500/80 px-1.5 py-0.2 text-[10px] font-extrabold text-white">
                {stopwatchLaps.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowSwTargetSettings(true)}
            className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-2xl bg-white/[0.08] backdrop-blur-md transition-all hover:bg-white/[0.14] active:scale-95 shadow-sm text-slate-300 hover:text-white"
            title="设置正计时目标时间"
            aria-label="设置正计时目标时间"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* 右侧：参考倒计时右侧尺寸与外壳，置入 Canvas 舞台 */}
      <div className="relative mx-auto mt-5 h-[min(44dvh,360px)] w-[min(68vw,260px)] shrink-0 md:mx-0 md:mt-0 md:h-[420px] md:w-[280px]">
        {/* 背景光晕（无突兀边框，仅柔和环境光感） */}
        <div
          className="absolute inset-0 rounded-[28px] pointer-events-none"
          style={{
            background:
              stopwatchTheme === "sprout"
                ? "radial-gradient(circle at 50% 35%, rgba(16,185,129,0.14), transparent 70%)"
                : stopwatchTheme === "balloon"
                  ? "radial-gradient(circle at 50% 35%, rgba(168,85,247,0.14), transparent 70%)"
                  : "radial-gradient(circle at 50% 35%, rgba(244,63,94,0.14), transparent 70%)"
          }}
        />

        {/* 舞台卡片容器（去除生硬描边，采用无界通透融合） */}
        <div
          className="relative h-full w-full rounded-[28px] overflow-hidden transition-colors duration-500"
          style={{
            background:
              stopwatchTheme === "sprout"
                ? "linear-gradient(180deg, rgba(6, 78, 59, 0.3) 0%, rgba(15, 23, 42, 0.75) 100%)"
                : stopwatchTheme === "balloon"
                  ? "linear-gradient(180deg, rgba(88, 28, 135, 0.22) 0%, rgba(30, 58, 138, 0.18) 45%, rgba(15, 23, 42, 0.75) 100%)"
                  : "linear-gradient(180deg, rgba(30, 27, 75, 0.35) 0%, rgba(15, 23, 42, 0.75) 100%)"
          }}
        >
          <ChildStage
            theme={stopwatchTheme}
            isRunning={isStopwatchRunning}
            elapsedSeconds={stopwatchElapsedSeconds}
            targetSeconds={stopwatchTargetSeconds}
          />
        </div>

        {/* 课堂打卡记录浮层（弱化边框，采用通透磨砂） */}
        {stopwatchLaps.length > 0 && (
          <div
            className="absolute bottom-3 right-3 w-[180px] max-h-[150px] rounded-2xl p-2.5 text-xs shadow-2xl backdrop-blur-md z-20"
            style={{ background: "rgba(15, 23, 42, 0.88)" }}
          >
            <div className="mb-1.5 flex items-center justify-between font-bold text-pink-300">
              <span className="flex items-center gap-1">🚩 打卡记录 ({stopwatchLaps.length})</span>
              <button
                type="button"
                onClick={clearStopwatchLaps}
                className="text-[10px] text-slate-400 hover:text-white cursor-pointer"
              >
                清空
              </button>
            </div>
            <div className="max-h-[96px] overflow-y-auto space-y-1 font-mono text-[11px] pr-0.5">
              {stopwatchLaps.map(lap => (
                <div
                  key={lap.id}
                  className="flex justify-between items-center rounded-lg bg-white/[0.04] px-2 py-0.5 text-slate-200"
                >
                  <span className="text-[10px] text-slate-400">第 {lap.index} 棒</span>
                  <span className="font-bold text-[#f43f5e]">{lap.time}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 里程碑达成大横幅通知 */}
      {celebrationToast.show && (
        <div
          className="absolute top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 rounded-[30px] px-6 py-2.5 text-base font-extrabold text-white shadow-[0_10px_30px_rgba(245,158,11,0.5)] animate-bounce pointer-events-none"
          style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)" }}
        >
          <span className="text-2xl">🎉</span>
          <span>{celebrationToast.msg}</span>
          <span className="text-2xl">⭐</span>
        </div>
      )}

      {/* 正计时目标时间设置弹窗 */}
      {showSwTargetSettings && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/65 backdrop-blur-sm md:rounded-xl"
            onClick={() => setShowSwTargetSettings(false)}
          />
          <div
            className="relative w-full max-w-[380px] rounded-[24px] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.6)] z-10"
            style={{ background: "#1e293b" }}
          >
            <div className="mb-4 flex items-center justify-between text-lg font-bold text-white">
              <span>🚀 设置正计时目标时间</span>
              <button
                type="button"
                onClick={() => setShowSwTargetSettings(false)}
                className="text-base text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* 快捷选项：自由模式 / 预设时长 */}
            <div className="mb-4 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setTargetH(0);
                  setTargetM(0);
                  setTargetS(0);
                }}
                className={`cursor-pointer rounded-[12px] p-2 text-xs font-semibold transition-all ${
                  (targetH || 0) * 3600 + (targetM || 0) * 60 + (targetS || 0) === 0
                    ? "bg-[#f43f5e] text-white shadow-md shadow-rose-500/30"
                    : "bg-white/[0.07] text-slate-300 hover:bg-rose-500/30 hover:text-white"
                }`}
              >
                自由计时(无限制)
              </button>
              {[
                { min: 1, label: "1分钟(速答)" },
                { min: 3, label: "3分钟(分享)" },
                { min: 5, label: "5分钟(研讨)" },
                { min: 10, label: "10分钟(探究)" },
                { min: 15, label: "15分钟(竞赛)" }
              ].map(({ min, label }) => (
                <button
                  key={min}
                  type="button"
                  onClick={() => {
                    setTargetH(Math.floor(min / 60));
                    setTargetM(min % 60);
                    setTargetS(0);
                  }}
                  className={`cursor-pointer rounded-[12px] p-2 text-xs font-semibold transition-all ${
                    (targetH || 0) * 60 + targetM === min && !targetS
                      ? "bg-[#f43f5e] text-white shadow-md shadow-rose-500/30"
                      : "bg-white/[0.07] text-slate-300 hover:bg-rose-500/30 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* 自定义时分秒微调 */}
            <div className="mb-4 grid grid-cols-3 gap-2.5">
              {[
                { value: targetH, set: setTargetH, max: 99, label: "时" },
                { value: targetM, set: setTargetM, max: 59, label: "分" },
                { value: targetS, set: setTargetS, max: 59, label: "秒" }
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
                    className="h-12 w-full rounded-xl bg-slate-900/90 text-center text-xl font-bold text-white focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <span className="text-xs text-slate-400">{label}</span>
                </div>
              ))}
            </div>

            {/* 到达目标后的动作选项 */}
            <div className="mb-5 rounded-xl bg-black/25 p-3">
              <span className="mb-2 block text-xs text-slate-400">到达目标时间后动作：</span>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setTargetActionLocal("stop")}
                  className={`flex-1 rounded-lg py-2 text-xs font-semibold cursor-pointer transition-all ${
                    targetActionLocal === "stop"
                      ? "bg-[#10b981] text-white shadow-sm"
                      : "bg-white/[0.07] text-slate-300 hover:bg-white/10"
                  }`}
                >
                  ⏹️ 自动停止并庆祝
                </button>
                <button
                  type="button"
                  onClick={() => setTargetActionLocal("continue")}
                  className={`flex-1 rounded-lg py-2 text-xs font-semibold cursor-pointer transition-all ${
                    targetActionLocal === "continue"
                      ? "bg-[#10b981] text-white shadow-sm"
                      : "bg-white/[0.07] text-slate-300 hover:bg-white/10"
                  }`}
                >
                  ⏱️ 超时继续记录
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleConfirmStopwatchTarget}
              className="w-full cursor-pointer rounded-xl bg-gradient-to-r from-[#f43f5e] to-[#e11d48] py-3 text-sm font-bold text-white shadow-lg transition-all hover:opacity-95 active:scale-[0.98]"
            >
              确认保存目标
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
