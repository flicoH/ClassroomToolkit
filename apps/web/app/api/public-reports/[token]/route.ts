import { NextResponse } from "next/server";
import { getBackendUrl } from "../../backend-url";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token))
    return NextResponse.json(
      { message: "报告链接无效或已失效" },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  try {
    const response = await fetch(`${getBackendUrl()}/semester-reports/public/reports/${encodeURIComponent(token)}`, {
      cache: "no-store",
      headers: { accept: "application/json" }
    });
    const data = await response.json().catch(() => ({ message: "报告暂不可访问" }));
    return NextResponse.json(data, {
      status: response.status,
      headers: {
        "Cache-Control": "no-store, private",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
        "Referrer-Policy": "no-referrer"
      }
    });
  } catch {
    return NextResponse.json(
      { message: "报告服务暂不可用" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
