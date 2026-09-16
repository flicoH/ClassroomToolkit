const encoder = new TextEncoder();

function ascii(value: string) {
  return encoder.encode(value);
}

function concat(chunks: Uint8Array[]) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  chunks.forEach(chunk => {
    result.set(chunk, offset);
    offset += chunk.length;
  });
  return result;
}

function dataUrlBytes(dataUrl: string) {
  const binary = atob(dataUrl.split(",")[1] ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** 由每页 JPEG 直接生成一个无依赖的多页 PDF。 */
export function createImagePdf(images: Array<{ dataUrl: string; width: number; height: number }>) {
  const objectCount = 2 + images.length * 3;
  const objects: Uint8Array[][] = Array.from({ length: objectCount + 1 }, () => []);
  const pageIds = images.map((_, index) => 3 + index * 3);
  objects[1] = [ascii("<< /Type /Catalog /Pages 2 0 R >>")];
  objects[2] = [
    ascii(`<< /Type /Pages /Count ${images.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] >>`)
  ];

  images.forEach((image, index) => {
    const pageId = 3 + index * 3;
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const pageWidth = 841.89;
    const pageHeight = pageWidth * (image.height / image.width);
    const name = `Im${index + 1}`;
    const command = `q\n${pageWidth.toFixed(2)} 0 0 ${pageHeight.toFixed(2)} 0 0 cm\n/${name} Do\nQ`;
    const jpeg = dataUrlBytes(image.dataUrl);
    objects[pageId] = [
      ascii(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources << /XObject << /${name} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`
      )
    ];
    objects[contentId] = [ascii(`<< /Length ${command.length} >>\nstream\n${command}\nendstream`)];
    objects[imageId] = [
      ascii(
        `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`
      ),
      jpeg,
      ascii("\nendstream")
    ];
  });

  const chunks: Uint8Array[] = [ascii("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")];
  const offsets = new Array<number>(objectCount + 1).fill(0);
  let length = chunks[0]!.length;
  for (let id = 1; id <= objectCount; id += 1) {
    offsets[id] = length;
    const object = concat([ascii(`${id} 0 obj\n`), ...(objects[id] ?? []), ascii("\nendobj\n")]);
    chunks.push(object);
    length += object.length;
  }
  const xrefOffset = length;
  const xref = ["xref", `0 ${objectCount + 1}`, "0000000000 65535 f "];
  for (let id = 1; id <= objectCount; id += 1) xref.push(`${String(offsets[id]).padStart(10, "0")} 00000 n `);
  xref.push("trailer", `<< /Size ${objectCount + 1} /Root 1 0 R >>`, "startxref", String(xrefOffset), "%%EOF");
  chunks.push(ascii(`${xref.join("\n")}\n`));
  return new Blob([concat(chunks)], { type: "application/pdf" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
