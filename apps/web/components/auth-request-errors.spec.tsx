import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it, vi } from "vitest";
import toast from "react-hot-toast";
import request from "../lib/request";
import { handleExpiredTeacherSession } from "../lib/expired-teacher-session";
import { getLoginRedirect } from "./Login";
vi.mock("react-hot-toast", () => ({ default: { error: vi.fn() } }));
vi.mock("../lib/expired-teacher-session", () => ({ handleExpiredTeacherSession: vi.fn() }));
describe("authentication error feedback", () => {
  it("allows the local resume route while refusing redirects that resolve to other sites", () => {
    const origin = "https://toolkit.example";
    expect(getLoginRedirect("/?resumeReport=1", origin)).toBe(`${origin}/?resumeReport=1`);
    expect(getLoginRedirect("/dashboard?view=reports", origin)).toBe(`${origin}/dashboard?view=reports`);
    expect(getLoginRedirect("//outside.example", origin)).toBe("/");
    expect(getLoginRedirect("/\\outside.example", origin)).toBe("/");
  });

  it.each(["/api/login", "/api/register"])("preserves the block message without duplicate toasts for %s", async url => {
    const message = "禁止账号登录，请联系管理员解封";
    await expect(
      request.post(
        url,
        {},
        {
          adapter: async config => {
            throw new AxiosError("Request failed with status code 403", "ERR_BAD_REQUEST", config, undefined, {
              status: 403,
              statusText: "Forbidden",
              headers: new AxiosHeaders(),
              config,
              data: { message }
            });
          }
        }
      )
    ).rejects.toThrow(message);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("dispatches a business 401 to recovery and preserves the response status for the report form", async () => {
    await expect(
      request.get("/api/semester-reports/reports", {
        adapter: async config => {
          throw new AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, undefined, {
            status: 401,
            statusText: "Unauthorized",
            headers: new AxiosHeaders(),
            config,
            data: {}
          });
        }
      })
    ).rejects.toMatchObject({ response: { status: 401 } });
    expect(handleExpiredTeacherSession).toHaveBeenCalledOnce();
  });
});
