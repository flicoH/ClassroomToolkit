/** Capture the entire report, with a bounded canvas so long reports also work on mobile. */
export async function renderReportImage(element: HTMLElement): Promise<Blob> {
  await document.fonts?.ready;
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
