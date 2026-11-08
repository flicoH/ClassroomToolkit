"use client";

import { useEffect, useRef, useState } from "react";
import request from "@/lib/request";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

/** 未配置标题时保留原四项，同时作为 PDF 分类结果的索引顺序。 */
export const subjectLessonCategories = ["核心词汇", "核心句型 / 对话", "朗读或表达", "课堂练习与任务"];

/** 共用课程字段视图：按传入标题顺序绑定值，不在展示层改写正文。 */
export function SubjectLessonFields({
  id,
  values,
  titles = subjectLessonCategories,
  onChange
}: {
  /** 同页多个课次的表单标识前缀，关联 label 与输入框。 */
  id: string;
  /** 与标题按索引一一对应的教学内容。 */
  values: string[];
  /** 省略时使用历史四项；空数组表示教师主动移除全部标题。 */
  titles?: string[];
  /** 只更新目标字段，原文序列化交给工作台处理。 */
  onChange: (index: number, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {titles.map((category, index) => (
        <div key={category}>
          <label htmlFor={`${id}-${index}`} className="text-[11px] font-medium text-muted-foreground">
            {category}
          </label>
          <Textarea
            id={`${id}-${index}`}
            value={values[index] ?? ""}
            onChange={event => onChange(index, event.target.value)}
            placeholder={`填写${category}...`}
            className="mt-1 min-h-[50px] text-xs"
          />
        </div>
      ))}
    </div>
  );
}

const categories = [
  /词汇|单词|vocabulary/i,
  /句型|对话|dialogue|sentence/i,
  /朗读|讲述|表达|read aloud|retell/i,
  /练习|任务|活动|practice|exercise|activity/i
];
/** 课程范围预览仅带入教学内容，不表示学生已经掌握。 */
type ScopePreview = { learningContents: Array<{ text: string; section?: string }> };

/** 新报告按学期学科预览，已有草稿按已鉴权报告归属读取原资料。 */
export function SubjectLessonPdfFill({
  termId,
  subjectId,
  period,
  draftId,
  scope,
  onScopeChange,
  units,
  hasDocuments,
  onFill,
  onOpenLibrary
}: {
  /** 新报告引用资料的学期归属。 */
  termId: string;
  /** 新报告引用资料的学科归属。 */
  subjectId: string;
  /** 传给预览接口的报告周期。 */
  period: string;
  /** 已有草稿 ID；存在时由服务端按报告读取原归属，允许停用配置。 */
  draftId?: string;
  /** 教师选择的章节或页码范围。 */
  scope: string;
  /** 通知父组件保存该课次的资料范围。 */
  onScopeChange: (value: string) => void;
  /** 服务端已确认的章节列表。 */
  units: string[];
  /** 当前归属下是否有可用资料，决定能否请求预览。 */
  hasDocuments: boolean;
  /** 按照四个默认类别回传原文，教师手改保护由父组件负责。 */
  onFill: (groups: string[][]) => void;
  /** 打开资料设置页的可选入口。 */
  onOpenLibrary?: () => void;
}) {
  const selectedUnit = units.includes(scope) ? scope : "";
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [source, setSource] = useState<string[]>([]);
  // 只接受最新预览的结果，组件卸载时也让在途请求失效。
  const sequence = useRef(0);

  useEffect(
    () => () => {
      sequence.current += 1;
    },
    []
  );

  /** 章节与页码共用预览，过期请求不能覆盖教师刚切换的范围。 */
  async function fill(value: string) {
    const courseScope = value.trim();
    if (!courseScope || !hasDocuments) return;
    const current = ++sequence.current;
    setBusy(true);
    setSource([]);
    setNotice("正在读取课程内容…");
    try {
      const base = "/api/subject-reports";
      const endpoint = draftId
        ? `${base}/reports/${encodeURIComponent(draftId)}/course-documents/preview-scope`
        : `${base}/course-documents/preview-scope`;
      const result = await request<ScopePreview, ScopePreview>(endpoint, {
        method: "POST",
        data: draftId ? { courseScope } : { termId, subjectId, period, reportVersion: "v1", courseScope }
      });
      if (current !== sequence.current) return;
      const groups: string[][] = [[], [], [], []];
      const original: string[] = [];
      for (const item of result.learningContents ?? []) {
        let category = categories.findIndex(pattern => pattern.test(item.section ?? ""));
        for (const line of item.text
          .split(/\r?\n/)
          .map(text => text.trim())
          .filter(Boolean)) {
          original.push(line);
          const heading = /^([^：:]{1,30})[：:]\s*(.*)$/.exec(line);
          const match = heading ? categories.findIndex(pattern => pattern.test(heading[1] ?? "")) : -1;
          if (match >= 0) category = match;
          const text = match >= 0 ? heading?.[2]?.trim() : line;
          if (text) groups[category]?.push(text);
        }
      }
      onFill(groups);
      setSource(original);
      setNotice(
        original.length
          ? "已更新 PDF 带入内容，手动填写和修改的内容已保留。可展开原文核对。"
          : "所选范围暂无可填写的内容。"
      );
    } catch {
      if (current === sequence.current) setNotice("读取课程内容失败，请核对章节或页码后重试。");
    } finally {
      if (current === sequence.current) setBusy(false);
    }
  }

  return (
    <details className="mb-3 rounded-lg border bg-background p-2.5 text-xs">
      <summary className="cursor-pointer font-medium">从课程 PDF 填入</summary>
      <div className="mt-2 space-y-2">
        {hasDocuments ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {!!units.length && (
                <label className="block space-y-1">
                  <span>选择 PDF 章节</span>
                  <select
                    aria-label="选择 PDF 章节"
                    className="block h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                    value={selectedUnit}
                    onChange={event => {
                      const unit = event.target.value;
                      onScopeChange(unit);
                      void fill(unit);
                    }}
                  >
                    <option value="" disabled>
                      请选择章节
                    </option>
                    {units.map(unit => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="block space-y-1">
                <span>或输入页码</span>
                <Input
                  value={selectedUnit ? "" : scope}
                  maxLength={1000}
                  placeholder="例如：第3-5页"
                  onChange={event => {
                    sequence.current += 1;
                    onScopeChange(event.target.value);
                    setBusy(false);
                    setSource([]);
                    setNotice("");
                  }}
                  onKeyDown={event => {
                    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                    event.preventDefault();
                    if (!busy) void fill(scope);
                  }}
                  className="h-8 text-xs"
                />
              </label>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || !scope.trim()}
              onClick={() => void fill(scope)}
            >
              填入本课内容
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground">该学期和学科暂无已确认的 PDF，可直接手填。</p>
        )}
        {onOpenLibrary && (
          <Button type="button" size="sm" variant="ghost" onClick={onOpenLibrary}>
            前往课程资料
          </Button>
        )}
        {notice && <p role="status">{notice}</p>}
        {!!source.length && (
          <details>
            <summary className="cursor-pointer">查看课程原文</summary>
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words">{source.join("\n")}</pre>
          </details>
        )}
      </div>
    </details>
  );
}
