/** Copy when browser permissions allow it; callers must provide a manual fallback. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // HTTP origins and browsers requiring a fresh user gesture may reject this.
  }

  const field = document.createElement("textarea");
  const focused = document.activeElement;
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  try {
    field.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
    if (focused instanceof HTMLElement) focused.focus();
  }
}

/** Write a ready PNG during the click gesture; image copying has no execCommand fallback. */
export async function copyImage(image: Blob): Promise<boolean> {
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") return false;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": image })]);
    return true;
  } catch {
    return false;
  }
}
