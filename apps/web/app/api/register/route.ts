/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 * **********************************************************************************************
 */
import { NextResponse } from "next/server";
import { setAuthCookie } from "../auth-cookie";

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:3000";

/** 注册接口代理到 Nest 教师认证模块，由后端创建账号并返回登录态。 */
export async function POST(request: Request) {
  try {
    const { username, password, name, email } = await request.json();
    const response = await fetch(`${BACKEND_URL}/auth/teacher/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password, name, email })
    });

    const data = await response.json().catch(() => ({ message: "注册服务响应异常" }));
    if (!response.ok) {
      return NextResponse.json({ message: data.message || "注册失败" }, { status: response.status });
    }

    const { token, ...profile } = data;
    if (!token) return NextResponse.json({ message: "注册服务未返回会话" }, { status: 502 });
    const result = NextResponse.json(profile, { status: 200 });
    setAuthCookie(result, token, request);
    return result;
  } catch {
    return NextResponse.json({ message: "服务器内部错误" }, { status: 500 });
  }
}
