/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 *  其他任何个人、公司不得使用、复制、传播、修改或商业使用。
 * **********************************************************************************************
 * @Date: 2026-04-19 00:30:00
 * @LastEditors: flicoH
 * @LastEditTime: 2026-04-19 00:30:00
 */
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    // 简单的模拟登录验证
    // TODO: 替换为真实的认证逻辑
    if (username && password) {
      return NextResponse.json(
        {
          id: "1",
          name: username,
          email: `${username}@example.com`,
          avatar: ""
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ message: "用户名或密码错误" }, { status: 401 });
  } catch {
    return NextResponse.json({ message: "服务器内部错误" }, { status: 500 });
  }
}
