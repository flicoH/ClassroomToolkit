/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 *  其他任何个人、公司不得使用、复制、传播、修改或商业使用。
 * **********************************************************************************************
 * @Date: 2026-04-21 17:30:00
 * @LastEditors: flicoH
 * @LastEditTime: 2026-04-21 17:30:00
 */
import { create } from "zustand";

interface CountdownState {
  totalSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
  startTime: number | null;
}

const STORAGE_KEY = "countdown_state";
const DEFAULT_TIME = 300;

/** 读取本地倒计时状态，并根据离开页面期间流逝的时间重新计算剩余秒数。 */
function loadState(): CountdownState {
  if (typeof window === "undefined") {
    return {
      totalSeconds: DEFAULT_TIME,
      remainingSeconds: DEFAULT_TIME,
      isRunning: false,
      startTime: null
    };
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return {
        totalSeconds: DEFAULT_TIME,
        remainingSeconds: DEFAULT_TIME,
        isRunning: false,
        startTime: null
      };
    }

    const parsed = JSON.parse(saved) as Partial<CountdownState>;
    const totalSeconds = Math.max(1, Number(parsed.totalSeconds) || DEFAULT_TIME);
    const remainingSeconds = Math.min(totalSeconds, Math.max(0, Number(parsed.remainingSeconds) || 0));
    if (!parsed.isRunning || !parsed.startTime) {
      return {
        totalSeconds,
        remainingSeconds,
        isRunning: false,
        startTime: null
      };
    }

    const elapsed = Math.floor((Date.now() - parsed.startTime) / 1000);
    // startTime 已包含暂停前的进度，因此直接用总时长计算，避免刷新时重复扣减。
    const newRemaining = Math.max(0, totalSeconds - elapsed);

    return {
      totalSeconds,
      remainingSeconds: newRemaining,
      isRunning: newRemaining > 0,
      startTime: newRemaining > 0 ? parsed.startTime : null
    };
  } catch {
    return {
      totalSeconds: DEFAULT_TIME,
      remainingSeconds: DEFAULT_TIME,
      isRunning: false,
      startTime: null
    };
  }
}

function saveState(state: CountdownState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage 不可用时不阻断倒计时本身。
  }
}

interface CountdownStore extends CountdownState {
  setTotalSeconds: (seconds: number) => void;
  setRemainingSeconds: (seconds: number) => void;
  setIsRunning: (running: boolean) => void;
  reset: () => void;
  init: () => void;
}

const initialState = loadState();

export const useCountdownStore = create<CountdownStore>((set, get) => ({
  ...initialState,

  init: () => {
    const state = loadState();
    set(state);
  },

  setTotalSeconds: seconds => {
    set({ totalSeconds: seconds });
    saveState({ ...get(), totalSeconds: seconds });
  },

  setRemainingSeconds: remainingSeconds => {
    const state = get();
    const newState = { ...state, remainingSeconds };
    // 到 0 后自动停止，避免刷新后继续按旧 startTime 计算。
    if (remainingSeconds <= 0) {
      newState.isRunning = false;
      newState.startTime = null;
    }
    set(newState);
    saveState(newState);
  },

  setIsRunning: isRunning => {
    const state = get();
    const elapsedBeforeResume = Math.max(0, state.totalSeconds - state.remainingSeconds);
    const newState: CountdownState = {
      ...state,
      isRunning,
      // 恢复计时时把暂停前的进度折算进 startTime，继续走剩余时长。
      startTime: isRunning ? Date.now() - elapsedBeforeResume * 1000 : null
    };
    set(newState);
    saveState(newState);
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
    saveState(newState);
  }
}));
