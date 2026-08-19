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
import { setAuthCookie } from "../auth-cookie";

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:3000";

/** 登录接口代理到 Nest 教师认证模块，由后端完成真实密码校验。 */
export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();
    const response = await fetch(`${BACKEND_URL}/auth/teacher/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json().catch(() => ({ message: "登录服务响应异常" }));
    if (!response.ok) {
      return NextResponse.json({ message: data.message || "用户名或密码错误" }, { status: response.status });
    }

    const { token, ...profile } = data;
    if (!token) return NextResponse.json({ message: "登录服务未返回会话" }, { status: 502 });
    const result = NextResponse.json(profile, { status: 200 });
    setAuthCookie(result, token);
    return result;
  } catch {
    return NextResponse.json({ message: "服务器内部错误" }, { status: 500 });
  }
}
