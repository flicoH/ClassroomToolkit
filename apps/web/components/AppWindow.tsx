/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 *  其他任何个人、公司不得使用、复制、传播、修改或商业使用。
 * **********************************************************************************************
 * @Date: 2026-04-21 00:25:14
 * @LastEditors: flicoH
 * @LastEditTime: 2026-04-23 23:31:23
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
  // 全屏默认打开时，prevState 也设为 maximized，需要特殊处理
  const isDefaultMaximized = isMaximized && win.prevState === "maximized";

  /** 标题栏按下时记录拖拽起点，移动过程由全局 mousemove 接管。 */
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
    // 将移动/松开监听挂到 document，防止鼠标移出窗口后拖拽中断。
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const maxX = Math.max(8, globalThis.innerWidth - Math.min(win.size.w, globalThis.innerWidth - 16) - 8);
      const visibleHeight = Math.min(win.size.h, globalThis.innerHeight - 56);
      const maxY = Math.max(8, globalThis.innerHeight - 40 - visibleHeight - 8);
      updatePosition(
        win.id,
        Math.min(maxX, Math.max(8, dragRef.current.origX + dx)),
        Math.min(maxY, Math.max(8, dragRef.current.origY + dy))
      );
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
  }, [win.id, win.size.h, win.size.w, updatePosition]);

  useEffect(() => {
    if (isMaximized) return;
    const keepWindowVisible = () => {
      const visibleWidth = Math.min(win.size.w, globalThis.innerWidth - 16);
      const visibleHeight = Math.min(win.size.h, globalThis.innerHeight - 56);
      const maxX = Math.max(8, globalThis.innerWidth - visibleWidth - 8);
      const maxY = Math.max(8, globalThis.innerHeight - 40 - visibleHeight - 8);
      const x = Math.min(maxX, Math.max(8, win.position.x));
      const y = Math.min(maxY, Math.max(8, win.position.y));
      if (x !== win.position.x || y !== win.position.y) updatePosition(win.id, x, y);
    };
    keepWindowVisible();
    globalThis.addEventListener("resize", keepWindowVisible);
    return () => globalThis.removeEventListener("resize", keepWindowVisible);
  }, [isMaximized, updatePosition, win.id, win.position.x, win.position.y, win.size.h, win.size.w]);

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
              width: `min(${win.size.w}px, calc(100% - 16px))`,
              height: `min(${win.size.h}px, calc(100% - 56px))`,
              zIndex: win.zIndex
            }
      }
      onMouseDown={() => focusWindow(win.id)}
    >
      {/* 标题栏负责拖拽窗口，按钮点击会阻止事件冒泡避免触发拖拽。 */}
      <div
        ref={headerRef}
        className="flex items-center justify-between h-9 px-3 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border-b border-white/20 dark:border-white/10 cursor-move select-none shrink-0"
        onMouseDown={handleMouseDown}
      >
        <span className="text-sm font-medium truncate">{win.title}</span>
        <div className="flex items-center gap-1">
          {/* Minimize */}
          <button
            aria-label={`最小化${win.title}`}
            title="最小化"
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
            aria-label={`${isMaximized ? "还原" : "最大化"}${win.title}`}
            title={isMaximized ? "还原" : "最大化"}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            onClick={e => {
              e.stopPropagation();
              if (isDefaultMaximized) {
                // 默认全屏 -> 恢复正常大小
                useWindowStore.getState().updateWindowState(win.id, "normal", "normal");
              } else if (isMaximized) {
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
            aria-label={`关闭${win.title}`}
            title="关闭"
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

      {/* 具体应用内容由父组件传入，窗口只关心外壳能力。 */}
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}
