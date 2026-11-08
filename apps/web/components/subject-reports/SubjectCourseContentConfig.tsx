"use client";

import { useState } from "react";
import request from "@/lib/request";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Subject } from "@/components/semester-reports-v2/types";
import { subjectLessonCategories } from "./SubjectLessonPdfFill";

/** 按学科暂存标题，显式保存后才更新报告工作台中的配置。 */
export function SubjectCourseContentConfig({
  subject,
  onSubject,
  announce
}: {
  /** 当前学科；父组件以学科 ID 重建编辑器，隔离未保存输入。 */
  subject: Subject;
  /** 使用服务端返回值同步标题配置，保留学科其他属性。 */
  onSubject: (subject: Subject) => void;
  /** 将校验与请求结果交给工作台统一通知。 */
  announce: (message: string) => void;
}) {
  const [titles, setTitles] = useState(subject.courseContentTitles ?? subjectLessonCategories);
  const [saving, setSaving] = useState(false);
  /** 校验采用与后端相同的文本边界；失败时保留输入供重试。 */
  async function save() {
    const normalized = titles.map(title => title.trim());
    if (
      normalized.some(title => !title || title.length > 40 || /[\r\n：:]/.test(title)) ||
      new Set(normalized).size !== normalized.length
    ) {
      announce("标题须为 1–40 字，不能重复或包含冒号、换行。");
      return;
    }
    setSaving(true);
    try {
      const updated = await request<Subject, Subject>(
        `/api/subject-reports/report-subjects/${subject.id}/course-content-titles`,
        {
          method: "PATCH",
          data: { courseContentTitles: normalized }
        }
      );
      onSubject(updated);
      announce("课程内容标题已保存");
    } catch {
      announce("保存课程内容标题失败，请重试。");
    } finally {
      setSaving(false);
    }
  }
  return (
    <section aria-label="配置学科课程内容标题" className="space-y-3 border-b pb-4">
      <h3 className="text-sm font-bold">课程内容标题</h3>
      <p className="text-xs text-muted-foreground">用于新建报告，最多 12 项。切换学科前请保存；已有报告正文保留。</p>
      {titles.map((title, index) => (
        <div key={index} className="flex gap-2">
          <Input
            aria-label={`课程内容标题 ${index + 1}`}
            maxLength={40}
            value={title}
            disabled={saving}
            onChange={event =>
              setTitles(current => current.map((item, i) => (i === index ? event.target.value : item)))
            }
          />
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => setTitles(current => current.filter((_, i) => i !== index))}
          >
            删除标题
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={saving || titles.length >= 12}
          onClick={() => setTitles(current => [...current, ""])}
        >
          新增标题
        </Button>
        <Button disabled={saving} onClick={() => void save()}>
          保存课程内容标题
        </Button>
      </div>
    </section>
  );
}
