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
    <div className="absolute inset-x-2 bottom-10 z-[60] flex gap-1 overflow-x-auto rounded-t-lg border border-b-0 border-white/30 bg-white/70 px-2 py-1 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/70 sm:left-1/2 sm:right-auto sm:max-w-[calc(100vw-32px)] sm:-translate-x-1/2">
      {minimizedWindows.map(win => (
        <button
          key={win.id}
          className="flex max-w-[160px] shrink-0 items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors hover:bg-black/10 dark:hover:bg-white/10"
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
