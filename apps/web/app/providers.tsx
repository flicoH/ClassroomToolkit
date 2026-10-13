/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 *  其他任何个人、公司不得使用、复制、传播、修改或商业使用。
 * **********************************************************************************************
 */
"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "react-hot-toast";
import { GlobalRequestLoading } from "@/components/GlobalRequestLoading";
// import { isProduction } from "@/lib/utils"

/** 全局客户端 Provider：React Query、开发工具和 toast 都在这里统一挂载。 */
export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let active = true;
    // 本地缓存只供展示，启动时和重新聚焦时取得服务器的最新身份与权限。
    async function refreshIdentity() {
      const accountId = useAuthStore.getState().user?.id;
      if (!accountId) return;
      try {
        const result = await fetch("/api/teacher-session/me", { cache: "no-store" });
        if (!active || useAuthStore.getState().user?.id !== accountId) return;
        if (result.ok) useAuthStore.getState().setUser(await result.json());
        else if (result.status === 401) {
          await useAuthStore.getState().logout();
          window.location.href = "/login";
        }
      } catch {
        /* 连接恢复后可重新获取；业务请求仍由服务端鉴权。 */
      }
    }
    void refreshIdentity();
    window.addEventListener("focus", refreshIdentity);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshIdentity);
    };
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <GlobalRequestLoading />
      {process.env.NODE_ENV !== "production" && <ReactQueryDevtools initialIsOpen={false} />}
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}
