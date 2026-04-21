/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 *  其他任何个人、公司不得使用、复制、传播或修改或商业使用。
 * **********************************************************************************************
 */
"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Lock, LogOut, SwitchCamera } from "lucide-react";

interface UserPanelProps {
  open: boolean;
  onClose: () => void;
}

export function UserPanel({ open, onClose }: UserPanelProps) {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onClose]);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) {
      document.addEventListener("keydown", handleEsc);
    }
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  const handleLogout = () => {
    logout();
    onClose();
    router.push("/login");
  };

  const handleSwitchAccount = () => {
    logout();
    onClose();
    router.push("/login");
  };

  const handleLock = () => {
    onClose();
    router.push("/login");
  };

  return (
    <div
      ref={panelRef}
      className={`absolute bottom-12 left-4 z-50 w-64 rounded-xl border bg-white/90 dark:bg-slate-900/90 backdrop-blur-md shadow-xl transition-all duration-200 origin-bottom-left ${
        open ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none"
      }`}
    >
      {/* User Info */}
      <div className="flex items-center gap-3 p-4 border-b">
        <Avatar className="h-12 w-12">
          <AvatarImage src={user?.avatar} />
          <AvatarFallback className="text-lg">{user?.name?.[0] || "?"}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{user?.name || "未登录"}</p>
          <p className="text-xs text-muted-foreground truncate">{user?.email || ""}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="p-2">
        <button
          onClick={handleLock}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm hover:bg-accent transition-colors"
        >
          <Lock className="h-4 w-4 text-muted-foreground" />
          <span>锁定</span>
        </button>
        <button
          onClick={handleSwitchAccount}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm hover:bg-accent transition-colors"
        >
          <SwitchCamera className="h-4 w-4 text-muted-foreground" />
          <span>切换账号</span>
        </button>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm hover:bg-accent text-destructive transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span>退出账号</span>
        </button>
      </div>
    </div>
  );
}
