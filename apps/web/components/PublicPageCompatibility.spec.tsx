import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const route = vi.hoisted(() => ({ path: "/r/token" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.path }));
vi.mock("@/components/Background", () => ({ Background: () => null }));
vi.mock("@/components/GlobalRequestLoading", () => ({ GlobalRequestLoading: () => <div>desktop-loading</div> }));
vi.mock("@tanstack/react-query-devtools", () => ({ ReactQueryDevtools: () => <div>desktop-devtools</div> }));
vi.mock("react-hot-toast", () => ({ Toaster: () => <div>desktop-toaster</div> }));
import { metadata } from "@/app/layout";
import { Providers } from "@/app/providers";
it("disables all iOS data detection, including dates, before hydration", () => {
  expect(metadata.formatDetection).toMatchObject({
    date: false,
    telephone: false,
    email: false,
    address: false,
    url: false
  });
});
describe("public page provider isolation", () => {
  it("does not server-render desktop browser infrastructure on a report link", () => {
    route.path = "/r/token";
    const html = renderToStaticMarkup(
      <Providers>
        <p>report-content</p>
      </Providers>
    );
    expect(html).toBe("<p>report-content</p>");
  });
  it("keeps desktop tools on the teacher app", () => {
    route.path = "/";
    const html = renderToStaticMarkup(
      <Providers>
        <p>teacher-content</p>
      </Providers>
    );
    expect(html).toContain("desktop-loading");
    expect(html).toContain("desktop-toaster");
  });
});

import { localReportShareUrl } from "@/lib/report-share-url";
it("uses the LAN app origin for localhost parent links while preserving the token", () => {
  expect(localReportShareUrl("http://localhost:3001/r/token", "http://192.168.1.177:3001")).toBe(
    "http://192.168.1.177:3001/r/token"
  );
  expect(localReportShareUrl("http://127.0.0.1:3001/r/token", "https://school.test")).toBe(
    "https://school.test/r/token"
  );
});
it("preserves configured public links and unrelated or invalid URLs", () => {
  for (const url of ["https://reports.school.test/r/token", "http://localhost:3001/other", "invalid"])
    expect(localReportShareUrl(url, "http://192.168.1.177:3001")).toBe(url);
  expect(localReportShareUrl("http://localhost:3001/r/token", "http://localhost:3001")).toBe(
    "http://localhost:3001/r/token"
  );
});
