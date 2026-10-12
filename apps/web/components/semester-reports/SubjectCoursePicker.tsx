"use client";
import { Button } from "@/components/ui/button";

type CourseDocument = { id: string; termId: string; subjectId: string; status: string; units?: string[] };
export function courseSelectionsFromScopes(
  value: Record<string, string>,
  documents: CourseDocument[],
  termId: string,
  subjectsOnly = false
): Array<{ subjectId: string; courseScope: string; manualContent?: string }> {
  return Object.entries(value).map(([subjectId, scope]) =>
    !subjectsOnly &&
    documents.some(
      document => document.termId === termId && document.subjectId === subjectId && document.status === "ready"
    )
      ? { subjectId, courseScope: scope }
      : { subjectId, courseScope: "", manualContent: subjectsOnly ? "" : scope }
  );
}

/** Each subject owns its scope, so identical lesson labels cannot select another subject. */
export function SubjectCoursePicker({
  subjects,
  documents,
  termId,
  period,
  value,
  onChange,
  subjectsOnly = false
}: {
  subjectsOnly?: boolean;
  subjects: Array<{ id: string; name: string }>;
  documents: CourseDocument[];
  termId: string;
  period: string;
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
}) {
  return (
    <section className="space-y-3 rounded-xl border p-3" aria-label="按学科选择报告课程">
      <h3 className="font-semibold">{subjectsOnly ? "选择报告学科" : "按学科选择课程"}</h3>
      <p className="text-xs text-muted-foreground">
        {subjectsOnly
          ? "勾选本次报告包含的学科，无需上传 PDF 或选择学科内容。"
          : "只显示已勾选学科的学习内容。有 PDF 可选择单元、课时或页码；没有 PDF 可由老师填写教学内容。"}
      </p>
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
                onChange={event => {
                  const next = { ...value };
                  if (event.target.checked) next[subject.id] = "";
                  else delete next[subject.id];
                  onChange(next);
                }}
              />
              {subject.name}
            </label>
            {!subjectsOnly && !sources.length && (
              <p className="text-xs text-muted-foreground">
                无需上传 PDF，勾选学科后可直接填写学生反馈；教学内容可稍后补充。
              </p>
            )}
            {!subjectsOnly && enabled && (
              <>
                <textarea
                  aria-label={`${subject.name}${sources.length ? "授课范围" : "教学内容"}`}
                  className="min-h-16 w-full rounded-md border bg-background p-2 text-sm"
                  maxLength={1000}
                  value={scope}
                  placeholder={
                    !sources.length
                      ? "教学内容选填，每行一项；也可先填写学生成长评价和课堂表现"
                      : period === "term"
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
                {sources.length > 0 && period === "term" && !scope.trim() && (
                  <p className="text-xs text-muted-foreground">已选择：本学科本学期全部内容</p>
                )}
              </>
            )}
          </fieldset>
        );
      })}
      {!subjects.length && <p className="text-sm text-muted-foreground">请先创建学科。</p>}
    </section>
  );
}
