/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 *  其他任何个人、公司不得使用、复制、传播、修改或商业使用。
 * **********************************************************************************************
 */
"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "react-hot-toast";
import { GlobalRequestLoading } from "@/components/GlobalRequestLoading";
// import { isProduction } from "@/lib/utils"

/** 全局客户端 Provider：React Query、开发工具和 toast 都在这里统一挂载。 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <GlobalRequestLoading />
      {process.env.NODE_ENV !== "production" && <ReactQueryDevtools initialIsOpen={false} />}
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}
