/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 *  其他任何个人、公司不得使用、复制、传播、修改此代码。
 * **********************************************************************************************
 * @Date: 2026-04-18 21:28:36
 * @LastEditors: flicoH
 * @LastEditTime: 2026-04-21 23:12:59
 */
"use client";

import { useState } from "react";
import { useWindowStore } from "@/store/windowStore";
import { UserPanel } from "@/components/UserPanel";
import { MenuBox } from "@/components/MenuBox";
import { AppWindow } from "@/components/AppWindow";
import { Taskbar } from "@/components/Taskbar";
import { CountdownTimer } from "@/components/CountdownTimer";
import { ClipboardList, GraduationCap, Timer, Users } from "lucide-react";
import { type MenuItemData } from "@/components/MenuItem";
import { Countdown } from "@/components/apps/Countdown";
import { StudentManagement } from "@/components/apps/StudentManagement";
import { TaskStats } from "@/components/apps/TaskStats";

const menuItems: MenuItemData[] = [
  { name: "倒计时", icon: Timer, contentKey: "countdown" },
  { name: "任务统计", icon: ClipboardList, contentKey: "taskStats" },
  { name: "学生管理", icon: Users, contentKey: "studentManagement" },
  { name: "倒计时", icon: Timer, contentKey: "countdown3" },
  { name: "倒计时", icon: Timer, contentKey: "countdown4" },
  { name: "倒计时", icon: Timer, contentKey: "countdown5" },
  { name: "倒计时", icon: Timer, contentKey: "countdown6" },
  { name: "倒计时", icon: Timer, contentKey: "countdown7" },
  { name: "倒计时", icon: Timer, contentKey: "countdown8" },
  { name: "倒计时", icon: Timer, contentKey: "countdown9" }
];

/** 根据 contentKey 渲染弹窗内容 */
function WindowContent({ contentKey }: { contentKey: string }) {
  switch (contentKey) {
    case "countdown":
      return <CountdownTimer />;
    case "taskStats":
      return <TaskStats />;
    case "studentManagement":
      return <StudentManagement />;
    case "countdown3":
      return <Countdown />;
    default:
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <p className="text-muted-foreground mb-4">倒计时功能开发中...</p>
        </div>
      );
  }
}

export default function Home() {
  const { windows, openWindow } = useWindowStore();
  const [panelOpen, setPanelOpen] = useState(false);

  const handleMenuClick = (contentKey: string) => {
    const item = menuItems.find(m => m.contentKey === contentKey);
    openWindow(item?.name || contentKey, contentKey);
  };

  return (
    <div className="fixed inset-0 flex flex-col">
      {/* Function Menu Area */}
      <div className="absolute top-10 left-0 flex-1 flex items-end px-6 pb-4">
        <MenuBox items={menuItems} onItemClick={handleMenuClick} />
      </div>

      {/* Windows Layer */}
      {windows.map(win => (
        <AppWindow key={win.id} window={win}>
          <WindowContent contentKey={win.contentKey} />
        </AppWindow>
      ))}

      {/* Minimized Taskbar */}
      <Taskbar />

      {/* Bottom Bar - always visible */}
      <div className="w-full h-10 bg-white dark:bg-slate-900/80 backdrop-blur-md border-t flex items-center px-4 absolute z-40 bottom-0">
        <button
          onClick={() => setPanelOpen(!panelOpen)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-accent transition-colors text-sm"
        >
          <GraduationCap className="h-4 w-4" />
          <span>开始</span>
        </button>
      </div>

      {/* User Panel */}
      <UserPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </div>
  );
}
