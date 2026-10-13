/** Bound original inputs and upload bytes so a class list never carries full-resolution photos. */
export async function prepareStudentPhoto(file: File): Promise<File> {
  if (!["image/jpeg", "image/png"].includes(file.type) || file.size === 0 || file.size > 2 * 1024 * 1024)
    throw new Error("请选择 JPG 或 PNG 学生照片，原图最大 2MB。");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("无法读取图片，请选择有效的 JPG 或 PNG 照片。"));
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("图片尺寸无效。");
    const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器无法处理图片，请更换浏览器重试。");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size === 0 || blob.size > 256 * 1024)
      throw new Error("图片处理失败或处理后超过 256KB，请更换图片重试。");
    return new File([blob], "student-photo.jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}
