import { useEffect, useRef } from "react";

/** Existing portal dialogs share keyboard behavior; only the top visible dialog traps focus. */
export function usePetDialog(state: Record<string, unknown>, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  const signature = JSON.stringify(state);
  useEffect(() => {
    if (state.confirmOpen || !Object.entries(state).some(([key, value]) => key !== "confirmOpen" && Boolean(value)))
      return;
    const sections = Array.from(document.querySelectorAll<HTMLElement>("div.fixed > section[data-pet-dialog]"));
    const dialog = sections.at(-1);
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", dialog.querySelector("h3")?.textContent ?? "宠物积分对话框");
    dialog.tabIndex = -1;
    const controls = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'
        )
      );
    (controls()[0] ?? dialog).focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
      }
      if (event.key === "Tab") {
        const items = controls(),
          first = items[0],
          last = items.at(-1);
        if (
          !first ||
          (event.shiftKey && document.activeElement === first) ||
          (!event.shiftKey && document.activeElement === last) ||
          !dialog.contains(document.activeElement)
        ) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      if (previous?.isConnected) previous.focus();
    };
    // The serialized state contains modal identities, not drafts or notice updates.
  }, [signature]);
}
