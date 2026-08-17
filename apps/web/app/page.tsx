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
import { GraduationCap } from "lucide-react";
import { type MenuItemData } from "@/components/MenuItem";
import { RandomPicker } from "@/components/apps/RandomPicker";
import { PetPoints } from "@/components/apps/PetPoints";
import { SeatingChart } from "@/components/apps/SeatingChart";
import { StickyNoteQuick, StickyNotes } from "@/components/apps/StickyNotes";
import { StudentManagement } from "@/components/apps/StudentManagement";
import { TaskStats } from "@/components/apps/TaskStats";
import {
  CartoonCountdownIcon,
  CartoonPetPointsIcon,
  CartoonRandomPickerIcon,
  CartoonSeatingIcon,
  CartoonStickyNoteIcon,
  CartoonStudentsIcon,
  CartoonTaskStatsIcon
} from "@/components/icons/CartoonAppIcons";

const menuItems: MenuItemData[] = [
  { name: "倒计时", icon: CartoonCountdownIcon, contentKey: "countdown" },
  { name: "随机点名", icon: CartoonRandomPickerIcon, contentKey: "randomPicker" },
  { name: "学生管理", icon: CartoonStudentsIcon, contentKey: "studentManagement" },
  { name: "任务统计", icon: CartoonTaskStatsIcon, contentKey: "taskStats" },
  { name: "座位表", icon: CartoonSeatingIcon, contentKey: "seatingChart" },
  { name: "宠物积分", icon: CartoonPetPointsIcon, contentKey: "petPoints" },
  { name: "便签", icon: CartoonStickyNoteIcon, contentKey: "stickyNotes" }
];

/** 桌面窗口内容路由：菜单只保存 contentKey，实际组件在这里集中映射。 */
function WindowContent({ contentKey }: { contentKey: string }) {
  switch (contentKey) {
    case "countdown":
      return <CountdownTimer />;
    case "randomPicker":
      return <RandomPicker />;
    case "taskStats":
      return <TaskStats />;
    case "seatingChart":
      return <SeatingChart />;
    case "petPoints":
      return <PetPoints />;
    case "stickyNotesList":
      return <StickyNotes />;
    case "studentManagement":
      return <StudentManagement />;
    default:
      if (contentKey.startsWith("stickyNoteQuick")) {
        return <StickyNoteQuick />;
      }
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <p className="text-muted-foreground mb-4">该功能暂不可用</p>
        </div>
      );
  }
}

export default function Home() {
  const { windows, openWindow } = useWindowStore();
  const [panelOpen, setPanelOpen] = useState(false);

  /** 统一处理桌面图标点击；便签需要每次新开独立小窗，所以单独处理。 */
  const handleMenuClick = (contentKey: string) => {
    const item = menuItems.find(m => m.contentKey === contentKey);
    if (contentKey === "stickyNotes") {
      openWindow(item?.name || contentKey, `stickyNoteQuick-${Date.now()}`, {
        allowMultiple: true,
        state: "normal",
        prevState: "normal",
        size: { w: 360, h: 430 }
      });
      return;
    }
    openWindow(item?.name || contentKey, contentKey);
  };

  return (
    <div className="fixed inset-0 flex flex-col">
      {/* Function Menu Area */}
      <div className="absolute top-10 left-0 flex-1 flex items-end px-6 pb-4">
        <MenuBox items={menuItems} onItemClick={handleMenuClick} />
      </div>

      {/* 所有应用窗口都由 windowStore 驱动，保证层级、最小化、聚焦逻辑统一。 */}
      {windows.map(win => (
        <AppWindow key={win.id} window={win}>
          <WindowContent contentKey={win.contentKey} />
        </AppWindow>
      ))}

      {/* 最小化后的窗口入口。 */}
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
