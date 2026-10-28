"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clipboard, Download, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyImage } from "@/lib/clipboard";
import { LearningReportView, type LearningReportData } from "./LearningReportView";
import { renderReportImage } from "./report-image";

type Props = { studentName: string; shareUrl: string; onClose: () => void };

/** Fetch the same public DTO as the parent link; never export unsaved teacher drafts. */
export function ReportImageDialog({ studentName, shareUrl, onClose }: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const [report, setReport] = useState<LearningReportData | null>(null);
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [copying, setCopying] = useState(false);
  const [attempt, setAttempt] = useState(0);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      } else if (event.key === "Tab") {
        const controls = Array.from(
          dialogRef.current?.querySelectorAll<HTMLElement>(":is(button:not(:disabled), a[href])") ?? []
        );
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    setReport(null);
    setImage(null);
    setError("");
    setFeedback("");
    void (async () => {
      const path = new URL(shareUrl, window.location.origin).pathname;
      const match = /^\/r\/([A-Za-z0-9_-]{40,50})$/.exec(path);
      if (!match) throw new Error("报告链接无效，请重新复制家长链接后生成图片。");
      // Use our same-origin BFF, not an arbitrary share URL or a cross-origin screenshot service.
      const response = await fetch(`/api/public-reports/${match[1]}`, { cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "报告链接无效或已失效，请重新发布后生成图片。");
      if (!cancelled) setReport(data as LearningReportData);
    })()
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(
            reason instanceof Error && reason.name !== "AbortError"
              ? reason.message
              : "报告读取失败或超时，请重新生成。"
          );
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [shareUrl, attempt]);

  useEffect(() => {
    if (!report || !reportRef.current) return;
    let cancelled = false;
    let imageUrl: string | undefined;
    void renderReportImage(reportRef.current)
      .then(blob => {
        if (cancelled) return;
        imageUrl = URL.createObjectURL(blob);
        setImage({ blob, url: imageUrl });
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "图片生成失败，请重新生成。");
      });
    return () => {
      cancelled = true;
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [report]);

  async function copy() {
    if (!image || copying) return;
    setCopying(true);
    const copied = await copyImage(image.blob);
    setFeedback(
      copied ? "图片已复制，可以直接粘贴发送。" : "浏览器未允许复制图片。请点击“下载图片”，或长按下方图片保存后发送。"
    );
    setCopying(false);
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-2 sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[calc(100dvh-1rem)] w-full min-w-0 max-w-3xl flex-col overflow-hidden rounded-2xl bg-background shadow-xl sm:max-h-[calc(100dvh-2rem)]"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b p-4">
          <h2 id={titleId} className="min-w-0 break-words font-semibold">
            {studentName} · 报告图片
          </h2>
          <Button
            ref={closeRef}
            size="icon"
            variant="ghost"
            aria-label="关闭报告图片窗口"
            className="min-h-11 min-w-11 shrink-0"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-4">
          <p className="mb-3 text-sm text-muted-foreground">将已发布报告生成一张完整长图，复制后可直接粘贴发送。</p>
          {error ? (
            <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
              <p className="break-words">{error}</p>
              <Button className="mt-3 min-h-11" variant="outline" onClick={() => setAttempt(value => value + 1)}>
                重新生成
              </Button>
            </div>
          ) : !image ? (
            <div
              role="status"
              className="flex min-h-40 items-center justify-center gap-2 rounded-xl bg-indigo-50 p-4 text-sm text-indigo-900"
            >
              <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
              {report ? "正在生成报告图片…" : "正在读取已发布报告…"}
            </div>
          ) : (
            <img
              src={image.url}
              alt={`${studentName} 的完整报告图片`}
              className="mx-auto h-auto w-full rounded-xl border"
            />
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {image && feedback && (
            <p role="status" className="w-full rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">
              {feedback}
            </p>
          )}
          <Button className="min-h-11 flex-1 sm:flex-none" disabled={!image || copying} onClick={() => void copy()}>
            <Clipboard />
            {copying ? "正在复制…" : "复制图片"}
          </Button>
          {image && (
            <a
              href={image.url}
              download={`${studentName}-学习报告.png`}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium sm:flex-none"
            >
              <Download className="h-4 w-4" />
              下载图片
            </a>
          )}
          <Button className="min-h-11 sm:ml-auto" variant="outline" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>
      {report && !image && !error && (
        <div
          aria-hidden="true"
          inert
          className="pointer-events-none fixed top-0 bg-white"
          style={{ left: "-10000px", width: Math.min(720, Math.max(320, window.innerWidth - 32)) }}
        >
          <div ref={reportRef}>
            <LearningReportView report={report} forImage />
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
