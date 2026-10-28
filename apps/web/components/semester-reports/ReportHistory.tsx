"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import request from "@/lib/request";
import { createUuid } from "@/lib/id";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type HistoryEvent = { id: string; label?: string; createdAt: string };
type HistoryDetail = HistoryEvent & {
  description: string;
  currentVersion: string;
  changes: Array<{ field: string; before: string; after: string }>;
  canRestoreBefore: boolean;
  canRestoreAfter: boolean;
};
const messageFor = (error: unknown) => {
  const response = (error as { response?: { data?: { message?: unknown } } } | null)?.response;
  if (typeof response?.data?.message === "string") return response.data.message;
  return error instanceof Error && /[\u3400-\u9fff]/.test(error.message) ? error.message : "记录操作失败，请重试。";
};

/** Both report editors use the same private history and recovery flow. Versions
 * are loaded on demand; no raw snapshots or sharing credentials reach the UI. */
export function ReportHistory<T>({
  reportId,
  status,
  refreshKey,
  disabled = false,
  onRestored,
  onWorkingChange
}: {
  reportId: string;
  status: string;
  refreshKey?: object;
  disabled?: boolean;
  onRestored: (report: T) => void;
  onWorkingChange?: (working: boolean) => void;
}) {
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [detail, setDetail] = useState<HistoryDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [target, setTarget] = useState<"before" | "after" | null>(null);
  const epoch = useRef(0);
  const detailRequest = useRef(0);
  const base = `/api/semester-reports/reports/${reportId}/events`;
  const load = useCallback(async () => {
    const current = epoch.current;
    setLoading(true);
    setError("");
    try {
      // History and concurrency tokens must bypass the shared short-lived GET cache.
      const list = await request.get<HistoryEvent[], HistoryEvent[]>(base, { params: { refresh: createUuid() } });
      if (current === epoch.current) setEvents(list);
    } catch (error) {
      if (current === epoch.current) setError(messageFor(error));
    } finally {
      if (current === epoch.current) setLoading(false);
    }
  }, [base]);
  useEffect(() => {
    epoch.current += 1;
    detailRequest.current += 1;
    setDetail(null);
    setTarget(null);
    setEvents([]);
    void load();
    return () => {
      epoch.current += 1;
      detailRequest.current += 1;
    };
  }, [load, refreshKey]);
  async function view(eventId: string) {
    const current = epoch.current;
    const requestId = ++detailRequest.current;
    setError("");
    setDetail(null);
    setLoading(true);
    try {
      const result = await request.get<HistoryDetail, HistoryDetail>(`${base}/${encodeURIComponent(eventId)}`, {
        params: { refresh: createUuid() }
      });
      if (current === epoch.current && requestId === detailRequest.current) setDetail(result);
    } catch (error) {
      if (current === epoch.current && requestId === detailRequest.current) setError(messageFor(error));
    } finally {
      if (current === epoch.current && requestId === detailRequest.current) setLoading(false);
    }
  }
  async function restore() {
    if (!detail || !target || working || disabled) return;
    const current = epoch.current;
    setWorking(true);
    onWorkingChange?.(true);
    setError("");
    setTarget(null);
    try {
      const report = await request.post<T, T>(`${base}/${encodeURIComponent(detail.id)}/restore`, {
        side: target,
        expectedVersion: detail.currentVersion
      });
      if (current === epoch.current) {
        setDetail(null);
        onRestored(report);
        void load();
      }
    } catch (error) {
      if (current === epoch.current) {
        setError(messageFor(error));
        setDetail(null);
      }
    } finally {
      setWorking(false);
      onWorkingChange?.(false);
    }
  }
  return (
    <details className="rounded-lg border p-3 text-sm" open={status !== "draft"}>
      <summary className="cursor-pointer font-medium">流程记录</summary>
      {error && (
        <p className="mt-2 break-words text-destructive" role="alert">
          {error}
        </p>
      )}
      {loading && (
        <p className="mt-2 text-muted-foreground" role="status">
          正在加载流程记录…
        </p>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={loading || working || disabled}
        onClick={() => void load()}
        className="mt-2"
      >
        重新加载记录
      </Button>
      <ul className="mt-3 space-y-2">
        {events.map((event, index) => (
          <li
            key={event.id ?? index}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2"
          >
            <div className="min-w-0 break-words">
              <p>{event.label || "报告流程记录"}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(event.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
              </p>
            </div>
            {event.id && (
              <Button
                size="sm"
                variant="outline"
                disabled={loading || working || disabled}
                onClick={() => void view(event.id)}
              >
                查看记录
              </Button>
            )}
          </li>
        ))}
      </ul>
      {!loading && !events.length && !error && <p className="mt-2 text-muted-foreground">暂无流程记录。</p>}
      {detail && (
        <section className="mt-3 space-y-3 rounded-lg border bg-muted/30 p-3" aria-label="流程记录修改详情">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">{detail.label || "报告流程记录"}</h3>
            <Button size="sm" variant="ghost" onClick={() => setDetail(null)}>
              关闭记录详情
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{detail.description}</p>
          {detail.changes.map((change, index) => (
            <div key={index} className="space-y-2 rounded-md border p-3">
              <p className="font-medium">{change.field}</p>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">修改前</p>
                  <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{change.before}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">修改后</p>
                  <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{change.after}</p>
                </div>
              </div>
            </div>
          ))}
          {!detail.changes.length && (detail.canRestoreAfter || detail.canRestoreBefore) && (
            <p className="text-muted-foreground">本次未修改可显示的正文内容。</p>
          )}
          {status === "draft" || status === "published" ? (
            <div className="flex flex-wrap gap-2">
              {detail.canRestoreBefore && (
                <Button disabled={working || disabled} size="sm" variant="outline" onClick={() => setTarget("before")}>
                  恢复修改前
                </Button>
              )}
              {detail.canRestoreAfter && (
                <Button disabled={working || disabled} size="sm" variant="outline" onClick={() => setTarget("after")}>
                  恢复为草稿
                </Button>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">报告生成完成后才能恢复为草稿。</p>
          )}
        </section>
      )}
      {target &&
        createPortal(
          <div data-report-history-confirm>
            <ConfirmDialog
              open
              title="恢复报告版本"
              description={`${status === "published" ? "恢复会撤销发布，所有家长分享链接将失效。" : ""}选中的历史内容将保存为草稿，覆盖当前报告及尚未保存的编辑，包含学科、评价和课堂照片；分享链接不会恢复。本次恢复也会保留记录，供再次恢复。`}
              confirmText="确认恢复"
              onCancel={() => setTarget(null)}
              onConfirm={() => void restore()}
            />
          </div>,
          document.body
        )}
    </details>
  );
}
