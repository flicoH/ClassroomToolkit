"use client";

import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import request from "@/lib/request";
import { prepareStudentPhoto } from "./student-photo";

export type PhotoStudent = { id: string; photo?: string | null };
type Props = {
  classId: string;
  student: PhotoStudent & { name: string };
  onUpdated: (student: PhotoStudent) => void;
  onBusyChange: (busy: boolean) => void;
};

function photoError(error: unknown) {
  const response = (error as { response?: { status?: number; data?: { message?: string } } })?.response;
  if (response?.status === 413) return "照片处理后超过 256KB，请更换图片。";
  return response?.data?.message || (error instanceof Error ? error.message : "照片保存失败，请重试。");
}

/** The pending preview is separate from saved data, so failures never replace a student's photo. */
export function StudentPhotoEditor({ classId, student, onUpdated, onBusyChange }: Props) {
  const [pending, setPending] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const inFlight = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!pending) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(pending);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pending]);
  const run = async (action: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    onBusyChange(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (failure) {
      if (mounted.current) setError(photoError(failure));
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setBusy(false);
        onBusyChange(false);
      }
    }
  };
  const save = (remove = false) =>
    run(async () => {
      if (!remove && !pending) return;
      const data = new FormData();
      if (pending) data.append("file", pending);
      const updated = await request<PhotoStudent, PhotoStudent>({
        url: `/api/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(student.id)}/photo`,
        method: remove ? "DELETE" : "POST",
        ...(remove ? {} : { data })
      });
      onUpdated(updated);
      if (mounted.current) {
        setPending(null);
        setMessage(remove ? "照片已移除。" : "照片已保存。");
      }
    });
  return (
    <section aria-label="学生照片" className="space-y-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
      <p className="text-sm font-bold">学生照片</p>
      <div className="flex flex-wrap items-center gap-3">
        {preview || student.photo ? (
          <img
            src={preview || student.photo!}
            alt={`${student.name}的照片预览`}
            className="h-20 w-20 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 text-2xl text-blue-700">
            {student.name.slice(0, 1) || "学"}
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <Button
            type="button"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
            className="min-h-11 w-full bg-blue-600 px-5 font-semibold text-white shadow-sm hover:bg-blue-700 focus-visible:ring-blue-500 sm:w-auto"
          >
            <Upload aria-hidden="true" />
            {student.photo || pending ? "更换照片" : "上传照片"}
          </Button>
          <input
            ref={fileInput}
            aria-label="上传学生照片"
            type="file"
            accept="image/jpeg,image/png"
            disabled={busy}
            hidden
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file)
                void run(async () => {
                  const prepared = await prepareStudentPhoto(file);
                  if (mounted.current) setPending(prepared);
                });
            }}
          />
          <p className="text-xs text-slate-500">JPG、PNG，原图最大 2MB，自动缩小至最长边 512 像素。</p>
          {pending && (
            <p className="text-sm font-medium text-blue-700 dark:text-blue-300">照片已选择，点击“保存照片”完成上传。</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" className="min-h-11" disabled={busy || !pending} onClick={() => void save()}>
          保存照片
        </Button>
        {pending && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="min-h-11"
            disabled={busy}
            onClick={() => setPending(null)}
          >
            取消选择
          </Button>
        )}
        {student.photo && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            disabled={busy}
            onClick={() => setConfirmRemove(true)}
          >
            移除照片
          </Button>
        )}
      </div>
      <p role={error ? "alert" : "status"} className={error ? "text-sm text-rose-600" : "text-sm text-slate-500"}>
        {error || (busy ? "正在处理照片，请稍候…" : message)}
      </p>
      <ConfirmDialog
        open={confirmRemove}
        title="移除学生照片"
        description="移除后，学生列表将恢复姓名首字头像。已有报告保留生成时的照片。"
        confirmText="移除"
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false);
          void save(true);
        }}
      />
    </section>
  );
}
