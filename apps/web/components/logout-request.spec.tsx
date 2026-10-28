import { describe, expect, it, vi } from "vitest";
import { revokeTeacherSession } from "@/app/api/logout/route";

describe("revokeTeacherSession", () => {
  it("swallows backend failures so logout can still clear the cookie", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("backend unavailable"));

    await expect(revokeTeacherSession("token", fetcher, () => "http://backend", 10)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith(
      "http://backend/auth/teacher/logout",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("aborts a backend revoke request after the configured timeout", async () => {
    const fetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    });

    const startedAt = Date.now();
    await revokeTeacherSession("token", fetcher as typeof fetch, () => "http://backend", 5);

    expect(Date.now() - startedAt).toBeLessThan(500);
  });
});
