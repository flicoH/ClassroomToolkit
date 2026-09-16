import JSZip from "jszip";
import { createUuid } from "@/lib/id";
import type { WhiteboardPage } from "./types";

const BOARD_WIDTH = 1280;
const BOARD_HEIGHT = 720;

function importedPage(index: number, backgroundImage: string): WhiteboardPage {
  return {
    id: createUuid(),
    name: `第 ${index + 1} 页`,
    background: "plain",
    backgroundColor: "#ffffff",
    backgroundImage,
    elements: []
  };
}

function canvasDataUrl(source: HTMLCanvasElement) {
  const canvas = document.createElement("canvas");
  canvas.width = BOARD_WIDTH;
  canvas.height = BOARD_HEIGHT;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
  const scale = Math.min(BOARD_WIDTH / source.width, BOARD_HEIGHT / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  context.drawImage(source, (BOARD_WIDTH - width) / 2, (BOARD_HEIGHT - height) / 2, width, height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

export async function importPdfPages(file: File, onProgress?: (current: number, total: number) => void) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: WhiteboardPage[] = [];
  for (let index = 0; index < pdf.numPages; index += 1) {
    onProgress?.(index + 1, pdf.numPages);
    const page = await pdf.getPage(index + 1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2.2, Math.max(1, 1800 / Math.max(baseViewport.width, baseViewport.height)));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d")!;
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    pages.push(importedPage(index, canvasDataUrl(canvas)));
    page.cleanup();
  }
  await pdf.cleanup();
  return pages;
}

function escapeXml(value: string) {
  return value.replace(
    /[&<>"']/g,
    character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!
  );
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  return btoa(binary);
}

function svgDataUrl(svg: string) {
  return `data:image/svg+xml;base64,${toBase64(new TextEncoder().encode(svg))}`;
}

function firstElement(parent: Element, name: string) {
  return parent.getElementsByTagName(name)[0];
}

function pptColor(element: Element, fallback: string) {
  return firstElement(element, "a:srgbClr")?.getAttribute("val")
    ? `#${firstElement(element, "a:srgbClr")!.getAttribute("val")}`
    : fallback;
}

function pptRect(element: Element, slideWidth: number, slideHeight: number) {
  const transform = firstElement(element, "a:xfrm") ?? firstElement(element, "p:xfrm");
  const offset = transform ? firstElement(transform, "a:off") : undefined;
  const extent = transform ? firstElement(transform, "a:ext") : undefined;
  const x = (Number(offset?.getAttribute("x") ?? 0) / slideWidth) * BOARD_WIDTH;
  const y = (Number(offset?.getAttribute("y") ?? 0) / slideHeight) * BOARD_HEIGHT;
  const width = (Number(extent?.getAttribute("cx") ?? slideWidth / 4) / slideWidth) * BOARD_WIDTH;
  const height = (Number(extent?.getAttribute("cy") ?? slideHeight / 8) / slideHeight) * BOARD_HEIGHT;
  return { x, y, width, height };
}

/** 将 PPTX 的文本、常见形状和图片转换成静态 SVG 页面；动画会按最终静态状态导入。 */
export async function importPptxPages(file: File, onProgress?: (current: number, total: number) => void) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const parser = new DOMParser();
  const presentationXml = await zip.file("ppt/presentation.xml")?.async("text");
  if (!presentationXml) throw new Error("无效的 PPTX 文件");
  const presentation = parser.parseFromString(presentationXml, "application/xml");
  const size = firstElement(presentation.documentElement, "p:sldSz");
  const slideWidth = Number(size?.getAttribute("cx") ?? 12192000);
  const slideHeight = Number(size?.getAttribute("cy") ?? 6858000);
  const slidePaths = Object.keys(zip.files)
    .filter(path => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
  const pages: WhiteboardPage[] = [];

  for (let index = 0; index < slidePaths.length; index += 1) {
    onProgress?.(index + 1, slidePaths.length);
    const path = slidePaths[index]!;
    const slideXml = await zip.file(path)!.async("text");
    const slide = parser.parseFromString(slideXml, "application/xml");
    const relPath = path.replace("slides/", "slides/_rels/") + ".rels";
    const relXml = await zip.file(relPath)?.async("text");
    const relationships = new Map<string, string>();
    if (relXml) {
      const relDocument = parser.parseFromString(relXml, "application/xml");
      Array.from(relDocument.getElementsByTagName("Relationship")).forEach(rel => {
        const id = rel.getAttribute("Id");
        const target = rel.getAttribute("Target");
        if (id && target) relationships.set(id, target.replace(/^\.\.\//, "ppt/"));
      });
    }

    const fragments: string[] = [`<rect width="${BOARD_WIDTH}" height="${BOARD_HEIGHT}" fill="#fff"/>`];
    for (const shape of Array.from(slide.getElementsByTagName("p:sp"))) {
      const rect = pptRect(shape, slideWidth, slideHeight);
      const texts = Array.from(shape.getElementsByTagName("a:t")).map(node => node.textContent ?? "");
      const preset = firstElement(shape, "a:prstGeom")?.getAttribute("prst");
      const fill = pptColor(firstElement(shape, "a:solidFill") ?? shape, "none");
      const line = pptColor(firstElement(shape, "a:ln") ?? shape, "#64748b");
      if (preset && preset !== "rect") {
        fragments.push(
          `<ellipse cx="${rect.x + rect.width / 2}" cy="${rect.y + rect.height / 2}" rx="${Math.abs(rect.width / 2)}" ry="${Math.abs(rect.height / 2)}" fill="${fill}" stroke="${line}"/>`
        );
      } else if (firstElement(shape, "p:spPr")) {
        fragments.push(
          `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="4" fill="${fill}" stroke="${line}"/>`
        );
      }
      if (texts.length) {
        const run = firstElement(shape, "a:rPr") ?? firstElement(shape, "a:defRPr");
        const fontSize = Math.max(12, (Number(run?.getAttribute("sz") ?? 2400) / 100) * (BOARD_HEIGHT / 720));
        const textColor = pptColor(run ?? shape, "#0f172a");
        texts.forEach((text, textIndex) =>
          fragments.push(
            `<text x="${rect.x + 8}" y="${rect.y + fontSize + textIndex * fontSize * 1.25}" font-family="sans-serif" font-size="${fontSize}" fill="${textColor}">${escapeXml(text)}</text>`
          )
        );
      }
    }
    for (const picture of Array.from(slide.getElementsByTagName("p:pic"))) {
      const rect = pptRect(picture, slideWidth, slideHeight);
      const embedId = firstElement(picture, "a:blip")?.getAttribute("r:embed");
      const mediaPath = embedId ? relationships.get(embedId) : undefined;
      const media = mediaPath ? zip.file(mediaPath) : undefined;
      if (!media) continue;
      const bytes = await media.async("uint8array");
      const extension = mediaPath!.split(".").pop()?.toLowerCase();
      const mime = extension === "png" ? "image/png" : extension === "gif" ? "image/gif" : "image/jpeg";
      fragments.push(
        `<image href="data:${mime};base64,${toBase64(bytes)}" x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" preserveAspectRatio="xMidYMid meet"/>`
      );
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${BOARD_WIDTH}" height="${BOARD_HEIGHT}" viewBox="0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}">${fragments.join("")}</svg>`;
    pages.push(importedPage(index, svgDataUrl(svg)));
  }
  return pages;
}
