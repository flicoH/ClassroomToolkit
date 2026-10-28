/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 *  其他任何个人、公司不得使用、复制、传播、修改或商业使用。
 * **********************************************************************************************
 * @Date: 2026-08-17 13:02:29
 * @LastEditors: flicoH
 * @LastEditTime: 2026-08-22 15:55:21
 */
/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 * **********************************************************************************************
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getBackendUrl } from "./backend-url";
import { AUTH_COOKIE_NAME, clearAuthCookie } from "./auth-cookie";

export interface ProxyRouteContext {
  params: Promise<{ path?: string[] }>;
}

export async function proxyBackendRequest(request: Request, context: ProxyRouteContext, resource: string) {
  const { path = [] } = await context.params;
  const suffix = path.map(segment => encodeURIComponent(segment)).join("/");
  const query = new URL(request.url).search;
  const targetUrl = `${getBackendUrl()}/${resource}${suffix ? `/${suffix}` : ""}${query}`;
  const isMultipart = request.headers.get("content-type")?.startsWith("multipart/form-data");
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (isMultipart && contentLength > 31 * 1024 * 1024) {
    return NextResponse.json({ message: "文件不能超过 30MB" }, { status: 413 });
  }
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : isMultipart
        ? request.body
        : await request.text();
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    const init: RequestInit & { duplex?: "half" } = {
      method: request.method,
      headers: {
        "content-type": request.headers.get("content-type") || "application/json",
        authorization: `Bearer ${token}`,
        "x-analytics-event-id": request.headers.get("x-analytics-event-id") || "",
        "x-countdown-start": request.headers.get("x-countdown-start") || ""
      },
      body
    };
    if (isMultipart) init.duplex = "half";
    const response = await fetch(targetUrl, init);
    const data = await response.json().catch(() => ({ message: "接口响应异常" }));
    const result = NextResponse.json(data, { status: response.status });
    if (response.status === 401) clearAuthCookie(result, request);
    return result;
  } catch {
    return NextResponse.json({ message: "后端服务连接失败" }, { status: 500 });
  }
}
