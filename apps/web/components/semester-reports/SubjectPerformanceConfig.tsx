"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { defaultPerformanceConfig, type PerformanceField } from "./performance-config";

type EditableField = { label: string; optionsText: string };
export function SubjectPerformanceConfig({
  subject,
  busy,
  onSave
}: {
  subject: { name: string; performanceConfig?: PerformanceField[] | null };
  busy: boolean;
  onSave: (fields: PerformanceField[]) => Promise<boolean>;
}) {
  const [fields, setFields] = useState<EditableField[]>(() =>
    (subject.performanceConfig ?? defaultPerformanceConfig()).map(field => ({
      label: field.label,
      optionsText: field.options.join("\n")
    }))
  );
  const [label, setLabel] = useState("");
  const [optionsText, setOptionsText] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const disabled = busy || saving;
  const optionsFrom = (text: string) =>
    text
      .split(/\r?\n/)
      .map(value => value.trim())
      .filter(Boolean);
  async function add() {
    if (disabled || savingRef.current) return;
    if (
      !label.trim() ||
      label.trim().length > 30 ||
      fields.some(field => field.label === label.trim()) ||
      fields.length >= 12
    ) {
      setError("项目名称不能为空或重复，最多 30 字，每门学科最多 12 项。");
      return;
    }
    const options = optionsFrom(optionsText);
    if (
      !options.length ||
      options.length > 20 ||
      options.some(value => value.length > 100) ||
      new Set(options).size !== options.length
    ) {
      setError("请填写 1—20 个不重复的下拉选项，每行一个，每个最多 100 字。");
      return;
    }
    const next = [...fields, { label: label.trim(), optionsText }];
    if (await persist(next)) {
      setFields(next);
      setLabel("");
      setOptionsText("");
    }
  }
  async function persist(next: EditableField[]): Promise<boolean> {
    if (disabled || savingRef.current) return false;
    const config = next.map(field => ({ label: field.label, options: optionsFrom(field.optionsText) }));
    if (
      config.some(
        field =>
          !field.options.length ||
          field.options.length > 20 ||
          field.options.some(value => value.length > 100) ||
          new Set(field.options).size !== field.options.length
      )
    ) {
      setError("每项需 1—20 个不重复的下拉选项，每个最多 100 字。");
      return false;
    }
    setError("");
    savingRef.current = true;
    setSaving(true);
    try {
      // Adding a field must publish it to the selected subject before accepting the next addition.
      const saved = await onSave(config);
      if (!saved) setError("课堂表现配置保存失败，请重试。新增内容已保留。");
      return saved;
    } catch (error) {
      setError(error instanceof Error ? error.message : "课堂表现配置保存失败，请重试。");
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  return (
    <section aria-label={`${subject.name}课堂表现配置`} className="space-y-3">
      <p className="text-xs text-muted-foreground">
        修改此学科的下拉选项，每行一个；新增项目会立即保存并显示在对应学科，可连续添加。修改已有选项后点击保存，已有评价会保留。
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((field, index) => (
          <label key={field.label} className="space-y-1 text-sm">
            {field.label}
            <textarea
              aria-label={`${subject.name} ${field.label}下拉选项`}
              className="min-h-24 w-full rounded-md border bg-background p-2"
              value={field.optionsText}
              disabled={disabled}
              onChange={event =>
                setFields(current =>
                  current.map((item, position) =>
                    position === index ? { ...item, optionsText: event.target.value } : item
                  )
                )
              }
            />
          </label>
        ))}
      </div>
      <div className="space-y-2 rounded-md border p-3">
        <Input
          aria-label="新增课堂表现名称"
          placeholder="新增项目名称，如同伴协作"
          maxLength={30}
          value={label}
          disabled={disabled}
          onChange={event => setLabel(event.target.value)}
        />
        <textarea
          aria-label="新增课堂表现下拉选项"
          placeholder="下拉选项，每行一个"
          className="min-h-20 w-full rounded-md border bg-background p-2"
          value={optionsText}
          disabled={disabled}
          onChange={event => setOptionsText(event.target.value)}
        />
        <Button variant="outline" disabled={disabled || fields.length >= 12} onClick={() => void add()}>
          添加课堂表现项目
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button disabled={disabled} onClick={() => void persist(fields)}>
        保存课堂表现配置
      </Button>
    </section>
  );
}
