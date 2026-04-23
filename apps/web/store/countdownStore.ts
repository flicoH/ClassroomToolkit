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

    const parsed = JSON.parse(saved);
    if (!parsed.isRunning || !parsed.startTime) {
      return {
        totalSeconds: parsed.totalSeconds || DEFAULT_TIME,
        remainingSeconds: parsed.remainingSeconds || DEFAULT_TIME,
        isRunning: false,
        startTime: null
      };
    }

    const elapsed = Math.floor((Date.now() - parsed.startTime) / 1000);
    const newRemaining = Math.max(0, parsed.remainingSeconds - elapsed);

    return {
      totalSeconds: parsed.totalSeconds,
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
    // ignore
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
    if (remainingSeconds <= 0) {
      newState.isRunning = false;
      newState.startTime = null;
    }
    set(newState);
    saveState(newState);
  },

  setIsRunning: isRunning => {
    const state = get();
    const newState: CountdownState = {
      ...state,
      isRunning,
      startTime: isRunning ? Date.now() : null
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
