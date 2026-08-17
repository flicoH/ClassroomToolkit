/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 *  其他任何个人、公司不得使用、复制、传播、修改或商业使用。
 * **********************************************************************************************
 * @Date: 2026-04-21 00:25:14
 * @LastEditors: huangqinjia huangqinjia
 * @LastEditTime: 2026-04-21 19:15:45
 */
"use client";

import { MenuItem, type MenuItemData } from "@/components/MenuItem";

interface MenuBoxProps {
  items: MenuItemData[];
  onItemClick?: (contentKey: string) => void;
}

/** 桌面应用图标容器，负责把菜单数据渲染成可点击的图标矩阵。 */
export function MenuBox({ items, onItemClick }: MenuBoxProps) {
  return (
    <div className="flex flex-col flex-wrap gap-4 h-[calc(100vh-16rem)]">
      {items.map(item => (
        <MenuItem key={item.contentKey} data={item} onClick={onItemClick} />
      ))}
    </div>
  );
}
