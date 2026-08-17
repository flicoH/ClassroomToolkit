/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 *  其他任何个人、公司不得使用、复制、传播、修改或商业使用。
 * **********************************************************************************************
 * @Date: 2026-04-21 00:25:14
 * @LastEditors: huangqinjia huangqinjia
 * @LastEditTime: 2026-04-21 17:41:42
 */
import { create } from "zustand";

export type WindowState = "normal" | "minimized" | "maximized";

export interface WindowItem {
  id: string;
  title: string;
  contentKey: string;
  state: WindowState;
  prevState: WindowState;
  position: { x: number; y: number };
  size: { w: number; h: number };
  zIndex: number;
}

interface OpenWindowOptions {
  /** 允许同一 contentKey 同时打开多个窗口，用于便签等多实例应用。 */
  allowMultiple?: boolean;
  state?: WindowState;
  prevState?: WindowState;
  size?: { w: number; h: number };
}

interface WindowStore {
  windows: WindowItem[];
  nextZIndex: number;
  openWindow: (title: string, contentKey: string, options?: OpenWindowOptions) => void;
  closeWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  maximizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  updatePosition: (id: string, x: number, y: number) => void;
  updateWindowState: (id: string, state: WindowState, prevState: WindowState) => void;
}

const DEFAULT_SIZE = { w: 580, h: 510 };
const OFFSET_STEP = 30;

/** 统一管理桌面窗口的创建、层级、状态和位置。 */
export const useWindowStore = create<WindowStore>()((set, get) => ({
  windows: [],
  nextZIndex: 10,

  openWindow: (title, contentKey, options) => {
    const { windows, nextZIndex } = get();
    // 默认同一个应用只打开一个窗口；再次点击时聚焦或恢复已有窗口。
    if (!options?.allowMultiple) {
      const existing = windows.find(w => w.contentKey === contentKey && w.state !== "minimized");
      if (existing) {
        get().focusWindow(existing.id);
        return;
      }

      const minimized = windows.find(w => w.contentKey === contentKey && w.state === "minimized");
      if (minimized) {
        get().restoreWindow(minimized.id);
        return;
      }
    }

    // 新窗口错位显示，避免多个普通窗口完全重叠。
    const offset = windows.filter(w => w.state !== "minimized").length * OFFSET_STEP;
    const newWindow: WindowItem = {
      id: `${contentKey}-${Date.now()}`,
      title,
      contentKey,
      state: options?.state ?? "maximized",
      prevState: options?.prevState ?? "normal",
      position: { x: 100 + offset, y: 60 + offset },
      size: options?.size ?? DEFAULT_SIZE,
      zIndex: nextZIndex
    };
    set({ windows: [...windows, newWindow], nextZIndex: nextZIndex + 1 });
  },

  closeWindow: id => {
    set(s => ({ windows: s.windows.filter(w => w.id !== id) }));
  },

  minimizeWindow: id => {
    set(s => ({
      windows: s.windows.map(w => (w.id === id ? { ...w, prevState: w.state, state: "minimized" as WindowState } : w))
    }));
  },

  maximizeWindow: id => {
    set(s => ({
      windows: s.windows.map(w => (w.id === id ? { ...w, prevState: w.state, state: "maximized" as WindowState } : w))
    }));
  },

  restoreWindow: id => {
    const { nextZIndex } = get();
    set(s => ({
      windows: s.windows.map(w =>
        w.id === id
          ? {
              ...w,
              prevState: w.state,
              // 从最小化恢复时回到之前的正常/最大化状态。
              state: w.prevState === "minimized" ? ("normal" as WindowState) : w.prevState,
              zIndex: nextZIndex
            }
          : w
      ),
      nextZIndex: nextZIndex + 1
    }));
  },

  focusWindow: id => {
    const { nextZIndex } = get();
    set(s => ({
      windows: s.windows.map(w => (w.id === id ? { ...w, zIndex: nextZIndex } : w)),
      nextZIndex: nextZIndex + 1
    }));
  },

  updatePosition: (id, x, y) => {
    set(s => ({
      windows: s.windows.map(w => (w.id === id ? { ...w, position: { x, y } } : w))
    }));
  },

  updateWindowState: (id, state, prevState) => {
    set(s => ({
      windows: s.windows.map(w => (w.id === id ? { ...w, state, prevState } : w))
    }));
  }
}));
