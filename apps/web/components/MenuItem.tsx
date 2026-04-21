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

import type { LucideIcon } from "lucide-react";

export interface MenuItemData {
  name: string;
  icon: LucideIcon;
  contentKey: string;
}

interface MenuItemProps {
  data: MenuItemData;
  onClick?: (contentKey: string) => void;
}

export function MenuItem({ data, onClick }: MenuItemProps) {
  const Icon = data.icon;

  return (
    <button
      className="w-[85px] h-[85px] flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-white/20 dark:bg-black/20 backdrop-blur-md border border-white/30 dark:border-white/10 hover:bg-white/30 dark:hover:bg-black/30 active:scale-95 transition-all cursor-pointer"
      onClick={() => onClick?.(data.contentKey)}
    >
      <Icon className="h-8 w-8 text-white drop-shadow-md" />
      <span className="text-xs text-white font-medium drop-shadow-md">{data.name}</span>
    </button>
  );
}
