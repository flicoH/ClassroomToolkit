"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface InputDialogProps {
  open: boolean;
  title: string;
  description?: string;
  initialValue?: string;
  placeholder?: string;
  confirmText?: string;
  onConfirm: (value: string) => void | Promise<void>;
  onCancel: () => void;
}

/** 应用内文本输入弹窗，替代浏览器原生 prompt。 */
export function InputDialog(props: InputDialogProps) {
  if (!props.open) return null;
  return (
    <OpenInputDialog
      title={props.title}
      description={props.description}
      initialValue={props.initialValue}
      placeholder={props.placeholder}
      confirmText={props.confirmText}
      onConfirm={props.onConfirm}
      onCancel={props.onCancel}
    />
  );
}

type OpenInputDialogProps = Omit<InputDialogProps, "open">;

/** 仅在弹窗打开时挂载，使每次打开都自然获得全新的表单状态。 */
function OpenInputDialog({
  title,
  description,
  initialValue = "",
  placeholder,
  confirmText = "确认",
  onConfirm,
  onCancel
}: OpenInputDialogProps) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(timer);
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = value.trim();
    if (!normalized || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(normalized);
    } catch {
      // 请求层负责显示具体错误，保留弹窗让用户可以重试。
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={submit}
        className="w-full max-w-[400px] rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
      >
        <h2 id={titleId} className="text-base font-bold">
          {title}
        </h2>
        {description && <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>}
        <Input
          ref={inputRef}
          value={value}
          maxLength={128}
          placeholder={placeholder}
          onChange={event => setValue(event.target.value)}
          className="mt-4"
        />
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={submitting} onClick={onCancel}>
            取消
          </Button>
          <Button type="submit" disabled={!value.trim() || submitting}>
            {submitting ? "处理中…" : confirmText}
          </Button>
        </div>
      </form>
    </div>
  );
}
