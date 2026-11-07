"use client";

import { useEffect, useState } from "react";
import { Calendar, FileText, Trash2, Upload } from "lucide-react";
import { CoursePdfUpload } from "@/components/semester-reports-v2/ReportStudioControls";
import request from "@/lib/request";
import { SubjectPerformanceConfig } from "@/components/semester-reports/SubjectPerformanceConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { CourseDocument, Subject, Term } from "@/components/semester-reports-v2/types";

const base = "/api/subject-reports";
const documentStatus = {
  uploading: "上传中",
  queued: "等待解析",
  parsing: "正在解析",
  needs_review: "待核对章节",
  ready: "已确认",
  failed: "解析失败"
};

export function SubjectReportLibrary({
  terms,
  subjects,
  documents,
  initialTermId,
  initialSubjectId,
  onTerm,
  onSubject,
  onDeleteSubject,
  onDocuments,
  announce
}: {
  terms: Term[];
  subjects: Subject[];
  documents: CourseDocument[];
  initialTermId: string;
  initialSubjectId: string;
  onTerm: (term: Term) => void;
  onSubject: (subject: Subject) => void;
  onDeleteSubject: (id: string) => void;
  onDocuments: (documents: CourseDocument[]) => void;
  announce: (message: string) => void;
}) {
  const [termId, setTermId] = useState(initialTermId);
  const [subjectId, setSubjectId] = useState(initialSubjectId);
  const [configSubjectId, setConfigSubjectId] = useState(initialSubjectId);
  const [uploading, setUploading] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newTerm, setNewTerm] = useState({ name: "", startDate: "", endDate: "" });
  const [busy, setBusy] = useState(false);
  const [subjectToDelete, setSubjectToDelete] = useState<Subject | null>(null);
  const [deleteId, setDeleteId] = useState("");
  const [unitEdits, setUnitEdits] = useState<Record<string, string>>({});
  const subject = subjects.find(item => item.id === subjectId) ?? subjects[0];
  const configSubject = subjects.find(item => item.id === configSubjectId) ?? subjects[0];
  const term = terms.find(item => item.id === termId) ?? terms[0];
  const scoped = documents.filter(item => item.termId === term?.id && item.subjectId === subject?.id);
  const pending = scoped.some(item => item.status === "queued" || item.status === "parsing");

  useEffect(() => {
    if (!pending || busy) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void request<CourseDocument[], CourseDocument[]>(`${base}/course-documents`, { signal: controller.signal })
        .then(onDocuments)
        .catch(() => {
          if (!controller.signal.aborted) announce("课程资料状态更新失败，请手动刷新。");
        });
    }, 3000);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [announce, busy, documents, onDocuments, pending]);

  async function run(action: () => Promise<void>, error: string) {
    setBusy(true);
    try {
      await action();
    } catch {
      announce(error);
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    onDocuments(await request<CourseDocument[], CourseDocument[]>(`${base}/course-documents`));
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="grid gap-4 md:grid-cols-2">
        <section className="space-y-4 rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2.5 border-b pb-2.5">
            <Calendar className="h-7 w-7 shrink-0 text-indigo-600" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-bold">学期与学科设置</h2>
              <p className="text-xs text-muted-foreground">维护当前学校的学期日历以及任教学科列表。</p>
            </div>
          </div>
          <p className="text-xs font-bold text-muted-foreground">新建学科</p>
          <form
            className="flex gap-2"
            onSubmit={event => {
              event.preventDefault();
              void run(async () => {
                const created = await request<Subject, Subject>(`${base}/report-subjects`, {
                  method: "POST",
                  data: { name: newSubject.trim() }
                });
                onSubject(created);
                setSubjectId(created.id);
                setConfigSubjectId(created.id);
                setNewSubject("");
                announce("学科已添加");
              }, "添加学科失败，请重试。");
            }}
          >
            <Input
              aria-label="新建学科"
              placeholder="新增学科名称（如 戏剧、陶艺）"
              className="h-9 text-xs"
              value={newSubject}
              maxLength={100}
              onChange={event => setNewSubject(event.target.value)}
            />
            <Button
              size="sm"
              type="submit"
              className="h-9 bg-indigo-600 text-xs text-white hover:bg-indigo-700"
              disabled={busy || !newSubject.trim()}
            >
              + 添加学科
            </Button>
          </form>
          <div className="flex flex-wrap gap-1.5">
            {subjects.map(item => (
              <div key={item.id} className="flex items-center gap-1 rounded-lg border bg-muted/40 pl-2.5 text-xs">
                <span className="font-medium">{item.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 text-muted-foreground hover:text-destructive"
                  aria-label={`删除学科 ${item.name}`}
                  disabled={busy || uploading}
                  onClick={() => setSubjectToDelete(item)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <form
            className="space-y-2 border-t pt-3"
            onSubmit={event => {
              event.preventDefault();
              void run(async () => {
                const created = await request<Term, Term>(`${base}/report-terms`, { method: "POST", data: newTerm });
                onTerm(created);
                setTermId(created.id);
                setNewTerm({ name: "", startDate: "", endDate: "" });
                announce("学期已添加");
              }, "添加学期失败，请核对起止日期。");
            }}
          >
            <p className="text-xs font-bold text-muted-foreground">新建学期</p>
            <Input
              className="h-9 text-xs"
              aria-label="新建学期"
              placeholder="新增学期名称"
              required
              maxLength={100}
              value={newTerm.name}
              onChange={event => setNewTerm({ ...newTerm, name: event.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                className="h-8 min-w-0 text-xs"
                aria-label="学期开始日期"
                type="date"
                required
                value={newTerm.startDate}
                onChange={event => setNewTerm({ ...newTerm, startDate: event.target.value })}
              />
              <Input
                className="h-8 min-w-0 text-xs"
                aria-label="学期结束日期"
                type="date"
                required
                value={newTerm.endDate}
                onChange={event => setNewTerm({ ...newTerm, endDate: event.target.value })}
              />
            </div>
            <Button size="sm" type="submit" variant="outline" className="h-8 w-full text-xs" disabled={busy}>
              + 新建学期
            </Button>
          </form>
          <div className="space-y-1.5 pt-2">
            <span className="block text-[11px] font-bold text-muted-foreground">既有学期日历</span>
            {terms.map(item => (
              <div
                key={item.id}
                className="flex flex-wrap justify-between gap-1 rounded-lg border bg-muted/20 p-2 text-[11px]"
              >
                <span className="font-semibold">{item.name}</span>
                <span className="text-muted-foreground">
                  {item.startDate} 至 {item.endDate}
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className="space-y-4 rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between gap-2 border-b pb-2.5">
            <div className="flex items-center gap-2.5">
              <Upload className="h-7 w-7 shrink-0 text-indigo-600" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-bold">课程资料上传与章节核对</h2>
                <p className="text-xs text-muted-foreground">上传课本 PDF 后自动解析章节课时，供报告引用。</p>
              </div>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">最大 30MB</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-xs">
              <span>课程学期</span>
              <select
                className="h-9 w-full rounded-lg border bg-background px-2"
                disabled={uploading}
                value={term?.id ?? ""}
                onChange={event => setTermId(event.target.value)}
              >
                {!terms.length && <option value="">请先添加学期</option>}
                {terms.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span>课程学科</span>
              <select
                className="h-9 w-full rounded-lg border bg-background px-2"
                disabled={uploading}
                value={subject?.id ?? ""}
                onChange={event => setSubjectId(event.target.value)}
              >
                {!subjects.length && <option value="">请先添加学科</option>}
                {subjects.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <CoursePdfUpload
            disabled={busy || !term || !subject}
            uploading={uploading}
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file || !term || !subject) return;
              if (file.size > 30 * 1024 * 1024) {
                announce("PDF 不能超过 30MB。");
                return;
              }
              const data = new FormData();
              data.append("file", file);
              data.append("termId", term.id);
              data.append("subjectId", subject.id);
              setUploading(true);
              void run(async () => {
                await request(`${base}/course-documents`, { method: "POST", data, timeout: 120000 });
                await refresh();
                announce(`教材 PDF 已上传至「${term.name} · ${subject.name}」，请在解析后核对章节。`);
              }, "上传教材或刷新资料失败，请核对列表后重试。").finally(() => setUploading(false));
            }}
          />
          <div className="flex justify-end">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(refresh, "刷新课程资料失败。")}>
              刷新资料
            </Button>
          </div>
          {!scoped.length && <p className="text-xs text-muted-foreground">当前学期和学科暂无课程资料。</p>}
          {scoped.map(doc => (
            <article key={doc.id} className="space-y-2 rounded-xl border bg-muted/20 p-3.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
                  <div className="min-w-0">
                    <strong className="break-all">{doc.fileName}</strong>
                    {doc.pageCount != null && (
                      <p className="text-[11px] text-muted-foreground">
                        已提取 {doc.pageCount} 页 · {doc.units?.length ?? 0} 个单元或课时
                      </p>
                    )}
                  </div>
                </div>
                <span>{documentStatus[doc.status]}</span>
              </div>
              {doc.errorMessage && <p className="text-destructive">{doc.errorMessage}</p>}
              {(doc.status === "ready" || doc.status === "needs_review") && (
                <details open={doc.status === "needs_review" ? true : undefined}>
                  <summary className="cursor-pointer">核对章节{doc.pageCount ? ` · ${doc.pageCount} 页` : ""}</summary>
                  <label className="mt-2 block">
                    每行一个章节
                    <textarea
                      className="mt-1 w-full rounded-md border bg-background p-2"
                      value={unitEdits[doc.id] ?? (doc.units ?? []).join("\n")}
                      onChange={event => setUnitEdits({ ...unitEdits, [doc.id]: event.target.value })}
                    />
                  </label>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const units = unitEdits[doc.id]
                          ?.split(/\r?\n/)
                          .map(unit => unit.trim())
                          .filter(Boolean);
                        await request(`${base}/course-documents/${doc.id}/confirm`, {
                          method: "PATCH",
                          data: units ? { units } : {}
                        });
                        await refresh();
                        announce("章节已确认");
                      }, "章节确认失败，请重试。")
                    }
                  >
                    确认章节
                  </Button>
                </details>
              )}
              <div className="flex gap-2">
                {doc.status === "failed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await request(`${base}/course-documents/${doc.id}/retry`, { method: "POST" });
                        await refresh();
                      }, "重试解析失败。")
                    }
                  >
                    重试解析
                  </Button>
                )}
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDeleteId(doc.id)}>
                  移除资料
                </Button>
              </div>
            </article>
          ))}
        </section>
      </div>
      <section aria-label="配置学科课堂表现" className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <div>
            <h2 className="text-sm font-bold">配置学科课堂表现</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">报告评价使用此处保存的预设选项。</p>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <span className="font-medium text-muted-foreground">选择学科</span>
            <select
              aria-label="配置学科切换"
              value={configSubject?.id ?? ""}
              onChange={event => setConfigSubjectId(event.target.value)}
              className="h-8 rounded-xl border border-indigo-300 bg-card px-3 font-bold text-indigo-600 dark:border-indigo-700"
            >
              {!subjects.length && <option value="">请先添加学科</option>}
              {subjects.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {configSubject && (
          <SubjectPerformanceConfig
            key={configSubject.id}
            subject={configSubject}
            busy={busy}
            staged
            onSave={async performanceConfig => {
              const updated = await request<Subject, Subject>(
                `${base}/report-subjects/${configSubject.id}/performance-config`,
                {
                  method: "PATCH",
                  data: { performanceConfig }
                }
              );
              onSubject(updated);
              announce("课堂表现配置已保存");
              return true;
            }}
          />
        )}
      </section>
      <ConfirmDialog
        open={!!subjectToDelete}
        title={`删除学科「${subjectToDelete?.name ?? ""}」？`}
        description="删除后，学科报告和学期报告的新建流程将不再提供该学科。已有报告和课程资料会保留。"
        confirmText="删除学科"
        onCancel={() => setSubjectToDelete(null)}
        onConfirm={() => {
          if (!subjectToDelete) return;
          const { id } = subjectToDelete;
          setSubjectToDelete(null);
          void run(async () => {
            await request(`${base}/report-subjects/${encodeURIComponent(id)}`, { method: "DELETE" });
            const nextId = subjects.find(item => item.id !== id)?.id ?? "";
            setSubjectId(current => (current === id ? nextId : current));
            setConfigSubjectId(current => (current === id ? nextId : current));
            onDeleteSubject(id);
            announce("学科已删除");
          }, "删除学科失败，请重试。");
        }}
      />
      <ConfirmDialog
        open={!!deleteId}
        title="移除课程资料？"
        description="移除后，新报告无法再引用这份 PDF。"
        confirmText="移除"
        onCancel={() => setDeleteId("")}
        onConfirm={() => {
          const id = deleteId;
          setDeleteId("");
          void run(async () => {
            await request(`${base}/course-documents/${id}`, { method: "DELETE" });
            await refresh();
            announce("课程资料已移除");
          }, "移除资料失败，请重试。");
        }}
      />
    </div>
  );
}
