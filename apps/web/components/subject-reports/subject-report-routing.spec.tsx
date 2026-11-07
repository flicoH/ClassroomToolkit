import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { GET } from "../../app/api/subject-reports/[[...path]]/route";
import { GET as publicReport } from "../../app/api/public-reports/subject/[token]/route";
import { proxy } from "../../proxy";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "test-token" }) })
}));

describe("subject report share routing", () => {
  it.each(["/r/", "/r/subject/"])("serves valid share links under %s without login", prefix => {
    const response = proxy(new NextRequest(`http://localhost${prefix}${"a".repeat(43)}`));

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
  });

  it.each(["/r/subject/short", "/r/subject/" + "a".repeat(43) + "/"])(
    "keeps a subject share page public at %s",
    pathname => {
      expect(proxy(new NextRequest(`http://localhost${pathname}`)).headers.get("location")).toBeNull();
    }
  );

  it.each(["/subject-reports", "/r/other/" + "a".repeat(43)])("protects %s", pathname => {
    const response = proxy(new NextRequest(`http://localhost${pathname}`));

    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
  });
});

describe("subject report list routes", () => {
  it.each(["report-terms", "report-subjects", "course-documents", "reports"])(
    "forwards %s with teacher authentication",
    async path => {
      const fetchMock = vi.fn().mockResolvedValue(Response.json([]));
      vi.stubGlobal("fetch", fetchMock);
      vi.stubEnv("BACKEND_URL", "http://backend.test");
      try {
        const request = new Request(`http://localhost/api/subject-reports/${path}`);
        const context = { params: Promise.resolve({ path: [path] }) };
        const response = await GET(request, context);
        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledWith(
          `http://backend.test/subject-reports/${path}`,
          expect.objectContaining({
            method: "GET",
            headers: expect.objectContaining({ authorization: "Bearer test-token" })
          })
        );
      } finally {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
      }
    }
  );
});

describe("anonymous subject report API", () => {
  it("fetches a published report without teacher credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ studentName: "小宇", content: {} }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    try {
      const token = "a".repeat(43);
      const response = await publicReport(new Request(`http://localhost/api/public-reports/subject/${token}`), {
        params: Promise.resolve({ token })
      });
      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledWith(`http://backend.test/subject-reports/public/reports/${token}`, {
        cache: "no-store",
        headers: { accept: "application/json" }
      });
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});
