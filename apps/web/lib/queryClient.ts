/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 *  其他任何个人、公司不得使用、复制、传播、修改或商业使用。
 * **********************************************************************************************
 * @Date: 2026-04-18 23:50:30
 * @LastEditors: flicoH
 * @LastEditTime: 2026-04-18 23:52:20
 */
import { QueryClient } from "@tanstack/react-query";

/** React Query 全局客户端，统一控制缓存时长、窗口聚焦刷新和重试次数。 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 60,
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});
