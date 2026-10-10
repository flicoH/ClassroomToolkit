import { afterEach, describe, expect, it, vi } from "vitest";
import { useWindowStore } from "@/store/windowStore";

describe("semester report open analytics", () => {
  afterEach(() => {
    useWindowStore.setState({ windows: [], nextZIndex: 10 });
    vi.unstubAllGlobals();
  });
  it("reports the stable feature identifier when the teacher opens the report tool", async () => {
    const fetchEvent = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchEvent);
    useWindowStore.getState().openWindow("学期报告", "semesterReports");
    expect(useWindowStore.getState().windows).toHaveLength(1);
    expect(fetchEvent).toHaveBeenCalledWith(
      "/api/analytics/events",
      expect.objectContaining({ method: "POST", credentials: "same-origin", keepalive: true })
    );
    const body = JSON.parse(fetchEvent.mock.calls[0]![1].body);
    expect(body).toMatchObject({ feature: "semester-reports", kind: "open" });
    expect(body.eventId).toMatch(/^[a-f0-9-]{36}$/i);
  });
  it("keeps the report window usable when event reporting fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    useWindowStore.getState().openWindow("学期报告", "semesterReports");
    await Promise.resolve();
    expect(useWindowStore.getState().windows[0]?.contentKey).toBe("semesterReports");
  });
});
