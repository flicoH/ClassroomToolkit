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
"use client";

import { useWindowStore } from "@/store/windowStore";

export function Taskbar() {
  const { windows, restoreWindow, closeWindow } = useWindowStore();
  // 任务栏只显示最小化窗口，普通/最大化窗口仍停留在桌面层。
  const minimizedWindows = windows.filter(w => w.state === "minimized");

  if (minimizedWindows.length === 0) return null;

  return (
    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[60] flex gap-1 px-2 py-1 rounded-t-lg bg-white/70 dark:bg-slate-800/70 backdrop-blur-md border border-b-0 border-white/30 dark:border-white/10">
      {minimizedWindows.map(win => (
        <button
          key={win.id}
          className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium hover:bg-black/10 dark:hover:bg-white/10 transition-colors max-w-[160px]"
          onClick={() => restoreWindow(win.id)}
        >
          <span className="truncate">{win.title}</span>
          <span
            className="shrink-0 w-4 h-4 flex items-center justify-center rounded hover:bg-red-400 hover:text-white"
            onClick={e => {
              e.stopPropagation();
              closeWindow(win.id);
            }}
          >
            ×
          </span>
        </button>
      ))}
    </div>
  );
}
