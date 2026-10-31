import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it, vi } from "vitest";
import toast from "react-hot-toast";
import request from "../lib/request";
vi.mock("react-hot-toast", () => ({ default: { error: vi.fn() } }));
describe("authentication error feedback", () => {
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
});
