import { afterEach, expect, it, vi } from "vitest";
import { trackFeatureOpen } from "@/lib/analytics";

// 打开事件只传稳定功能标识，旧入口和新入口应汇入同一功能统计。
afterEach(() => vi.unstubAllGlobals());

it.each([
  ["subjectReports", "subject-reports"],
  ["semesterReportStudio", "semester-reports"],
  ["semesterReports", "semester-reports"],
  ["semesterReportsV2", "semester-reports"]
])("tracks %s opens as %s", (contentKey, feature) => {
  const send = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", send);
  trackFeatureOpen(contentKey);
  expect(send).toHaveBeenCalledWith(
    "/api/analytics/events",
    expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      keepalive: true
    })
  );
  expect(JSON.parse(send.mock.calls[0]![1].body)).toMatchObject({ feature, kind: "open" });
});

it("ignores unknown entries and does not break navigation on network failure", async () => {
  const send = vi.fn().mockRejectedValue(new Error("offline"));
  vi.stubGlobal("fetch", send);
  trackFeatureOpen("unknown");
  expect(send).not.toHaveBeenCalled();
  trackFeatureOpen("subjectReports");
  await Promise.resolve();
  expect(send).toHaveBeenCalledTimes(1);
});
