/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 *  其他任何个人、公司不得使用、复制、传播、修改或商业使用。
 * **********************************************************************************************
 * @Date: 2026-04-21 00:30:00
 * @LastEditors: huangqinjia huangqinjia
 * @LastEditTime: 2026-04-21 17:22:52
 */
"use client";

import { useState } from "react";
import { useEffect, useRef } from "react";
import { useCountdownStore } from "@/store/countdownStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Play, Pause, Square, RotateCcw, Clock } from "lucide-react";

const PRESET_TIMES = [
  { label: "1分钟", seconds: 60 },
  { label: "3分钟", seconds: 180 },
  { label: "5分钟", seconds: 300 },
  { label: "10分钟", seconds: 600 },
  { label: "15分钟", seconds: 900 }
];

/** 旧版倒计时组件，复用 countdownStore 保存运行状态和剩余时间。 */
export function Countdown() {
  const { totalSeconds, remainingSeconds, isRunning, init, setTotalSeconds, setRemainingSeconds, setIsRunning } =
    useCountdownStore();

  const [inputHours, setInputHours] = useState("0");
  const [inputMinutes, setInputMinutes] = useState("5");
  const [inputSeconds, setInputSeconds] = useState("0");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // 组件挂载时从 localStorage 恢复倒计时状态。
    init();
  }, [init]);

  useEffect(() => {
    // 每次运行状态变化都重建 interval，避免多个定时器并行扣秒。
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (isRunning && remainingSeconds > 0) {
      timerRef.current = setInterval(() => {
        const currentRemaining = useCountdownStore.getState().remainingSeconds;
        if (currentRemaining <= 1) {
          setRemainingSeconds(0);
          setIsRunning(false);
        } else {
          setRemainingSeconds(currentRemaining - 1);
        }
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRunning, setRemainingSeconds, setIsRunning]);

  /** 将秒数格式化成 mm:ss 或 h:mm:ss。 */
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  /** 运行中不允许改预设，防止总时长和剩余时间不同步。 */
  const handlePresetClick = (seconds: number) => {
    if (isRunning) return;
    setTotalSeconds(seconds);
    setRemainingSeconds(seconds);
  };

  const handleStart = () => {
    if (remainingSeconds <= 0) return;
    setIsRunning(true);
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  const handleStop = () => {
    setIsRunning(false);
    setRemainingSeconds(totalSeconds);
  };

  const handleReset = () => {
    setIsRunning(false);
    setRemainingSeconds(totalSeconds);
  };

  const handleCustomTime = () => {
    if (isRunning) return;
    const hours = parseInt(inputHours, 10) || 0;
    const mins = parseInt(inputMinutes, 10) || 0;
    const secs = parseInt(inputSeconds, 10) || 0;
    const total = hours * 3600 + mins * 60 + secs;
    if (total <= 0) return;
    setTotalSeconds(total);
    setRemainingSeconds(total);
  };

  const progress = totalSeconds > 0 ? (remainingSeconds / totalSeconds) * 100 : 0;
  const isFinished = remainingSeconds === 0;

  return (
    <div className="flex flex-col items-center justify-center h-full p-3">
      {/* 圆形倒计时显示 */}
      <div className="relative aspect-square w-full max-w-[35vh]">
        <svg
          className="absolute inset-0 w-full h-full transform -rotate-90"
          viewBox="0 0 200 200"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* 背景圆圈 */}
          <circle
            cx="100"
            cy="100"
            r="90"
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
            className="text-slate-200 dark:text-slate-700"
          />
          {/* 进度圆圈 */}
          <circle
            cx="100"
            cy="100"
            r="90"
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 90}
            strokeDashoffset={2 * Math.PI * 90 * (1 - progress / 100)}
            className={`transition-all duration-1000 ${
              isFinished ? "text-red-500" : progress <= 20 ? "text-orange-500" : "text-emerald-500"
            }`}
          />
        </svg>
        {/* 时间显示 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {isFinished ? (
            <span className="text-[8vmin] font-bold text-red-500 animate-pulse leading-none">时间到!</span>
          ) : (
            <>
              <span
                className={`text-[8vmin] font-bold tabular-nums leading-none ${isRunning ? "text-emerald-500" : "text-slate-600 dark:text-slate-300"}`}
              >
                {formatTime(remainingSeconds)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* 控制按钮 */}
      <div className="flex gap-2 flex-wrap justify-center">
        {!isRunning ? (
          <Button size="sm" onClick={handleStart} disabled={remainingSeconds <= 0} className="gap-1">
            <Play className="w-4 h-4" />
            开始
          </Button>
        ) : (
          <Button size="sm" onClick={handlePause} variant="secondary" className="gap-1">
            <Pause className="w-4 h-4" />
            暂停
          </Button>
        )}
        <Button size="sm" onClick={handleStop} variant="outline" className="gap-1">
          <Square className="w-4 h-4" />
          停止
        </Button>
        <Button size="sm" onClick={handleReset} variant="ghost" className="gap-1">
          <RotateCcw className="w-4 h-4" />
          重置
        </Button>
      </div>

      {/* 预设时间 */}
      <div className="w-full">
        <div className="flex items-center justify-center gap-2 mt-2 mb-2 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>预设时间</span>
        </div>
        <div className="flex flex-wrap justify-center gap-1">
          {PRESET_TIMES.map(preset => (
            <button
              key={preset.seconds}
              onClick={() => handlePresetClick(preset.seconds)}
              disabled={isRunning}
              className={`px-2 py-1 rounded-full text-xs font-medium transition-all ${
                isRunning
                  ? "opacity-50 cursor-not-allowed"
                  : totalSeconds === preset.seconds
                    ? "bg-emerald-500 text-white"
                    : "bg-slate-100 dark:bg-slate-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/30"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* 自定义时间 */}
        <div className="flex items-center justify-center gap-1 mt-2 flex-wrap">
          <Input
            type="number"
            min="0"
            max="99"
            value={inputHours}
            onChange={e => {
              const val = Math.min(99, Math.max(0, parseInt(e.target.value, 10) || 0));
              setInputHours(String(val));
            }}
            disabled={isRunning}
            className="w-16 text-center text-sm py-1"
            placeholder="00"
          />
          <span className="text-xs text-muted-foreground">时</span>
          <Input
            type="number"
            min="0"
            max="59"
            value={inputMinutes}
            onChange={e => {
              const val = Math.min(59, Math.max(0, parseInt(e.target.value, 10) || 0));
              setInputMinutes(String(val));
            }}
            disabled={isRunning}
            className="w-16 text-center text-sm py-1"
            placeholder="00"
          />
          <span className="text-xs text-muted-foreground">分</span>
          <Input
            type="number"
            min="0"
            max="59"
            value={inputSeconds}
            onChange={e => {
              const val = Math.min(59, Math.max(0, parseInt(e.target.value, 10) || 0));
              setInputSeconds(String(val));
            }}
            disabled={isRunning}
            className="w-16 text-center text-sm py-1"
            placeholder="00"
          />
          <span className="text-xs text-muted-foreground">秒</span>
          <Button
            onClick={handleCustomTime}
            disabled={isRunning}
            variant="secondary"
            size="sm"
            className="text-xs py-1 px-2"
          >
            设置
          </Button>
        </div>
      </div>
    </div>
  );
}
