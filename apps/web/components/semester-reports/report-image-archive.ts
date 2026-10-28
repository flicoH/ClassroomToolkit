export type ReportImageFile = { name: string; blob: Blob };

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});

/** PNG 本身已压缩，ZIP 使用 STORE；写入 UTF-8 文件名和 CRC，兼容系统自带解压工具。 */
export async function reportImageArchive(files: ReportImageFile[]): Promise<Blob> {
  if (!files.length) throw new Error("没有可导出的报告图片。");
  if (files.length > 65535) throw new Error("所选报告过多，请分批导出。");
  const parts: BlobPart[] = [];
  const directory: Uint8Array<ArrayBuffer>[] = [];
  const encoder = new TextEncoder();
  let offset = 0;
  let directorySize = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const bytes = new Uint8Array(await file.blob.arrayBuffer());
    if (name.length > 65535 || offset + bytes.length + name.length + 30 > 0xffffffff)
      throw new Error("报告图片总大小过大，请分批导出。");
    let crc = 0xffffffff;
    for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255]!;
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = new Uint8Array(30 + name.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x800, true);
    view.setUint16(12, 0x21, true); // 1980-01-01，合法的 DOS 日期。
    view.setUint32(14, crc, true);
    view.setUint32(18, bytes.length, true);
    view.setUint32(22, bytes.length, true);
    view.setUint16(26, name.length, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    const index = new DataView(central.buffer);
    index.setUint32(0, 0x02014b50, true);
    index.setUint16(4, 20, true);
    index.setUint16(6, 20, true);
    central.set(local.subarray(6, 28), 8);
    index.setUint32(42, offset, true);
    central.set(name, 46);
    parts.push(local, file.blob);
    directory.push(central);
    offset += local.length + bytes.length;
    directorySize += central.length;
  }
  if (offset + directorySize > 0xffffffff) throw new Error("报告图片总大小过大，请分批导出。");
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, files.length, true);
  view.setUint16(10, files.length, true);
  view.setUint32(12, directorySize, true);
  view.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, end], { type: "application/zip" });
}

export function reportImageFileName(
  report: { className: string; studentName: string; period: string; id: string; start?: string },
  index: number
) {
  const period = ({ week: "周报", month: "月报", term: "学期报告" } as Record<string, string>)[report.period] ?? "报告";
  const start = new Date(report.start ?? "");
  // 数据库存 UTC，文件名与报告正文都使用上海日期，不能直接截取 ISO 字符串。
  const date = Number.isFinite(start.getTime()) ? start.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }) : "";
  // 顺序号保证同名学生/同周期的多个版本不会覆盖；去除路径符号，避免解压生成额外目录。
  return (
    `${String(index + 1).padStart(3, "0")}-${report.className}-${report.studentName}-${period}-${date}`
      .replace(/[<>:"/\\|?*]/g, "_")
      .split("")
      .map(character => (character.charCodeAt(0) < 32 ? "_" : character))
      .join("")
      .slice(0, 180) + ".png"
  );
}
