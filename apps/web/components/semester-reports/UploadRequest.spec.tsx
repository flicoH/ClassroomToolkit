import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import request from "@/lib/request";

vi.mock("react-hot-toast", () => ({ default: { error: vi.fn() } }));
vi.mock("@/store/requestLoadingStore", () => ({
  useRequestLoadingStore: { getState: () => ({ startRequest: () => {}, endRequest: () => {} }) }
}));

describe("binary upload request transport", () => {
  const originalAdapter = request.defaults.adapter;
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => ({
    data: { saved: true },
    status: 200,
    statusText: "OK",
    headers: {},
    config
  }));
  beforeEach(() => {
    vi.useFakeTimers();
    adapter.mockClear();
    request.defaults.adapter = adapter;
  });
  afterEach(async () => {
    await vi.runOnlyPendingTimersAsync();
    vi.useRealTimers();
    request.defaults.adapter = originalAdapter;
  });
  const photo = (name: string) => {
    const form = new FormData();
    form.append("file", new File(["photo bytes"], name, { type: "image/png" }));
    return form;
  };
  const multipart = { headers: { "Content-Type": undefined } };

  it.each([undefined, multipart])(
    "preserves the binary file with default or explicit multipart headers: %j",
    async headers => {
      const form = photo("classroom.png");
      await request.post("/api/semester-reports/reports/transport/classroom-photo", form, headers);
      expect(adapter.mock.calls[0]![0].data).toBe(form);
      expect((adapter.mock.calls[0]![0].data as FormData).get("file")).toBeInstanceOf(File);
    }
  );
  it("sends a newly chosen photo immediately instead of reusing a cached upload", async () => {
    const first = photo("first.png");
    const second = photo("second.png");
    await request.post("/api/semester-reports/reports/replacement/classroom-photo", first, multipart);
    await request.post("/api/semester-reports/reports/replacement/classroom-photo", second, multipart);
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(adapter.mock.calls[1]![0].data).toBe(second);
  });
  it("allows an immediate retry after a failed multipart request", async () => {
    adapter.mockRejectedValueOnce(new Error("上传失败"));
    const url = "/api/semester-reports/reports/retry/classroom-photo";
    await expect(request.post(url, photo("failed.png"), multipart)).rejects.toThrow("上传失败");
    await expect(request.post(url, photo("retry.png"), multipart)).resolves.toEqual({ saved: true });
    expect(adapter).toHaveBeenCalledTimes(2);
  });
  it("retains deduplication for identical JSON requests", async () => {
    await request.post("/api/json-dedupe", { id: "same" });
    await request.post("/api/json-dedupe", { id: "same" });
    expect(adapter).toHaveBeenCalledTimes(1);
  });
});
