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
type ModalType = "student" | "editStudent" | "import" | "class" | "groups" | null;

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

export function StudentManagement() {
  const [classes, setClasses] = useState<ClassRoom[]>(defaultClasses);
  const [activeClassId, setActiveClassId] = useState(defaultClass.id);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [modal, setModal] = useState<ModalType>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [query, setQuery] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentNo, setStudentNo] = useState("");
  const [studentGender, setStudentGender] = useState<Gender>("");
  const [className, setClassName] = useState("");
  const [importText, setImportText] = useState("");
  const [groupName, setGroupName] = useState("");
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [studentDeleteTarget, setStudentDeleteTarget] = useState<{ classId: string; studentId: string } | null>(null);

  const activeClass = classes.find(item => item.id === activeClassId) ?? defaultClass;

  useEffect(() => {
    let mounted = true;
    // 页面打开时从后端 MySQL 读取班级和学生，避免刷新后回到静态示例数据。
    request<ClassRoom[], ClassRoom[]>("/api/classes")
      .then(data => {
        if (!mounted) return;
        const nextClasses = data.length > 0 ? data : defaultClasses;
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
        return sortAsc ? a.studentNo.localeCompare(b.studentNo) : b.studentNo.localeCompare(a.studentNo);
      });
  }, [activeClass, query, sortAsc]);

  /** 所有学生/分组变更都通过这个 helper 只更新当前班级。 */
  const updateActiveClass = (updater: (classRoom: ClassRoom) => ClassRoom) => {
    setClasses(current =>
      current.map(classRoom => (classRoom.id === activeClass?.id ? updater(classRoom) : classRoom))
    );
  };

  /** 关闭弹窗时清空草稿，避免下次打开沿用旧输入。 */
  const closeModal = () => {
    setModal(null);
    setStudentName("");
    setStudentNo("");
    setStudentGender("");
    setEditingStudentId(null);
    setClassName("");
    setImportText("");
    setGroupName("");
  };

  /** 添加单个学生，未填写学号时按当前班级人数生成示例学号。 */
  const addStudent = async () => {
    const name = studentName.trim();
    if (!name || !activeClass) return;
    const nextStudent = await request<Student, Student>({
      url: `/api/classes/${activeClass.id}/students`,
      method: "POST",
      data: {
        name,
        studentNo: studentNo.trim() || undefined,
        gender: studentGender || undefined
      }
    });
    updateActiveClass(classRoom => ({ ...classRoom, students: [...classRoom.students, nextStudent] }));
    closeModal();
  };

  const openEditStudent = (student: Student) => {
    setEditingStudentId(student.id);
    setStudentName(student.name);
    setStudentNo(student.studentNo);
    setStudentGender(student.gender);
    setModal("editStudent");
  };

  const updateStudent = async () => {
    const name = studentName.trim();
    if (!name || !activeClass || !editingStudentId) return;
    const updated = await request<Student, Student>({
      url: `/api/classes/${activeClass.id}/students/${editingStudentId}`,
      method: "PATCH",
      data: {
        name,
        studentNo: studentNo.trim(),
        gender: studentGender || undefined
      }
    });
    updateActiveClass(classRoom => ({
      ...classRoom,
      students: classRoom.students.map(student => (student.id === updated.id ? updated : student))
    }));
    closeModal();
  };

  /** 删除学生需要二次确认，避免误触删除。 */
  const removeStudent = (studentId: string) => {
    if (!activeClass) return;
    setStudentDeleteTarget({ classId: activeClass.id, studentId });
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

  const importStudents = async () => {
    if (!activeClass || parseImportRows(importText).length === 0) return;
    const imported = await request<Student[], Student[]>({
      url: `/api/classes/${activeClass.id}/students/import`,
      method: "POST",
      data: { text: importText }
    });
    updateActiveClass(classRoom => ({ ...classRoom, students: [...classRoom.students, ...imported] }));
    closeModal();
  };

  const addGroup = async () => {
    const name = groupName.trim();
    if (!name || activeClass?.groups.includes(name)) return;
    const groups = await request<string[], string[]>({
      url: `/api/classes/${activeClass.id}/groups`,
      method: "POST",
      data: { name }
    });
    updateActiveClass(classRoom => ({ ...classRoom, groups }));
    setGroupName("");
  };

  const deleteStudentName =
    classes
      .find(classRoom => classRoom.id === studentDeleteTarget?.classId)
      ?.students.find(student => student.id === studentDeleteTarget?.studentId)?.name ?? "未命名学生";

  return (
    <>
      <div className="flex min-h-full bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <aside className="w-[230px] shrink-0 border-r border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/80">
          <div className="mb-6 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-500 dark:text-slate-400">我的班级</span>
            <Button size="icon" variant="ghost" aria-label="新建班级" onClick={() => setModal("class")}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2">
            {classes.map(classRoom => (
              <button
                key={classRoom.id}
                onClick={() => setActiveClassId(classRoom.id)}
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
                  <div>
                    <div className="font-bold">{classRoom.name}</div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                      <Users className="h-3.5 w-3.5" />
                      {classRoom.students.length} 名学生
                    </div>
                  </div>
                  <MoreVertical className="h-4 w-4 text-slate-400" />
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-slate-200 bg-white/90 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/90">
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
                <Button variant="ghost" onClick={() => setModal("import")} className="text-blue-700 dark:text-blue-300">
                  <Upload className="h-4 w-4" />
                  批量导入
                </Button>
                <Button variant="outline" onClick={() => setModal("groups")}>
                  <Users className="h-4 w-4" />
                  分组管理
                </Button>
                <Button className="bg-blue-600 font-bold hover:bg-blue-700" onClick={() => setModal("student")}>
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

          <main className="grid grid-cols-1 gap-4 overflow-auto p-5 pb-20 md:grid-cols-2 xl:grid-cols-3">
            {visibleStudents.map(student => (
              <article
                key={student.id}
                className="flex min-h-[96px] items-center justify-between gap-4 rounded-xl bg-white p-5 shadow-sm transition hover:shadow-md dark:bg-slate-900"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                    {getInitial(student.name)}
                    <CircleUserRound className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-white text-blue-500 dark:bg-slate-900" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate font-bold">{student.name}</h3>
                    <p className="text-sm font-semibold text-slate-400">{student.studentNo}</p>
                    {student.group && <p className="mt-1 text-xs text-blue-500">{student.group}</p>}
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
            <div className="w-full max-w-[640px] overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
              {modal === "student" && (
                <StudentModal
                  title="添加学生"
                  name={studentName}
                  studentNo={studentNo}
                  gender={studentGender}
                  onNameChange={setStudentName}
                  onNoChange={setStudentNo}
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
                  onNameChange={setStudentName}
                  onNoChange={setStudentNo}
                  onGenderChange={setStudentGender}
                  onClose={closeModal}
                  onConfirm={updateStudent}
                />
              )}
              {modal === "import" && (
                <ImportModal
                  value={importText}
                  onChange={setImportText}
                  onClose={closeModal}
                  onConfirm={importStudents}
                />
              )}
              {modal === "class" && (
                <ClassModal value={className} onChange={setClassName} onClose={closeModal} onConfirm={addClass} />
              )}
              {modal === "groups" && activeClass && (
                <GroupModal
                  groups={activeClass.groups}
                  value={groupName}
                  onChange={setGroupName}
                  onClose={closeModal}
                  onAdd={addGroup}
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
    </>
  );
}

interface StudentModalProps {
  title: string;
  name: string;
  studentNo: string;
  gender: Gender;
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
      </div>
      <ModalFooter onClose={onClose} onConfirm={onConfirm} confirmText="确定" disabled={!name.trim()} />
    </>
  );
}

function ImportModal({
  value,
  onChange,
  onClose,
  onConfirm
}: {
  value: string;
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
      </div>
      <ModalFooter onClose={onClose} onConfirm={onConfirm} confirmText="完成导入" disabled={!value.trim()} />
    </>
  );
}

function ClassModal({
  value,
  onChange,
  onClose,
  onConfirm
}: {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <ModalHeader title="新建班级" onClose={onClose} />
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
  value,
  onChange,
  onClose,
  onAdd
}: {
  groups: string[];
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onAdd: () => void;
}) {
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
      <div className="min-h-[260px] space-y-5 p-7">
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
        <div className="grid gap-2">
          {groups.map(group => (
            <div
              key={group}
              className="rounded-xl border bg-slate-50 px-4 py-3 text-sm font-semibold dark:border-slate-800 dark:bg-slate-950"
            >
              {group}
            </div>
          ))}
          {groups.length === 0 && <div className="py-16 text-center text-sm text-slate-400">暂无分组</div>}
        </div>
      </div>
    </>
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
