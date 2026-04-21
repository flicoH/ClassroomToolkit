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

import { MenuItem, type MenuItemData } from "@/components/MenuItem";

interface MenuBoxProps {
  items: MenuItemData[];
  onItemClick?: (contentKey: string) => void;
}

export function MenuBox({ items, onItemClick }: MenuBoxProps) {
  return (
    <div className="flex flex-wrap gap-4">
      {items.map(item => (
        <MenuItem key={item.contentKey} data={item} onClick={onItemClick} />
      ))}
    </div>
  );
}
