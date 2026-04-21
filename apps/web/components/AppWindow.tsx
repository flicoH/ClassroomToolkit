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

import { useRef, useCallback, useEffect, type ReactNode } from "react";
import { Minus, Square, X, Copy } from "lucide-react";
import { useWindowStore, type WindowItem } from "@/store/windowStore";

interface AppWindowProps {
  window: WindowItem;
  children: ReactNode;
}

export function AppWindow({ window: win, children }: AppWindowProps) {
  const { closeWindow, minimizeWindow, maximizeWindow, restoreWindow, focusWindow, updatePosition } = useWindowStore();
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const isMaximized = win.state === "maximized";
  const isMinimized = win.state === "minimized";

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isMaximized) return;
      e.preventDefault();
      focusWindow(win.id);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: win.position.x,
        origY: win.position.y
      };
    },
    [win.id, win.position, isMaximized, focusWindow]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      updatePosition(win.id, dragRef.current.origX + dx, dragRef.current.origY + dy);
    };
    const handleMouseUp = () => {
      dragRef.current = null;
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [win.id, updatePosition]);

  if (isMinimized) return null;

  return (
    <div
      className="absolute flex flex-col rounded-xl overflow-hidden shadow-2xl border border-white/20 dark:border-white/10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md"
      style={
        isMaximized
          ? { left: 0, top: 0, width: "100%", height: "calc(100% - 40px)", zIndex: win.zIndex }
          : {
              left: win.position.x,
              top: win.position.y,
              width: win.size.w,
              height: win.size.h,
              zIndex: win.zIndex
            }
      }
      onMouseDown={() => focusWindow(win.id)}
    >
      {/* Title Bar */}
      <div
        ref={headerRef}
        className="flex items-center justify-between h-9 px-3 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border-b border-white/20 dark:border-white/10 cursor-move select-none shrink-0"
        onMouseDown={handleMouseDown}
      >
        <span className="text-sm font-medium truncate">{win.title}</span>
        <div className="flex items-center gap-1">
          {/* Minimize */}
          <button
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            onClick={e => {
              e.stopPropagation();
              minimizeWindow(win.id);
            }}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          {/* Maximize / Restore */}
          <button
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            onClick={e => {
              e.stopPropagation();
              if (isMaximized) {
                restoreWindow(win.id);
              } else {
                maximizeWindow(win.id);
              }
            }}
          >
            {isMaximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3 w-3" />}
          </button>
          {/* Close */}
          <button
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-red-500 hover:text-white transition-colors"
            onClick={e => {
              e.stopPropagation();
              closeWindow(win.id);
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">{children}</div>
    </div>
  );
}
