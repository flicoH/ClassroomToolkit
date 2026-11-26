"use client";

import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import {
  consumeReportDraft,
  getPendingReportDraft,
  registerReportDraft,
  type PendingReportDraft,
  type ReportDraftKind
} from "@/lib/report-draft-recovery";
import { useAuthStore } from "@/store/authStore";

export function useReportDraftForm<T extends object>(kind: ReportDraftKind, createForm: () => T) {
  const [form, setForm] = useState(createForm);
  // An action can start a request immediately. Its 401 must see the edits even before React renders.
  const current = useRef<{ form: T; teacherId?: string; editedAt?: number }>({ form });
  const applied = useRef<PendingReportDraft | undefined>(undefined);
  const [cleanupFailed, setCleanupFailed] = useState(false);
  const [recovery, setRecovery] = useState<"loading" | "failed" | null>(null);

  useEffect(
    () =>
      registerReportDraft(kind, () => {
        const { teacherId, form, editedAt } = current.current;
        if (teacherId && editedAt !== undefined) return { teacherId, form, editedAt };
      }),
    [kind]
  );

  const edit = useCallback(<K extends keyof T>(key: K, update: SetStateAction<T[K]>, markEdited = true) => {
    const previous = current.current;
    const value = typeof update === "function" ? (update as (value: T[K]) => T[K])(previous.form[key]) : update;
    const form = { ...previous.form, [key]: value };
    current.current =
      markEdited && !Object.is(previous.form[key], value)
        ? { form, teacherId: previous.teacherId ?? useAuthStore.getState().user?.id, editedAt: Date.now() }
        : { ...previous, form };
    setForm(form);
  }, []);

  const initialize = useCallback((patch: Partial<T>) => {
    if (current.current.editedAt !== undefined) return;
    const form = { ...current.current.form, ...patch };
    current.current = { form };
    setForm(form);
  }, []);

  const readPending = useCallback(() => {
    const draft = getPendingReportDraft(kind, useAuthStore.getState().user?.id);
    return draft && draft.id !== applied.current?.id ? draft : undefined;
  }, [kind]);

  const cleanUp = useCallback(() => {
    const draft = applied.current;
    if (!draft) return;
    try {
      consumeReportDraft(kind, draft);
      applied.current = undefined;
      setCleanupFailed(false);
    } catch {
      setCleanupFailed(true);
    }
  }, [kind]);

  const reset = useCallback(
    (patch?: Partial<T>) => {
      const form = { ...createForm(), ...patch };
      current.current = { form };
      setForm(form);
      cleanUp();
    },
    [cleanUp, createForm]
  );

  useEffect(() => {
    if (applied.current) cleanUp();
  }, [form, cleanUp]);

  const apply = useCallback((pending: PendingReportDraft, form: T) => {
    applied.current = pending;
    current.current = { form, teacherId: useAuthStore.getState().user?.id, editedAt: Date.now() };
    setForm(form);
  }, []);

  const discardInvalid = useCallback(
    (pending: PendingReportDraft) => {
      applied.current = pending;
      cleanUp();
    },
    [cleanUp]
  );

  return {
    form,
    edit,
    initialize,
    reset,
    readPending,
    apply,
    discardInvalid,
    recovery,
    setRecovery,
    cleanupFailed,
    cleanUp
  };
}

export function ReportDraftRecoveryNotice({
  recovery,
  cleanupFailed,
  onRetry,
  onCleanup
}: {
  recovery: "loading" | "failed" | null;
  cleanupFailed: boolean;
  onRetry: () => void;
  onCleanup: () => void;
}) {
  if (!recovery && !cleanupFailed) return null;
  return (
    <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2 text-xs">
      {recovery === "loading" && <span>正在读取资料并恢复上次填写的报告…</span>}
      {recovery === "failed" && (
        <>
          <span>资料加载失败，已保留上次填写的报告。</span>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            重试恢复
          </Button>
        </>
      )}
      {cleanupFailed && (
        <>
          <span>本地暂存清理失败。</span>
          <Button type="button" size="sm" variant="outline" onClick={onCleanup}>
            重试清理
          </Button>
        </>
      )}
    </div>
  );
}
