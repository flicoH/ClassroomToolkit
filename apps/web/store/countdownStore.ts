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
import request from "@/lib/request";

interface CountdownState {
  totalSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
  startTime: number | null;
}

const DEFAULT_TIME = 300;

interface CountdownApiState {
  id: string;
  totalSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
  updatedAt: string;
}

function getDefaultState(): CountdownState {
  return {
    totalSeconds: DEFAULT_TIME,
    remainingSeconds: DEFAULT_TIME,
    isRunning: false,
    startTime: null
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

function saveState(state: CountdownState) {
  void request<CountdownApiState, CountdownApiState>({
    url: "/api/countdown",
    method: "PATCH",
    data: {
      totalSeconds: state.totalSeconds,
      remainingSeconds: state.remainingSeconds,
      isRunning: state.isRunning
    }
  });
}

interface CountdownStore extends CountdownState {
  setTotalSeconds: (seconds: number) => void;
  setRemainingSeconds: (seconds: number) => void;
  setIsRunning: (running: boolean) => void;
  reset: () => void;
  init: () => void;
}

const initialState = getDefaultState();

export const useCountdownStore = create<CountdownStore>((set, get) => ({
  ...initialState,

  init: () => {
    void request<CountdownApiState, CountdownApiState>("/api/countdown").then(state => {
      set(normalizeApiState(state));
    });
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
