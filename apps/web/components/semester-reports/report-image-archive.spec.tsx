import { Blob as NodeBlob } from "node:buffer";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reportImageArchive, reportImageFileName } from "./report-image-archive";

describe("report image ZIP interoperability", () => {
  beforeEach(() => vi.stubGlobal("Blob", NodeBlob));
  afterEach(() => vi.unstubAllGlobals());
  it("extracts every PNG with valid CRC and Chinese filenames using an independent ZIP reader", async () => {
    const report = { id: "r", studentName: "同名/学生", className: "一班", period: "week", start: "2026-10-12" };
    const files = [0, 1].map(index => ({
      name: reportImageFileName(report, index),
      blob: new NodeBlob([`PNG-${index}`]) as Blob
    }));
    const zip = await reportImageArchive(files);
    const bytes = await zip.arrayBuffer();
    const extracted = JSON.parse(
      execFileSync(
        "python3",
        [
          "-c",
          "import io,json,sys,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); print(json.dumps({n:z.read(n).decode() for n in z.namelist()}))"
        ],
        { input: Buffer.from(bytes) }
      ).toString()
    );
    expect(extracted).toEqual({ [files[0]!.name]: "PNG-0", [files[1]!.name]: "PNG-1" });
    expect(files[0]!.name).not.toMatch(/[\\/]/);
    expect(zip.type).toBe("application/zip");
  });
  it("rejects an empty export", async () => {
    await expect(reportImageArchive([])).rejects.toThrow("没有可导出");
  });
  it("uses the Shanghai report date in filenames across the UTC day boundary", () => {
    expect(
      reportImageFileName(
        { id: "r", studentName: "学生", className: "一班", period: "week", start: "2026-10-11T16:00:00.000Z" },
        0
      )
    ).toBe("001-一班-学生-周报-2026-10-12.png");
  });
});
