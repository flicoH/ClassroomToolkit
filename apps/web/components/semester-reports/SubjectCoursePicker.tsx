"use client";
import { Button } from "@/components/ui/button";

/** Each subject owns its scope, so identical lesson labels cannot select another subject. */
export function SubjectCoursePicker({
  subjects,
  documents,
  termId,
  period,
  value,
  onChange
}: {
  subjects: Array<{ id: string; name: string }>;
  documents: Array<{ id: string; termId: string; subjectId: string; status: string; units?: string[] }>;
  termId: string;
  period: string;
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
}) {
  return (
    <section className="space-y-3 rounded-xl border p-3" aria-label="按学科选择报告课程">
      <h3 className="font-semibold">按学科选择课程</h3>
      <p className="text-xs text-muted-foreground">只显示已勾选学科的学习内容。每门学科可分别选择单元、课时或页码。</p>
      {subjects.map(subject => {
        const sources = documents.filter(
          document => document.termId === termId && document.subjectId === subject.id && document.status === "ready"
        );
        const enabled = Object.hasOwn(value, subject.id);
        const scope = value[subject.id] ?? "";
        const units = [...new Set(sources.flatMap(document => document.units ?? []))];
        return (
          <fieldset key={subject.id} className="min-w-0 space-y-3 rounded-lg border p-3">
            <label className="flex min-h-11 items-center gap-2 font-medium">
              <input
                type="checkbox"
                aria-label={`选择${subject.name}课程`}
                checked={enabled}
                disabled={!sources.length && !enabled}
                onChange={event => {
                  const next = { ...value };
                  if (event.target.checked) next[subject.id] = "";
                  else delete next[subject.id];
                  onChange(next);
                }}
              />
              {subject.name}
            </label>
            {!sources.length && <p className="text-xs text-muted-foreground">暂无已确认课程资料，请先上传并确认。</p>}
            {enabled && (
              <>
                <textarea
                  aria-label={`${subject.name}授课范围`}
                  className="min-h-16 w-full rounded-md border bg-background p-2 text-sm"
                  maxLength={1000}
                  value={scope}
                  placeholder={
                    period === "term"
                      ? "留空包含本学科本学期全部内容，或填写单元、课时、页码"
                      : "选择或填写本学科本周期授课范围"
                  }
                  onChange={event => onChange({ ...value, [subject.id]: event.target.value })}
                />
                <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
                  {units.map(unit => {
                    const selected = scope
                      .split(/[，、;；\n]+/)
                      .map(value => value.trim())
                      .filter(Boolean);
                    return (
                      <Button
                        key={unit}
                        size="sm"
                        variant={selected.includes(unit) ? "default" : "outline"}
                        aria-label={`${subject.name} ${unit}`}
                        onClick={() => {
                          const parent = /^(Unit\d+) 第\d+课$/.exec(unit)?.[1];
                          const next = selected.includes(unit)
                            ? selected.filter(item => item !== unit)
                            : [
                                ...selected.filter(item => (parent ? item !== parent : !item.startsWith(`${unit} 第`))),
                                unit
                              ];
                          onChange({ ...value, [subject.id]: next.join("、") });
                        }}
                      >
                        {unit}
                      </Button>
                    );
                  })}
                </div>
                {period === "term" && !scope.trim() && (
                  <p className="text-xs text-muted-foreground">已选择：本学科本学期全部内容</p>
                )}
              </>
            )}
          </fieldset>
        );
      })}
      {!subjects.length && <p className="text-sm text-muted-foreground">请先创建学科并确认课程资料。</p>}
    </section>
  );
}
