/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 *  其他任何个人、公司不得使用、复制、传播、修改或商业使用。
 * **********************************************************************************************
 * @Date: 2026-04-21 17:30:00
 * @LastEditors: flicoH
 * @LastEditTime: 2026-11-05 12:20:00
 */
import { create } from "zustand";
import request from "@/lib/request";

export type TimerMode = "countdown" | "stopwatch";
export type StopwatchTheme = "rocket" | "sprout" | "balloon";
export type StopwatchTargetAction = "stop" | "continue";

export interface StopwatchLap {
  id: string;
  index: number;
  time: string;
  timestamp: number;
}

interface CountdownState {
  totalSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
  startTime: number | null;
}

interface StopwatchState {
  stopwatchElapsedSeconds: number;
  stopwatchTargetSeconds: number; // 0 表示自由计时无上限
  stopwatchIsRunning: boolean;
  stopwatchStartTime: number | null;
  stopwatchTargetAction: StopwatchTargetAction;
  stopwatchTheme: StopwatchTheme;
  stopwatchLaps: StopwatchLap[];
}

interface TimerStoreState extends CountdownState, StopwatchState {
  timerMode: TimerMode;
  soundEnabled: boolean;
}

const DEFAULT_TIME = 300;
const STOPWATCH_STORAGE_KEY = "classroom_stopwatch_state";

interface CountdownApiState {
  id: string;
  totalSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
  updatedAt: string;
}

function getDefaultState(): TimerStoreState {
  return {
    // 倒计时基础状态
    totalSeconds: DEFAULT_TIME,
    remainingSeconds: DEFAULT_TIME,
    isRunning: false,
    startTime: null,

    // 模式与全局声音
    timerMode: "countdown",
    soundEnabled: true,

    // 正计时儿童向状态
    stopwatchElapsedSeconds: 0,
    stopwatchTargetSeconds: 0, // 默认自由模式
    stopwatchIsRunning: false,
    stopwatchStartTime: null,
    stopwatchTargetAction: "stop",
    stopwatchTheme: "rocket",
    stopwatchLaps: []
  };
}

function normalizeApiState(state: CountdownApiState): CountdownState {
  const totalSeconds = Math.max(1, Number(state.totalSeconds) || DEFAULT_TIME);
  const remainingSeconds = Math.min(totalSeconds, Math.max(0, Number(state.remainingSeconds) || 0));
  if (!state.isRunning) return { totalSeconds, remainingSeconds, isRunning: false, startTime: null };

  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(state.updatedAt).getTime()) / 1000));
  const nextRemaining = Math.max(0, remainingSeconds - elapsed);
  return {
    totalSeconds,
    remainingSeconds: nextRemaining,
    isRunning: nextRemaining > 0,
    startTime: nextRemaining > 0 ? Date.now() - (totalSeconds - nextRemaining) * 1000 : null
  };
}

function saveCountdownApiState(state: CountdownState, started = false) {
  void request<CountdownApiState, CountdownApiState>({
    url: "/api/countdown",
    method: "PATCH",
    headers: started ? { "x-countdown-start": "1" } : undefined,
    data: {
      totalSeconds: state.totalSeconds,
      remainingSeconds: state.remainingSeconds,
      isRunning: state.isRunning
    }
  });
}

function loadLocalStopwatch(): Partial<StopwatchState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STOPWATCH_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<StopwatchState>;
    return {
      stopwatchTargetSeconds: Number(parsed.stopwatchTargetSeconds) || 0,
      stopwatchTargetAction: parsed.stopwatchTargetAction === "continue" ? "continue" : "stop",
      stopwatchTheme:
        parsed.stopwatchTheme === "sprout" || parsed.stopwatchTheme === "balloon" ? parsed.stopwatchTheme : "rocket"
    };
  } catch {
    return {};
  }
}

function saveLocalStopwatch(state: StopwatchState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      STOPWATCH_STORAGE_KEY,
      JSON.stringify({
        stopwatchTargetSeconds: state.stopwatchTargetSeconds,
        stopwatchTargetAction: state.stopwatchTargetAction,
        stopwatchTheme: state.stopwatchTheme
      })
    );
  } catch {
    // 忽略存储异常
  }
}

export interface CountdownStore extends TimerStoreState {
  // 模式与音频
  setTimerMode: (mode: TimerMode) => void;
  setSoundEnabled: (enabled: boolean) => void;
  toggleSound: () => void;

  // 倒计时原有接口保持 100% 兼容
  setTotalSeconds: (seconds: number) => void;
  setRemainingSeconds: (seconds: number) => void;
  setIsRunning: (running: boolean) => void;
  reset: () => void;
  init: () => void;

  // 正计时新增方法
  setStopwatchElapsedSeconds: (seconds: number) => void;
  setStopwatchTargetSeconds: (seconds: number) => void;
  setStopwatchTargetAction: (action: StopwatchTargetAction) => void;
  setStopwatchTheme: (theme: StopwatchTheme) => void;
  setStopwatchIsRunning: (running: boolean) => void;
  addStopwatchLap: () => void;
  clearStopwatchLaps: () => void;
  resetStopwatch: () => void;
}

const initialState = getDefaultState();

export const useCountdownStore = create<CountdownStore>((set, get) => ({
  ...initialState,
  ...loadLocalStopwatch(),

  init: () => {
    void request<CountdownApiState, CountdownApiState>("/api/countdown")
      .then(state => {
        set(normalizeApiState(state));
      })
      .catch(() => {
        // 请求失败时保留前端当前默认状态
      });
  },

  setTimerMode: mode => {
    set({ timerMode: mode });
  },

  setSoundEnabled: enabled => {
    set({ soundEnabled: enabled });
  },

  toggleSound: () => {
    set(s => ({ soundEnabled: !s.soundEnabled }));
  },

  // ====== 倒计时原方法 ======
  setTotalSeconds: seconds => {
    set({ totalSeconds: seconds });
    saveCountdownApiState({ ...get(), totalSeconds: seconds });
  },

  setRemainingSeconds: remainingSeconds => {
    const state = get();
    const newState = { ...state, remainingSeconds };
    if (remainingSeconds <= 0) {
      newState.isRunning = false;
      newState.startTime = null;
    }
    set(newState);
    saveCountdownApiState(newState);
  },

  setIsRunning: isRunning => {
    const state = get();
    const elapsedBeforeResume = Math.max(0, state.totalSeconds - state.remainingSeconds);
    const newState: CountdownState = {
      ...state,
      isRunning,
      startTime: isRunning ? Date.now() - elapsedBeforeResume * 1000 : null
    };
    set(newState);
    saveCountdownApiState(newState, isRunning && !state.isRunning);
  },

  reset: () => {
    const { totalSeconds } = get();
    const newState = {
      totalSeconds,
      remainingSeconds: totalSeconds,
      isRunning: false,
      startTime: null
    };
    set(newState);
    saveCountdownApiState(newState);
  },

  // ====== 正计时新增方法 ======
  setStopwatchElapsedSeconds: seconds => {
    set({ stopwatchElapsedSeconds: Math.max(0, seconds) });
  },

  setStopwatchTargetSeconds: seconds => {
    const safeSec = Math.max(0, seconds);
    set({ stopwatchTargetSeconds: safeSec });
    saveLocalStopwatch({ ...get(), stopwatchTargetSeconds: safeSec });
  },

  setStopwatchTargetAction: action => {
    set({ stopwatchTargetAction: action });
    saveLocalStopwatch({ ...get(), stopwatchTargetAction: action });
  },

  setStopwatchTheme: theme => {
    set({ stopwatchTheme: theme });
    saveLocalStopwatch({ ...get(), stopwatchTheme: theme });
  },

  setStopwatchIsRunning: running => {
    const state = get();
    const newState = {
      ...state,
      stopwatchIsRunning: running,
      stopwatchStartTime: running ? Date.now() - state.stopwatchElapsedSeconds * 1000 : null
    };
    set(newState);
  },

  addStopwatchLap: () => {
    const { stopwatchElapsedSeconds, stopwatchLaps } = get();
    const m = Math.floor(stopwatchElapsedSeconds / 60);
    const s = stopwatchElapsedSeconds % 60;
    const timeStr = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    const newLap: StopwatchLap = {
      id: `${Date.now()}-${stopwatchLaps.length + 1}`,
      index: stopwatchLaps.length + 1,
      time: timeStr,
      timestamp: Date.now()
    };
    set({ stopwatchLaps: [newLap, ...stopwatchLaps] });
  },

  clearStopwatchLaps: () => {
    set({ stopwatchLaps: [] });
  },

  resetStopwatch: () => {
    set({
      stopwatchElapsedSeconds: 0,
      stopwatchIsRunning: false,
      stopwatchStartTime: null,
      stopwatchLaps: []
    });
  }
}));
