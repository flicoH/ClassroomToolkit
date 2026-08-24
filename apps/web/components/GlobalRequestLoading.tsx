/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 * **********************************************************************************************
 */
"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useRequestLoadingStore } from "@/store/requestLoadingStore";
import { cn } from "@/lib/utils";

/** 全局接口请求 loading，短请求延迟显示以减少闪烁。 */
export function GlobalRequestLoading() {
  const pendingCount = useRequestLoadingStore(state => state.pendingCount);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (pendingCount <= 0) {
      setVisible(false);
      return;
    }

    const timer = window.setTimeout(() => setVisible(true), 180);
    return () => window.clearTimeout(timer);
  }, [pendingCount]);

  return (
    <div
      className={cn(
        "pointer-events-none fixed left-0 right-0 top-0 z-[10000] transition-opacity duration-200",
        visible ? "opacity-100" : "opacity-0"
      )}
      aria-live="polite"
      aria-hidden={!visible}
    >
      <div className="h-1 overflow-hidden bg-blue-100/80 dark:bg-blue-950/50">
        <div className="h-full w-1/3 animate-[global-loading_1s_ease-in-out_infinite] bg-blue-600 shadow-[0_0_16px_rgba(37,99,235,0.55)]" />
      </div>
      <div className="mx-auto mt-2 flex w-fit items-center gap-2 rounded-full border border-blue-100 bg-white/95 px-3 py-1.5 text-xs font-bold text-blue-700 shadow-lg shadow-slate-300/30 dark:border-blue-900 dark:bg-slate-900/95 dark:text-blue-300">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        正在加载
      </div>
    </div>
  );
}
