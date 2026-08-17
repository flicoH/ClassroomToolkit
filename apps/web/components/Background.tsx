/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 *  其他任何个人、公司不得使用、复制、传播、修改或商业使用。
 * **********************************************************************************************
 * @Date: 2026-04-19 01:33:24
 * @LastEditors: flicoH
 * @LastEditTime: 2026-04-19 01:48:53
 */
"use client";

import { useEffect, useState } from "react";

const backgrounds = ["/bg1.jpg", "/bg2.jpg", "/bg3.jpg", "/bg4.jpg", "/bg5.jpg"];

/** 桌面背景图，加载时随机选一张本地图片。 */
export function Background() {
  const [bg, setBg] = useState(backgrounds[0]!);

  useEffect(() => {
    const random = backgrounds[Math.floor(Math.random() * backgrounds.length)] ?? backgrounds[0]!;
    setBg(random);
  }, []);

  return (
    <div
      className={`fixed inset-0 w-full h-full -z-10 bg-cover bg-center bg-no-repeat`}
      style={{ backgroundImage: `url(${bg})` }}
    />
  );
}
