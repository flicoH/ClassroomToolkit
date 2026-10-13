import { afterEach, expect, it, vi } from "vitest";
import { prepareStudentPhoto } from "./student-photo";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function decoder(fail = false, outputSize = 20) {
  const revoke = vi.fn();
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:input"), revokeObjectURL: revoke });
  vi.stubGlobal(
    "Image",
    class {
      naturalWidth = 1024;
      naturalHeight = 768;
      onload?: () => void;
      onerror?: () => void;
      set src(_value: string) {
        queueMicrotask(() => (fail ? this.onerror?.() : this.onload?.()));
      }
    }
  );
  const context = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, callback) {
    expect(this.width).toBe(512);
    expect(this.height).toBe(384);
    callback(new Blob([new Uint8Array(outputSize)], { type: "image/jpeg" }));
  });
  return { revoke, context };
}

it("accepts a 2MB original, preserves aspect ratio and sends a bounded JPEG on a white background", async () => {
  const { revoke, context } = decoder();
  const file = await prepareStudentPhoto(
    new File([new Uint8Array(2 * 1024 * 1024)], "photo.png", { type: "image/png" })
  );
  expect(file.type).toBe("image/jpeg");
  expect(file.size).toBe(20);
  expect(context.fillStyle).toBe("#ffffff");
  expect(context.drawImage).toHaveBeenCalled();
  expect(revoke).toHaveBeenCalledWith("blob:input");
});
it("rejects oversize, empty and unsupported original inputs", async () => {
  for (const file of [
    new File([new Uint8Array(2 * 1024 * 1024 + 1)], "photo.jpg", { type: "image/jpeg" }),
    new File([], "empty.png", { type: "image/png" }),
    new File(["svg"], "photo.svg", { type: "image/svg+xml" })
  ])
    await expect(prepareStudentPhoto(file)).rejects.toThrow("2MB");
});
it("cleans up object URLs when decoding or output size validation fails", async () => {
  const file = new File(["png"], "photo.png", { type: "image/png" });
  const failed = decoder(true);
  await expect(prepareStudentPhoto(file)).rejects.toThrow("无法读取");
  expect(failed.revoke).toHaveBeenCalled();
  vi.restoreAllMocks();
  const tooLarge = decoder(false, 256 * 1024 + 1);
  await expect(prepareStudentPhoto(file)).rejects.toThrow("256KB");
  expect(tooLarge.revoke).toHaveBeenCalled();
});
