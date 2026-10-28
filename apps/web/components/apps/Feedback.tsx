"use client";

import { useState } from "react";
import { MessageSquareHeart, Send } from "lucide-react";
import toast from "react-hot-toast";
import request from "@/lib/request";
import { Button } from "@/components/ui/button";

const MAX_LENGTH = 2000;

/** 教师意见提交窗口；提交成功后清空内容，便于继续补充其他建议。 */
export function Feedback() {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const trimmed = content.trim();

  async function submit() {
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await request("/api/feedback", {
        method: "POST",
        data: { content: trimmed }
      });
      setContent("");
      toast.success("感谢您的意见，我们已收到");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full min-h-[360px] flex-col bg-slate-50/80 p-5 dark:bg-slate-950/50 sm:p-7">
      <div className="mb-5 flex items-start gap-3">
        <div className="rounded-2xl bg-blue-100 p-3 text-blue-600 dark:bg-blue-950 dark:text-blue-300">
          <MessageSquareHeart className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">告诉我们您的想法</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            欢迎提出功能建议或使用中遇到的问题，您的意见会直接发送给管理员。
          </p>
        </div>
      </div>

      <label htmlFor="feedback-content" className="mb-2 text-sm font-medium">
        意见内容
      </label>
      <textarea
        id="feedback-content"
        value={content}
        maxLength={MAX_LENGTH}
        placeholder="请输入您对系统的意见或建议…"
        className="min-h-40 flex-1 resize-none rounded-xl border bg-white p-4 text-sm leading-6 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:bg-slate-900"
        onChange={event => setContent(event.target.value)}
      />
      <div className="mt-3 flex items-center justify-between gap-4">
        <span className="text-xs text-muted-foreground">
          {content.length} / {MAX_LENGTH}
        </span>
        <Button disabled={!trimmed || submitting} onClick={submit}>
          <Send className="mr-2 h-4 w-4" />
          {submitting ? "提交中…" : "提交意见"}
        </Button>
      </div>
    </div>
  );
}
