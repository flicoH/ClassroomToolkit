/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 * **********************************************************************************************
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  CircleUserRound,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import request from "@/lib/request";
import { cn } from "@/lib/utils";

type Gender = "男" | "女" | "";
type ModalType = "student" | "editStudent" | "import" | "class" | "editClass" | "groups" | null;

interface Student {
  id: string;
  name: string;
  studentNo: string;
  gender: Gender;
  group?: string;
}

interface ClassRoom {
  id: string;
  name: string;
  students: Student[];
  groups: string[];
}

interface SkippedImportStudent {
  rowNumber: number;
  name: string;
  studentNo: string;
  reason: string;
}

interface ImportStudentsResult {
  imported: Student[];
  skipped: SkippedImportStudent[];
}

const defaultClasses: ClassRoom[] = [
  {
    id: "grade-1",
    name: "一年级",
    groups: ["一组", "二组", "三组"],
    students: []
  },
  {
    id: "grade-2",
    name: "二年级",
    groups: ["一组", "二组", "三组"],
    students: []
  },
  {
    id: "grade-3",
    name: "三年级",
    groups: ["一组", "二组", "三组"],
    students: []
  }
];

const defaultClass = defaultClasses[0]!;

function getInitial(name: string) {
  return name.slice(0, 1) || "学";
}

function parseImportRows(text: string): Student[] {
  // 支持“姓名 学号 性别”的简单文本导入，空学号会自动生成。
  return text
    .split("\n")
    .map(row => row.trim())
    .filter(Boolean)
    .map((row, index) => {
      const [name = "未命名", maybeNo = "", maybeGender = ""] = row.split(/\s+/);
      const gender = maybeGender === "男" || maybeGender === "女" ? maybeGender : "";
      const studentNo = /^\d+$/.test(maybeNo) ? maybeNo : "";
      return {
        id: `${Date.now()}-${index}`,
        name,
        studentNo: studentNo || String(2026000 + index + 1),
        gender
      };
    });
}

function getStudentSubmitErrorMessage(error: unknown) {
  const responseMessage =
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null &&
    "data" in error.response &&
    typeof error.response.data === "object" &&
    error.response.data !== null &&
    "message" in error.response.data &&
    typeof error.response.data.message === "string"
      ? error.response.data.message
      : undefined;
  const message = responseMessage || (error instanceof Error ? error.message : "");
  if (message.includes("学号") && message.includes("已存在")) return "该学号已经存在，请更换学号";
  return message || "学生保存失败，请稍后重试";
}

function isStudentNoDuplicated(classRoom: ClassRoom, studentNo: string, excludeStudentId?: string | null) {
  if (!studentNo) return false;
  return classRoom.students.some(student => student.id !== excludeStudentId && student.studentNo === studentNo);
}

function compareStudentNo(left: string, right: string) {
  return left.localeCompare(right, "zh-CN", {
    numeric: true,
    sensitivity: "base"
  });
}

function createImportMessage(result: ImportStudentsResult) {
  const skippedStudentNos = result.skipped.map(item => item.studentNo).filter(Boolean);
  if (!result.skipped.length) return "";
  const skippedText = skippedStudentNos.length ? `重复学号：${skippedStudentNos.join("、")}` : "存在重复学号";
  return `已导入 ${result.imported.length} 名学生，跳过 ${result.skipped.length} 名。${skippedText}`;
}

function keepSkippedImportRows(text: string, skipped: SkippedImportStudent[]) {
  if (!skipped.length) return "";
  const skippedRows = new Set(skipped.map(item => item.rowNumber));
  return text
    .split("\n")
    .filter((_, index) => skippedRows.has(index + 1))
    .join("\n");
}

export function StudentManagement() {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [activeClassId, setActiveClassId] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [modal, setModal] = useState<ModalType>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [query, setQuery] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentNo, setStudentNo] = useState("");
  const [studentGender, setStudentGender] = useState<Gender>("");
  const [studentFormError, setStudentFormError] = useState("");
  const [className, setClassName] = useState("");
  const [importText, setImportText] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [groupName, setGroupName] = useState("");
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [studentDeleteTarget, setStudentDeleteTarget] = useState<{ classId: string; studentId: string } | null>(null);
  const [groupDeleteTarget, setGroupDeleteTarget] = useState<string | null>(null);

  const displayClasses = classes.length ? classes : defaultClasses;
  const activeBackendClass = classes.find(item => item.id === activeClassId) ?? classes[0] ?? null;
  const activeClass = activeBackendClass ?? defaultClass;
  const canUseBackendClass = !loading && Boolean(activeBackendClass);

  useEffect(() => {
    let mounted = true;
    // 页面打开时从后端 MySQL 读取班级和学生，避免刷新后回到静态示例数据。
    request<ClassRoom[], ClassRoom[]>("/api/classes")
      .then(data => {
        if (!mounted) return;
        const nextClasses = data;
        setClasses(nextClasses);
        setActiveClassId(current =>
          nextClasses.some(classRoom => classRoom.id === current) ? current : (nextClasses[0]?.id ?? "")
        );
        setErrorMessage("");
      })
      .catch(() => {
        if (!mounted) return;
        setErrorMessage("学生数据加载失败，请确认后端服务和 MySQL 已启动。");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!classes.length) return;
    setActiveClassId(current => (classes.some(classRoom => classRoom.id === current) ? current : classes[0]!.id));
  }, [classes]);

  // 当前班级学生列表：先按搜索过滤，再按学号方向排序。
  const visibleStudents = useMemo(() => {
    if (!activeClass) return [];
    const normalizedQuery = query.trim().toLowerCase();
    return [...activeClass.students]
      .filter(student => {
        return (
          !normalizedQuery ||
          student.name.toLowerCase().includes(normalizedQuery) ||
          student.studentNo.toLowerCase().includes(normalizedQuery)
        );
      })
      .sort((a, b) => {
        const result = compareStudentNo(a.studentNo, b.studentNo);
        return sortAsc ? result : -result;
      });
  }, [activeClass, query, sortAsc]);

  /** 所有学生/分组变更都通过这个 helper 只更新当前班级。 */
  const updateActiveClass = (updater: (classRoom: ClassRoom) => ClassRoom) => {
    if (!activeBackendClass) return;
    setClasses(current =>
      current.map(classRoom => (classRoom.id === activeBackendClass.id ? updater(classRoom) : classRoom))
    );
  };

  /** 关闭弹窗时清空草稿，避免下次打开沿用旧输入。 */
  const closeModal = () => {
    setModal(null);
    setStudentName("");
    setStudentNo("");
    setStudentGender("");
    setStudentFormError("");
    setEditingStudentId(null);
    setEditingClassId(null);
    setClassName("");
    setImportText("");
    setImportMessage("");
    setGroupName("");
    setGroupDeleteTarget(null);
  };

  /** 添加单个学生，未填写学号时按当前班级人数生成示例学号。 */
  const addStudent = async () => {
    const name = studentName.trim();
    const nextStudentNo = studentNo.trim();
    if (!name || !activeBackendClass) return;
    if (isStudentNoDuplicated(activeBackendClass, nextStudentNo)) {
      setStudentFormError("该学号已经存在，请更换学号");
      return;
    }

    try {
      const nextStudent = await request<Student, Student>({
        url: `/api/classes/${activeBackendClass.id}/students`,
        method: "POST",
        data: {
          name,
          studentNo: nextStudentNo || undefined,
          gender: studentGender || undefined
        }
      });
      updateActiveClass(classRoom => ({ ...classRoom, students: [...classRoom.students, nextStudent] }));
      closeModal();
    } catch (error) {
      setStudentFormError(getStudentSubmitErrorMessage(error));
    }
  };

  const openEditStudent = (student: Student) => {
    setEditingStudentId(student.id);
    setStudentName(student.name);
    setStudentNo(student.studentNo);
    setStudentGender(student.gender);
    setStudentFormError("");
    setModal("editStudent");
  };

  const updateStudent = async () => {
    const name = studentName.trim();
    const nextStudentNo = studentNo.trim();
    if (!name || !activeBackendClass || !editingStudentId) return;
    if (isStudentNoDuplicated(activeBackendClass, nextStudentNo, editingStudentId)) {
      setStudentFormError("该学号已经存在，请更换学号");
      return;
    }

    try {
      const updated = await request<Student, Student>({
        url: `/api/classes/${activeBackendClass.id}/students/${editingStudentId}`,
        method: "PATCH",
        data: {
          name,
          studentNo: nextStudentNo,
          gender: studentGender || undefined
        }
      });
      updateActiveClass(classRoom => ({
        ...classRoom,
        students: classRoom.students.map(student => (student.id === updated.id ? updated : student))
      }));
      closeModal();
    } catch (error) {
      setStudentFormError(getStudentSubmitErrorMessage(error));
    }
  };

  /** 删除学生需要二次确认，避免误触删除。 */
  const removeStudent = (studentId: string) => {
    if (!activeBackendClass) return;
    setStudentDeleteTarget({ classId: activeBackendClass.id, studentId });
  };

  /** 确认后按记录下来的班级和学生精确删除，避免弹窗期间状态变化导致删除失效。 */
  const confirmRemoveStudent = async () => {
    if (!studentDeleteTarget) return;
    await request<{ deleted: boolean }, { deleted: boolean }>({
      url: `/api/classes/${studentDeleteTarget.classId}/students/${studentDeleteTarget.studentId}`,
      method: "DELETE"
    });
    setClasses(current =>
      current.map(classRoom =>
        classRoom.id === studentDeleteTarget.classId
          ? {
              ...classRoom,
              students: classRoom.students.filter(student => student.id !== studentDeleteTarget.studentId)
            }
          : classRoom
      )
    );
    setStudentDeleteTarget(null);
  };

  const addClass = async () => {
    const name = className.trim();
    if (!name) return;
    const nextClass = await request<ClassRoom, ClassRoom>({ url: "/api/classes", method: "POST", data: { name } });
    setClasses(current => [...current, nextClass]);
    setActiveClassId(nextClass.id);
    closeModal();
  };

  const openEditClass = (classRoom: ClassRoom) => {
    setEditingClassId(classRoom.id);
    setClassName(classRoom.name);
    setModal("editClass");
  };

  const updateClass = async () => {
    const name = className.trim();
    if (!name || !editingClassId) return;
    const updated = await request<ClassRoom, ClassRoom>({
      url: `/api/classes/${editingClassId}`,
      method: "PATCH",
      data: { name }
    });
    setClasses(current => current.map(classRoom => (classRoom.id === updated.id ? updated : classRoom)));
    setActiveClassId(updated.id);
    closeModal();
  };

  const importStudents = async () => {
    if (!activeBackendClass || parseImportRows(importText).length === 0) return;
    const result = await request<ImportStudentsResult, ImportStudentsResult>({
      url: `/api/classes/${activeBackendClass.id}/students/import`,
      method: "POST",
      data: { text: importText }
    });
    if (result.imported.length) {
      updateActiveClass(classRoom => ({ ...classRoom, students: [...classRoom.students, ...result.imported] }));
    }
    if (result.skipped.length) {
      setImportMessage(createImportMessage(result));
      setImportText(keepSkippedImportRows(importText, result.skipped));
      return;
    }
    closeModal();
  };

  const addGroup = async () => {
    if (!activeBackendClass) return;
    const name = groupName.trim();
    if (!name || activeBackendClass.groups.includes(name)) return;
    const groups = await request<string[], string[]>({
      url: `/api/classes/${activeBackendClass.id}/groups`,
      method: "POST",
      data: { name }
    });
    updateActiveClass(classRoom => ({ ...classRoom, groups }));
    setGroupName("");
  };

  const updateStudentGroup = async (studentId: string, group?: string) => {
    if (!activeBackendClass) return;
    const updated = await request<Student, Student>({
      url: `/api/classes/${activeBackendClass.id}/students/${studentId}`,
      method: "PATCH",
      data: { group: group || null }
    });
    updateActiveClass(classRoom => ({
      ...classRoom,
      students: classRoom.students.map(student => (student.id === updated.id ? updated : student))
    }));
  };

  const deleteGroup = async (group: string) => {
    if (!activeBackendClass) return;
    const updatedClass = await request<ClassRoom, ClassRoom>({
      url: `/api/classes/${activeBackendClass.id}/groups/${group}`,
      method: "DELETE"
    });
    setClasses(current => current.map(classRoom => (classRoom.id === updatedClass.id ? updatedClass : classRoom)));
    setGroupDeleteTarget(null);
  };

  const deleteStudentName =
    classes
      .find(classRoom => classRoom.id === studentDeleteTarget?.classId)
      ?.students.find(student => student.id === studentDeleteTarget?.studentId)?.name ?? "未命名学生";

  return (
    <>
      <div className="flex h-full min-h-0 overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <aside className="flex h-full min-h-0 w-[230px] shrink-0 flex-col border-r border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/80">
          <div className="mb-6 flex shrink-0 items-center justify-between">
            <span className="text-sm font-bold text-slate-500 dark:text-slate-400">我的班级</span>
            <Button
              size="icon"
              variant="ghost"
              aria-label="新建班级"
              disabled={loading}
              onClick={() => setModal("class")}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {displayClasses.map(classRoom => (
              <div
                key={classRoom.id}
                className={cn(
                  "relative w-full rounded-xl border p-4 text-left transition",
                  activeClassId === classRoom.id
                    ? "border-blue-100 bg-blue-50 text-blue-700 shadow-sm dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300"
                    : "border-transparent hover:bg-slate-50 dark:hover:bg-slate-800"
                )}
              >
                <div
                  className={cn(
                    "absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-blue-600 transition",
                    activeClassId === classRoom.id ? "opacity-100" : "opacity-0"
                  )}
                />
                <div className="flex items-start justify-between gap-2">
                  <button
                    className="min-w-0 flex-1 text-left"
                    disabled={loading}
                    onClick={() => setActiveClassId(classRoom.id)}
                  >
                    <div className="font-bold">{classRoom.name}</div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                      <Users className="h-3.5 w-3.5" />
                      {classRoom.students.length} 名学生
                    </div>
                  </button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="编辑班级名称"
                    disabled={loading || !classes.some(item => item.id === classRoom.id)}
                    onClick={() => openEditClass(classRoom)}
                    className="h-8 w-8 shrink-0 text-slate-400 hover:bg-white/70 hover:text-blue-600 dark:hover:bg-slate-800"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="shrink-0 border-b border-slate-200 bg-white/90 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/90">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                  <UserPlus className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">{activeClass?.name}</h2>
                  <p className="text-sm font-medium text-slate-400">{activeClass?.students.length ?? 0} 名学生</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setSortAsc(current => !current)}>
                  <ArrowDownUp className="h-4 w-4" />
                  学号排序
                </Button>
                <Button
                  variant="ghost"
                  disabled={!canUseBackendClass}
                  onClick={() => setModal("import")}
                  className="text-blue-700 dark:text-blue-300"
                >
                  <Upload className="h-4 w-4" />
                  批量导入
                </Button>
                <Button variant="outline" disabled={!canUseBackendClass} onClick={() => setModal("groups")}>
                  <Users className="h-4 w-4" />
                  分组管理
                </Button>
                <Button
                  className="bg-blue-600 font-bold hover:bg-blue-700"
                  disabled={!canUseBackendClass}
                  onClick={() => setModal("student")}
                >
                  <UserPlus className="h-4 w-4" />
                  添加学生
                </Button>
              </div>
            </div>

            <div className="relative mt-4 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
              <Input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="搜索姓名/学号..."
                className="border-transparent bg-slate-50 pl-9 shadow-none dark:bg-slate-800"
              />
            </div>
            {(loading || errorMessage) && (
              <p className={cn("mt-3 text-sm font-semibold", errorMessage ? "text-rose-500" : "text-slate-400")}>
                {errorMessage || "正在加载学生数据..."}
              </p>
            )}
          </header>

          <main className="grid min-h-0 flex-1 auto-rows-max grid-cols-1 content-start items-start gap-2 overflow-y-auto p-3 pb-10 md:grid-cols-2 xl:grid-cols-3">
            {visibleStudents.map(student => (
              <article
                key={student.id}
                className="flex min-h-[58px] items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 shadow-sm transition hover:shadow-md dark:bg-slate-900"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                    {getInitial(student.name)}
                    <CircleUserRound className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-white text-blue-500 dark:bg-slate-900" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold">{student.name}</h3>
                    <p className="text-xs font-semibold text-slate-400">{student.studentNo}</p>
                    {student.group && <p className="text-xs text-blue-500">{student.group}</p>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="编辑学生"
                    onClick={() => openEditStudent(student)}
                    className="text-blue-500 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="删除学生"
                    onClick={() => removeStudent(student.id)}
                    className="text-rose-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </article>
            ))}

            {visibleStudents.length === 0 && (
              <div className="col-span-full flex min-h-[220px] items-center justify-center rounded-xl border border-dashed bg-white text-slate-400 dark:border-slate-800 dark:bg-slate-900">
                暂无学生
              </div>
            )}
          </main>
        </section>

        {modal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/20 p-6 backdrop-blur-sm">
            <div
              className={cn(
                "w-full overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900",
                modal === "groups" ? "max-w-[920px]" : "max-w-[640px]"
              )}
            >
              {modal === "student" && (
                <StudentModal
                  title="添加学生"
                  name={studentName}
                  studentNo={studentNo}
                  gender={studentGender}
                  errorMessage={studentFormError}
                  onNameChange={value => {
                    setStudentName(value);
                    setStudentFormError("");
                  }}
                  onNoChange={value => {
                    setStudentNo(value);
                    setStudentFormError("");
                  }}
                  onGenderChange={setStudentGender}
                  onClose={closeModal}
                  onConfirm={addStudent}
                />
              )}
              {modal === "editStudent" && (
                <StudentModal
                  title="编辑学生"
                  name={studentName}
                  studentNo={studentNo}
                  gender={studentGender}
                  errorMessage={studentFormError}
                  onNameChange={value => {
                    setStudentName(value);
                    setStudentFormError("");
                  }}
                  onNoChange={value => {
                    setStudentNo(value);
                    setStudentFormError("");
                  }}
                  onGenderChange={setStudentGender}
                  onClose={closeModal}
                  onConfirm={updateStudent}
                />
              )}
              {modal === "import" && (
                <ImportModal
                  value={importText}
                  message={importMessage}
                  onChange={value => {
                    setImportText(value);
                    setImportMessage("");
                  }}
                  onClose={closeModal}
                  onConfirm={importStudents}
                />
              )}
              {modal === "class" && (
                <ClassModal value={className} onChange={setClassName} onClose={closeModal} onConfirm={addClass} />
              )}
              {modal === "editClass" && (
                <ClassModal
                  title="编辑班级名称"
                  value={className}
                  onChange={setClassName}
                  onClose={closeModal}
                  onConfirm={updateClass}
                />
              )}
              {modal === "groups" && activeClass && (
                <GroupModal
                  groups={activeClass.groups}
                  students={activeClass.students}
                  value={groupName}
                  onChange={setGroupName}
                  onClose={closeModal}
                  onAdd={addGroup}
                  onAssign={updateStudentGroup}
                  onRemove={studentId => updateStudentGroup(studentId)}
                  onDeleteGroup={setGroupDeleteTarget}
                />
              )}
            </div>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={Boolean(studentDeleteTarget)}
        title="删除学生"
        description={`确定删除学生「${deleteStudentName}」吗？删除后不可恢复。`}
        confirmText="删除"
        onConfirm={confirmRemoveStudent}
        onCancel={() => setStudentDeleteTarget(null)}
      />
      <ConfirmDialog
        open={Boolean(groupDeleteTarget)}
        title="删除分组"
        description={`确定删除分组「${groupDeleteTarget ?? ""}」吗？该分组内学生会变为未分组。`}
        confirmText="删除"
        onConfirm={() => groupDeleteTarget && void deleteGroup(groupDeleteTarget)}
        onCancel={() => setGroupDeleteTarget(null)}
      />
    </>
  );
}

interface StudentModalProps {
  title: string;
  name: string;
  studentNo: string;
  gender: Gender;
  errorMessage?: string;
  onNameChange: (value: string) => void;
  onNoChange: (value: string) => void;
  onGenderChange: (value: Gender) => void;
  onClose: () => void;
  onConfirm: () => void;
}

function StudentModal({
  title,
  name,
  studentNo,
  gender,
  errorMessage,
  onNameChange,
  onNoChange,
  onGenderChange,
  onClose,
  onConfirm
}: StudentModalProps) {
  return (
    <>
      <ModalHeader title={title} onClose={onClose} />
      <div className="space-y-5 p-7">
        <label className="block space-y-2">
          <span className="text-sm font-bold">姓名 *</span>
          <Input value={name} onChange={event => onNameChange(event.target.value)} placeholder="请输入姓名" />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-bold">学号</span>
          <Input
            value={studentNo}
            onChange={event => onNoChange(event.target.value)}
            placeholder="请输入学号（可选）"
          />
        </label>
        <div className="space-y-3">
          <span className="text-sm font-bold">性别</span>
          <div className="flex gap-6">
            {(["男", "女"] as const).map(item => (
              <label key={item} className="flex items-center gap-2 text-sm font-medium">
                <input type="radio" checked={gender === item} onChange={() => onGenderChange(item)} />
                {item}
              </label>
            ))}
          </div>
        </div>
        {errorMessage && (
          <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-600 dark:border-rose-950 dark:bg-rose-950/30 dark:text-rose-300">
            {errorMessage}
          </div>
        )}
      </div>
      <ModalFooter
        onClose={onClose}
        onConfirm={onConfirm}
        confirmText="确定"
        disabled={!name.trim() || Boolean(errorMessage)}
      />
    </>
  );
}

function ImportModal({
  value,
  message,
  onChange,
  onClose,
  onConfirm
}: {
  value: string;
  message?: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <ModalHeader title="批量导入学生" onClose={onClose} />
      <div className="space-y-5 p-7">
        <div className="rounded-xl bg-blue-50 p-4 text-sm leading-7 text-slate-600 dark:bg-blue-950/40 dark:text-slate-300">
          <p>每行代表一名学生，格式：姓名 [学号] [性别]。</p>
          <p>例如：</p>
          <p>张三 2023001 男</p>
          <p>王丽 2023002 女</p>
        </div>
        <textarea
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder={"在此粘贴学生名单，每行一个...\n李宇春\n周笔畅\n张靓颖\n陈楚生\n苏醒\n魏晨\n"}
          className="min-h-[190px] w-full resize-none rounded-xl border border-slate-200 bg-white p-4 text-sm outline-none transition focus:border-blue-300 dark:border-slate-800 dark:bg-slate-950"
        />
        {message && (
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 dark:border-amber-950 dark:bg-amber-950/30 dark:text-amber-300">
            {message}
          </div>
        )}
      </div>
      <ModalFooter onClose={onClose} onConfirm={onConfirm} confirmText="完成导入" disabled={!value.trim()} />
    </>
  );
}

function ClassModal({
  title = "新建班级",
  value,
  onChange,
  onClose,
  onConfirm
}: {
  title?: string;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <ModalHeader title={title} onClose={onClose} />
      <div className="p-7">
        <label className="block space-y-2">
          <span className="text-sm font-bold">班级名称</span>
          <Input value={value} onChange={event => onChange(event.target.value)} placeholder="请输入班级名称" />
        </label>
      </div>
      <ModalFooter onClose={onClose} onConfirm={onConfirm} confirmText="确定" disabled={!value.trim()} />
    </>
  );
}

function GroupModal({
  groups,
  students,
  value,
  onChange,
  onClose,
  onAdd,
  onAssign,
  onRemove,
  onDeleteGroup
}: {
  groups: string[];
  students: Student[];
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onAdd: () => void;
  onAssign: (studentId: string, group: string) => Promise<void>;
  onRemove: (studentId: string) => Promise<void>;
  onDeleteGroup: (group: string) => void;
}) {
  const [selectedGroup, setSelectedGroup] = useState(groups[0] ?? "");

  useEffect(() => {
    setSelectedGroup(current => (current && groups.includes(current) ? current : (groups[0] ?? "")));
  }, [groups]);

  const groupStudents = useMemo(
    () => students.filter(student => student.group === selectedGroup),
    [selectedGroup, students]
  );

  const assignableStudents = useMemo(
    () => students.filter(student => student.group !== selectedGroup),
    [selectedGroup, students]
  );

  return (
    <>
      <div className="flex items-center justify-between border-b border-slate-100 p-6 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold">分组管理</h2>
            <p className="text-sm font-medium text-slate-500">管理班级内的学生小组</p>
          </div>
        </div>
        <Button size="icon" variant="ghost" aria-label="关闭" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="max-h-[72vh] min-h-[420px] space-y-5 overflow-y-auto p-7">
        <div className="flex gap-2">
          <Input
            value={value}
            onChange={event => onChange(event.target.value)}
            placeholder="输入分组名，点击右侧按钮添加"
          />
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={onAdd} disabled={!value.trim()}>
            <Plus className="h-4 w-4" />
            添加
          </Button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {groups.map(group => {
            const count = students.filter(student => student.group === group).length;
            const active = selectedGroup === group;
            return (
              <button
                key={group}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-sm font-semibold transition",
                  active
                    ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300"
                    : "border-slate-200 bg-slate-50 hover:bg-white dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900"
                )}
                onClick={() => setSelectedGroup(group)}
              >
                <span className="block truncate">{group}</span>
                <span className="mt-1 block text-xs font-medium text-slate-400">{count} 名学生</span>
              </button>
            );
          })}
          {groups.length === 0 && (
            <div className="col-span-full py-16 text-center text-sm text-slate-400">暂无分组</div>
          )}
        </div>

        {selectedGroup && (
          <div className="flex items-center justify-between rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 dark:border-rose-950 dark:bg-rose-950/30">
            <div>
              <p className="text-sm font-bold text-rose-600 dark:text-rose-300">删除当前分组</p>
              <p className="text-xs font-medium text-rose-400">学生不会被删除，只会移出该分组</p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-rose-600 hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-950"
              onClick={() => selectedGroup && onDeleteGroup(selectedGroup)}
            >
              <Trash2 className="h-4 w-4" />
              删除
            </Button>
          </div>
        )}

        <div className="grid min-h-0 gap-4 lg:grid-cols-2">
          <StudentGroupList
            title={`${selectedGroup || "未选择分组"}成员`}
            emptyText={selectedGroup ? "该分组暂无学生" : "请先选择或新增分组"}
            students={selectedGroup ? groupStudents : []}
            actionText="移出"
            actionIcon="remove"
            onAction={student => void onRemove(student.id)}
          />
          <StudentGroupList
            title="可分配学生"
            emptyText={selectedGroup ? "暂无可分配学生" : "请先选择或新增分组"}
            students={selectedGroup ? assignableStudents : []}
            actionText="分配"
            actionIcon="assign"
            onAction={student => void onAssign(student.id, selectedGroup)}
          />
        </div>
      </div>
    </>
  );
}

function StudentGroupList({
  title,
  emptyText,
  students,
  actionText,
  actionIcon,
  onAction
}: {
  title: string;
  emptyText: string;
  students: Student[];
  actionText: string;
  actionIcon: "assign" | "remove";
  onAction: (student: Student) => void;
}) {
  return (
    <section className="min-h-0 rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold">{title}</h3>
        <span className="text-xs font-semibold text-slate-400">{students.length} 人</span>
      </div>
      <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
        {students.map(student => (
          <div
            key={student.id}
            className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 shadow-sm dark:bg-slate-900"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{student.name}</p>
              <p className="text-xs font-semibold text-slate-400">
                {student.studentNo}
                {student.group ? ` · ${student.group}` : " · 未分组"}
              </p>
            </div>
            <Button size="sm" variant="outline" className="shrink-0" onClick={() => onAction(student)}>
              {actionIcon === "assign" ? <Plus className="h-4 w-4" /> : <X className="h-4 w-4" />}
              {actionText}
            </Button>
          </div>
        ))}
        {students.length === 0 && <div className="py-12 text-center text-sm text-slate-400">{emptyText}</div>}
      </div>
    </section>
  );
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 px-7 py-5 dark:border-slate-800">
      <h2 className="text-2xl font-bold">{title}</h2>
      <Button size="icon" variant="ghost" aria-label="关闭" onClick={onClose}>
        <X className="h-5 w-5" />
      </Button>
    </div>
  );
}

function ModalFooter({
  onClose,
  onConfirm,
  confirmText,
  disabled
}: {
  onClose: () => void;
  onConfirm: () => void;
  confirmText: string;
  disabled: boolean;
}) {
  return (
    <div className="flex justify-end gap-3 border-t border-slate-100 px-7 py-5 dark:border-slate-800">
      <Button variant="ghost" onClick={onClose}>
        取消
      </Button>
      <Button className="bg-blue-600 hover:bg-blue-700" onClick={onConfirm} disabled={disabled}>
        {confirmText}
      </Button>
    </div>
  );
}
