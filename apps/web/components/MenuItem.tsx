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

import type { ComponentType, SVGProps } from "react";

export interface MenuItemData {
  name: string;
  /** 图标统一使用 SVG 组件，方便自定义卡通图标和 lucide 图标混用。 */
  icon: ComponentType<SVGProps<SVGSVGElement>>;
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
      className="flex aspect-square w-full min-w-0 max-w-[92px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-white/30 bg-white/20 p-2 backdrop-blur-md transition-all hover:bg-white/30 active:scale-95 dark:border-white/10 dark:bg-black/20 dark:hover:bg-black/30 sm:h-[85px] sm:w-[85px]"
      onClick={() => onClick?.(data.contentKey)}
    >
      <Icon className="h-8 w-8 drop-shadow-md sm:h-9 sm:w-9" />
      <span className="max-w-full truncate text-xs font-medium text-white drop-shadow-md">{data.name}</span>
    </button>
  );
}
