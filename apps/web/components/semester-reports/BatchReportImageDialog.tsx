"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { Download, X } from "lucide-react";
import request from "@/lib/request";
import { Button } from "@/components/ui/button";
import { LearningReportView, type LearningReportData } from "./LearningReportView";
import { renderReportImage } from "./report-image";
import { reportImageArchive, reportImageFileName, type ReportImageFile } from "./report-image-archive";

type ExportReport = {
  id: string;
  studentName: string;
  className: string;
  period: string;
  start?: string;
  status: string;
  share?: { url: string } | null;
};
type Props = { reports: ExportReport[]; onClose: () => void };

/** 串行加载公开发布快照并复用长图视图；单份失败继续处理，其余图片保留以便仅重试失败项。 */
export function BatchReportImageDialog({ reports, onClose }: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const files = useRef(new Map<string, ReportImageFile>());
  const [report, setReport] = useState<LearningReportData | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [progress, setProgress] = useState("");
  const [failures, setFailures] = useState<Array<{ name: string; message: string }>>([]);
  const [busy, setBusy] = useState(true);
  const [archive, setArchive] = useState<{ url: string; count: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
      if (event.key !== "Tab") return;
      const controls = [
        ...(dialogRef.current?.querySelectorAll<HTMLElement>(":is(button:not(:disabled), a[href])") ?? [])
      ];
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let archiveUrl: string | undefined;
    let controller = new AbortController();
    setArchive(null);
    setBusy(true);
    setError("");
    setFailures([]);
    const failed: Array<{ name: string; message: string }> = [];
    void (async () => {
      for (const [index, item] of reports.entries()) {
        if (cancelled) return;
        if (files.current.has(item.id)) continue;
        setProgress(`正在生成 ${index + 1} / ${reports.length}：${item.className} · ${item.studentName}`);
        controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        try {
          if (item.status !== "published") throw new Error("请先发布报告。");
          const share =
            item.share ??
            (await request.post<{ url: string }, { url: string }>(`/api/semester-reports/reports/${item.id}/shares`));
          if (cancelled) return;
          const path = new URL(share.url, window.location.origin).pathname;
          const token = /^\/r\/([A-Za-z0-9_-]{40,50})$/.exec(path)?.[1];
          if (!token) throw new Error("报告链接无效，请重新发布。");
          const response = await fetch(`/api/public-reports/${token}`, {
            cache: "no-store",
            signal: controller.signal
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.message || "报告链接无效或已失效。");
          if (cancelled) return;
          // 每次只挂载一份报告，避免整班的照片和 DOM 同时占用内存。
          flushSync(() => setReport(data as LearningReportData));
          const blob = await renderReportImage(reportRef.current!);
          if (cancelled) return;
          const total = [...files.current.values()].reduce((size, file) => size + file.blob.size, 0);
          if (total + blob.size > 128 * 1024 * 1024) throw new Error("图片总大小超过 128MB，请减少选择后分批导出。");
          files.current.set(item.id, { name: reportImageFileName(item, index), blob });
        } catch (reason) {
          if (cancelled) return;
          failed.push({
            name: `${item.className} · ${item.studentName}`,
            message: reason instanceof Error && reason.name !== "AbortError" ? reason.message : "读取超时，请重试。"
          });
        } finally {
          clearTimeout(timeout);
        }
      }
      if (cancelled) return;
      setReport(null);
      setFailures(failed);
      if (files.current.size) {
        setProgress("正在打包图片…");
        const blob = await reportImageArchive(
          reports.flatMap(item => (files.current.has(item.id) ? [files.current.get(item.id)!] : []))
        );
        if (cancelled) return;
        archiveUrl = URL.createObjectURL(blob);
        setArchive({ url: archiveUrl, count: files.current.size });
      }
      setProgress(
        `已生成 ${files.current.size} / ${reports.length} 份报告图片${failed.length ? `，失败 ${failed.length} 份。` : "。"}`
      );
    })()
      .catch(reason => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "图片打包失败，请重试。");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
      if (archiveUrl) URL.revokeObjectURL(archiveUrl);
    };
  }, [reports, attempt]);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-3 sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[calc(100dvh-2rem)] w-full min-w-0 max-w-xl flex-col overflow-hidden rounded-2xl bg-background shadow-xl"
      >
        <div className="flex items-center justify-between gap-3 border-b p-4">
          <h2 id={titleId} className="font-semibold">
            批量导出报告图片
          </h2>
          <Button
            ref={closeRef}
            aria-label="关闭批量导出窗口"
            className="min-h-11 min-w-11"
            size="icon"
            variant="ghost"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
        <div className="min-h-0 space-y-3 overflow-y-auto p-4">
          <p className="text-sm text-muted-foreground">
            所选 {reports.length} 份已发布报告，每份生成一张完整 PNG，打包为一个 ZIP。关闭窗口可停止后续处理。
          </p>
          <p role="status" className="break-words text-sm">
            {progress}
          </p>
          {error && (
            <p role="alert" className="break-words text-sm text-red-700">
              {error}
            </p>
          )}
          {failures.length > 0 && (
            <div role="alert" className="space-y-2 text-sm text-red-700">
              <p>以下报告未包含在压缩包中，可重试失败项：</p>
              <ul className="space-y-1">
                {failures.map((failure, index) => (
                  <li key={index} className="break-words">
                    {failure.name}：{failure.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2 border-t p-4">
          {archive && !busy && (
            <a
              href={archive.url}
              download={`学习报告图片-${archive.count}份.zip`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium"
            >
              <Download className="h-4 w-4" />
              下载 {archive.count} 份图片 ZIP
            </a>
          )}
          {!busy && (failures.length > 0 || error) && (
            <Button className="min-h-11" variant="outline" onClick={() => setAttempt(value => value + 1)}>
              重试失败项
            </Button>
          )}
          <Button className="min-h-11 sm:ml-auto" variant="outline" onClick={onClose}>
            {busy ? "取消并关闭" : "关闭"}
          </Button>
        </div>
      </div>
      {report && (
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
