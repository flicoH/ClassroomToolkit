/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 *  其他任何个人、公司不得使用、复制、传播、修改或商业使用。
 * **********************************************************************************************
 * @Date: 2026-04-18 23:42:49
 * @LastEditors: flicoH
 * @LastEditTime: 2026-04-19 02:08:47
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center backdrop-blur-xs">{children}</div>;
}
