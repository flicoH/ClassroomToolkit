import { afterEach, describe, expect, it } from "vitest";
import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import request, { resetRequestCache } from "@/lib/request";
import { useAuthStore } from "@/store/authStore";
import { useWindowStore } from "@/store/windowStore";
import { useCountdownStore } from "@/store/countdownStore";
import { queryClient } from "@/lib/queryClient";
const originalAdapter = request.defaults.adapter;
afterEach(() => {
  request.defaults.adapter = originalAdapter;
  useAuthStore.setState({ user: null });
  resetRequestCache();
});
describe("account session cache isolation", () => {
  it("closes windows and clears query and countdown state when switching actors", () => {
    useAuthStore.setState({ user: { id: "a", ownerAccountId: "owner-a", name: "A", email: "" } });
    useWindowStore.setState({ windows: [{ id: "old" } as never] });
    useCountdownStore.setState({ totalSeconds: 60, remainingSeconds: 30, isRunning: true });
    queryClient.setQueryData(["old-students"], [{ name: "old private data" }]);
    useAuthStore.getState().setUser({ id: "b", ownerAccountId: "owner-b", name: "B", email: "" });
    expect(useWindowStore.getState().windows).toHaveLength(0);
    expect(queryClient.getQueryData(["old-students"])).toBeUndefined();
    expect(useCountdownStore.getState().isRunning).toBe(false);
    expect(useCountdownStore.getState().remainingSeconds).toBe(300);
  });
  it("rejects a delayed response from an old account, and sends a fresh request after a switch", async () => {
    let finish!: () => void;
    let started!: () => void;
    const ready = new Promise<void>(resolve => {
      started = resolve;
    });
    let calls = 0;
    request.defaults.adapter = async config => {
      calls++;
      if (calls === 1) {
        started();
        await new Promise<void>(resolve => {
          finish = resolve;
        });
      }
      return { data: { account: calls }, status: 200, statusText: "OK", headers: {}, config };
    };
    const first = request.get("/private-test").catch(error => error);
    await ready;
    resetRequestCache();
    const second = await request.get("/private-test");
    expect(second).toEqual({ account: 2 });
    finish();
    expect((await first).message).toContain("账号已切换");
    expect(calls).toBe(2);
  });
  it("does not log out the new account when an old request returns 401", async () => {
    let fail!: () => void, started!: () => void;
    const ready = new Promise<void>(resolve => {
      started = resolve;
    });
    request.defaults.adapter = (config: InternalAxiosRequestConfig) =>
      new Promise((_resolve, reject) => {
        started();
        fail = () =>
          reject(
            new AxiosError("old unauthorized", "ERR_BAD_REQUEST", config, undefined, {
              status: 401,
              statusText: "Unauthorized",
              data: {},
              headers: {},
              config
            })
          );
      });
    const first = request.get("/old-private").catch(error => error);
    await ready;
    resetRequestCache();
    fail();
    expect((await first).message).toContain("账号已切换");
  });
});
