/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 *  其他任何个人、公司不得使用、复制、传播、修改或商业使用。
 * **********************************************************************************************
 * @Date: 2026-04-21 00:25:14
 * @LastEditors: flicoH
 * @LastEditTime: 2026-04-21 00:25:15
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

interface WindowStore {
  windows: WindowItem[];
  nextZIndex: number;
  openWindow: (title: string, contentKey: string) => void;
  closeWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  maximizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  updatePosition: (id: string, x: number, y: number) => void;
}

const DEFAULT_SIZE = { w: 480, h: 400 };
const OFFSET_STEP = 30;

export const useWindowStore = create<WindowStore>()((set, get) => ({
  windows: [],
  nextZIndex: 10,

  openWindow: (title, contentKey) => {
    const { windows, nextZIndex } = get();
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

    const offset = windows.filter(w => w.state !== "minimized").length * OFFSET_STEP;
    const newWindow: WindowItem = {
      id: `${contentKey}-${Date.now()}`,
      title,
      contentKey,
      state: "normal",
      prevState: "normal",
      position: { x: 100 + offset, y: 60 + offset },
      size: DEFAULT_SIZE,
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
  }
}));
