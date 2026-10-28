/** Capture the entire report, with a bounded canvas so long reports also work on mobile. */
export async function renderReportImage(element: HTMLElement): Promise<Blob> {
  await document.fonts?.ready;
  // Capture only after portraits and classroom photos are decoded; never export a blank image slot.
  await Promise.all(
    Array.from(element.querySelectorAll("img")).map(
      image =>
        new Promise<void>((resolve, reject) => {
          const failed = () => reject(new Error("报告图片加载失败，请重新生成图片。"));
          if (image.complete) {
            if (image.naturalWidth > 0) resolve();
            else failed();
            return;
          }
          const timeout = setTimeout(() => finish(false), 10000);
          const loaded = () => finish(true);
          const errored = () => finish(false);
          const finish = (success: boolean) => {
            clearTimeout(timeout);
            image.removeEventListener("load", loaded);
            image.removeEventListener("error", errored);
            if (success && image.naturalWidth > 0) resolve();
            else failed();
          };
          image.addEventListener("load", loaded);
          image.addEventListener("error", errored);
        })
    )
  );
  const width = Math.ceil(element.getBoundingClientRect().width);
  const height = element.scrollHeight;
  if (!width || !height) throw new Error("报告尚未完成排版，请重新生成图片。");
  // Keep the full content rather than silently cropping at a browser's canvas limit.
  const pixelRatio = Math.min(2, 16384 / height, 16384 / width, Math.sqrt(14000000 / (width * height)));
  if (pixelRatio < 0.5)
    throw new Error("报告内容过长，无法生成清晰的单张图片。请缩小报告范围后重新生成，或发送家长链接。");
  const { toBlob } = await import("html-to-image");
  const image = await toBlob(element, { backgroundColor: "#ffffff", width, height, pixelRatio });
  if (!image || image.size === 0) throw new Error("图片生成失败，请重新生成图片。");
  return image;
}
