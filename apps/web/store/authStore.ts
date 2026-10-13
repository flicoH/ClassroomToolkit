/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 *  其他任何个人、公司不得使用、复制、传播、修改或商业使用。
 * **********************************************************************************************
 * @Date: 2026-04-18 23:59:19
 * @LastEditors: flicoH
 * @LastEditTime: 2026-04-18 23:59:20
 */
import { queryClient } from "@/lib/queryClient";
import { resetRequestCache } from "@/lib/request";
import { useWindowStore } from "./windowStore";
import { useCountdownStore } from "./countdownStore";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { User } from "@/types";
import { cookieStorage } from "@/lib/cookie";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => Promise<void>;
}

/** 登录态集中存储，同时通过 persist 写入 localStorage，刷新后可恢复用户信息。 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: true,
      setUser: user => {
        if (get().user?.id !== user?.id || get().user?.ownerAccountId !== user?.ownerAccountId) {
          resetRequestCache();
          queryClient.clear();
          useWindowStore.setState({ windows: [], nextZIndex: 10 });
          useCountdownStore.setState({ totalSeconds: 300, remainingSeconds: 300, isRunning: false, startTime: null });
        }
        set({ user });
      },
      setLoading: loading => set({ isLoading: loading }),
      logout: async () => {
        try {
          await fetch("/api/logout", { method: "POST" });
        } finally {
          cookieStorage.clearAll();
          get().setUser(null);
        }
      }
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({ user: state.user }),
      onRehydrateStorage: () => state => {
        state?.setLoading(false);
      }
    }
  )
);
