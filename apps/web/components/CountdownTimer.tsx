/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 * **********************************************************************************************
 */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, RotateCcw, Settings } from "lucide-react";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** 沙漏 SVG 动画组件 */
function Hourglass({ progress }: { progress: number }) {
  const fillHeight = progress * 42;

  return (
    <svg viewBox="0 0 200 340" className="w-full h-full drop-shadow-2xl">
      <defs>
        <linearGradient id="sandGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="50%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#ea580c" />
        </linearGradient>
        <clipPath id="topClip">
          <path d="M20,10 L180,10 L110,150 Q100,170 100,190 Q100,210 90,230 L20,330 L180,330 L110,230 Q100,210 100,190 Q100,170 90,150 Z" />
        </clipPath>
      </defs>

      {/* 外框 */}
      <rect
        x="15"
        y="5"
        width="170"
        height="330"
        rx="24"
        fill="none"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="2.5"
      />

      {/* 沙漏轮廓 */}
      <path
        d="M20,10 L180,10 L110,150 Q100,170 100,190 Q100,210 90,230 L20,330 L180,330 L110,230 Q100,210 100,190 Q100,170 90,150 Z"
        fill="rgba(255,255,255,0.03)"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="1.8"
      />

      {/* 上半部分沙子（随时间减少） */}
      <g clipPath="url(#topClip)">
        <rect x="0" y={10} width="200" height={fillHeight} fill="url(#sandGradient)" opacity={progress > 0.02 ? 1 : 0}>
          <animate
            attributeName="opacity"
            from={progress > 0.02 ? 1 : 0}
            to={progress > 0.02 ? 1 : 0}
            dur="0.3s"
            fill="freeze"
          />
        </rect>

        {/* 沙流效果 - 中间细流 */}
        {progress > 0.01 && (
          <rect x="97" y="185" width="6" height="30" fill="#f97316" opacity="0.9">
            <animate attributeName="opacity" values="0.7;1;0.7" dur="0.4s" repeatCount="indefinite" />
          </rect>
        )}
      </g>

      {/* 下半部分堆积的沙子（随时间增加） */}
      <g clipPath="url(#topClip)">
        <path
          d={`M25,${330 - fillHeight * 0.85} L175,${330 - fillHeight * 0.85}
              Q160,${330 - fillHeight * 0.4} 140,${330 - fillHeight * 0.15}
              L100,330 L60,${330 - fillHeight * 0.15}
              Q40,${330 - fillHeight * 0.4} 25,${330 - fillHeight * 0.85} Z`}
          fill="url(#sandGradient)"
          opacity={1 - progress > 0.05 ? 1 : 0}
        />
      </g>
    </svg>
  );
}

export function CountdownTimer() {
  const [totalSeconds, setTotalSeconds] = useState(5 * 60); // 默认5分钟
  const [timeLeft, setTimeLeft] = useState(5 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const progress = totalSeconds > 0 ? timeLeft / totalSeconds : 0;

  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            setIsRunning(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  const handleToggle = useCallback(() => setIsRunning(prev => !prev), []);
  const handleReset = useCallback(() => {
    setIsRunning(false);
    setTimeLeft(totalSeconds);
  }, [totalSeconds]);

  return (
    <div className="flex items-center justify-center w-full h-full select-none">
      {/* 左侧：文字 + 计时 + 按钮 */}
      <div className="flex flex-col justify-center pr-8 pl-6 shrink-0">
        <h1
          className="text-4xl font-bold mb-3"
          style={{
            background: "linear-gradient(135deg,#fbbf24,#f59e0b)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent"
          }}
        >
          流沙倒计
        </h1>
        <p className="text-sm text-slate-400/80 mb-10">每一粒滑过的沙粒，都是时间的重量。</p>

        <div className="text-[72px] font-black tracking-wider leading-none mb-10 tabular-nums text-white">
          {formatTime(timeLeft)}
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleToggle}
            className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
            style={{ background: "linear-gradient(135deg,#f97316,#ea580c)" }}
          >
            {isRunning ? <Pause className="h-7 w-7 text-white" /> : <Play className="h-7 w-7 text-white ml-0.5" />}
          </button>
          <button
            onClick={handleReset}
            className="w-14 h-14 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center backdrop-blur-sm transition-colors hover:bg-white/15 active:scale-95 cursor-pointer"
          >
            <RotateCcw className="h-5 w-5 text-slate-300" />
          </button>
          <button className="w-14 h-14 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center backdrop-blur-sm transition-colors hover:bg-white/15 active:scale-95 cursor-pointer">
            <Settings className="h-5 w-5 text-slate-300" />
          </button>
        </div>
      </div>

      {/* 右侧：沙漏动画 */}
      <div className="relative w-[260px] h-[380px] shrink-0 mr-4">
        {/* 背景光晕 */}
        <div
          className="absolute inset-0 rounded-[28px]"
          style={{
            background: "radial-gradient(circle at 50% 40%, rgba(249,115,22,0.08), transparent 70%)"
          }}
        />
        <Hourglass progress={progress} />
      </div>
    </div>
  );
}
