/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 * **********************************************************************************************
 */
import { create } from "zustand";

interface RequestLoadingStore {
  pendingCount: number;
  startRequest: () => void;
  endRequest: () => void;
}

/** 统计全局接口请求数量，支持多个并发请求同时存在。 */
export const useRequestLoadingStore = create<RequestLoadingStore>()(set => ({
  pendingCount: 0,
  startRequest: () => set(state => ({ pendingCount: state.pendingCount + 1 })),
  endRequest: () => set(state => ({ pendingCount: Math.max(0, state.pendingCount - 1) }))
}));
