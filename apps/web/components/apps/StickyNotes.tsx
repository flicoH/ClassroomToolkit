/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 * **********************************************************************************************
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ExternalLink, Pin, Plus, Search, StickyNote, Trash2, X } from "lucide-react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useWindowStore } from "@/store/windowStore";

type NoteColor = "yellow" | "blue" | "green" | "pink" | "purple";
type NoteFilter = "全部" | "置顶";

interface Note {
  id: string;
  title: string;
  content: string;
  color: NoteColor;
  pinned: boolean;
  updatedAt: string;
}

interface NoteWindow {
  windowId: string;
  noteId: string | null;
  title: string;
  content: string;
  color: NoteColor;
  position: { x: number; y: number };
  zIndex: number;
}

interface StickyNotesState {
  notes: Note[];
  addNote: (note: Omit<Note, "id" | "updatedAt" | "pinned"> & { pinned?: boolean }) => string;
  updateNote: (noteId: string, patch: Partial<Pick<Note, "title" | "content" | "color" | "pinned">>) => void;
  deleteNote: (noteId: string) => void;
  togglePinned: (noteId: string) => void;
}

const colorStyles: Record<NoteColor, { label: string; card: string; chip: string; dot: string }> = {
  yellow: {
    label: "暖黄",
    card: "bg-amber-100 text-amber-950 border-amber-200 dark:bg-amber-950/60 dark:text-amber-100 dark:border-amber-900",
    chip: "bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-100",
    dot: "bg-amber-400"
  },
  blue: {
    label: "清蓝",
    card: "bg-sky-100 text-sky-950 border-sky-200 dark:bg-sky-950/60 dark:text-sky-100 dark:border-sky-900",
    chip: "bg-sky-200 text-sky-900 dark:bg-sky-900 dark:text-sky-100",
    dot: "bg-sky-400"
  },
  green: {
    label: "薄荷",
    card: "bg-emerald-100 text-emerald-950 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-100 dark:border-emerald-900",
    chip: "bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100",
    dot: "bg-emerald-400"
  },
  pink: {
    label: "浅粉",
    card: "bg-rose-100 text-rose-950 border-rose-200 dark:bg-rose-950/60 dark:text-rose-100 dark:border-rose-900",
    chip: "bg-rose-200 text-rose-900 dark:bg-rose-900 dark:text-rose-100",
    dot: "bg-rose-400"
  },
  purple: {
    label: "淡紫",
    card: "bg-violet-100 text-violet-950 border-violet-200 dark:bg-violet-950/60 dark:text-violet-100 dark:border-violet-900",
    chip: "bg-violet-200 text-violet-900 dark:bg-violet-900 dark:text-violet-100",
    dot: "bg-violet-400"
  }
};

const initialNotes: Note[] = [
  {
    id: "note-1",
    title: "课前提醒",
    content: "检查投屏、计时器和随机点名名单，提前打开课堂小工具。",
    color: "yellow",
    pinned: true,
    updatedAt: "09:10"
  },
  {
    id: "note-2",
    title: "作业反馈",
    content: "第三组需要补交阅读记录，课后提醒组长统一收齐。",
    color: "blue",
    pinned: false,
    updatedAt: "10:25"
  },
  {
    id: "note-3",
    title: "课堂观察",
    content: "今天回答积极的同学：周杰伦、林俊杰、孙燕姿。",
    color: "green",
    pinned: false,
    updatedAt: "11:05"
  }
];

const colors = Object.keys(colorStyles) as NoteColor[];

function nowLabel() {
  return new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

/** 便签数据使用 zustand 共享，让完整列表和多个小窗口看到同一份内容。 */
const useStickyNotesStore = create<StickyNotesState>()(
  persist(
    (set, get) => ({
      notes: initialNotes,

      addNote: note => {
        const id = `note-${Date.now()}`;
        set(current => ({
          notes: [
            {
              ...note,
              id,
              pinned: note.pinned ?? false,
              updatedAt: nowLabel()
            },
            ...current.notes
          ]
        }));
        return id;
      },

      updateNote: (noteId, patch) => {
        set(current => ({
          notes: current.notes.map(note =>
            note.id === noteId
              ? {
                  ...note,
                  ...patch,
                  updatedAt: nowLabel()
                }
              : note
          )
        }));
      },

      deleteNote: noteId => {
        set(current => ({ notes: current.notes.filter(note => note.id !== noteId) }));
      },

      togglePinned: noteId => {
        const note = get().notes.find(item => item.id === noteId);
        if (!note) return;
        get().updateNote(noteId, { pinned: !note.pinned });
      }
    }),
    {
      name: "classroom-toolkit-sticky-notes",
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({ notes: state.notes }),
      // 服务端先渲染默认内容，客户端挂载后再读取存储，避免 hydration 不一致。
      skipHydration: true
    }
  )
);

function useHydrateStickyNotes() {
  useEffect(() => {
    void useStickyNotesStore.persist.rehydrate();
  }, []);
}

export function StickyNotes() {
  useHydrateStickyNotes();
  const notes = useStickyNotesStore(state => state.notes);
  const addNote = useStickyNotesStore(state => state.addNote);
  const updateNote = useStickyNotesStore(state => state.updateNote);
  const removeNote = useStickyNotesStore(state => state.deleteNote);
  const togglePinnedInStore = useStickyNotesStore(state => state.togglePinned);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<NoteFilter>("全部");
  const [noteWindows, setNoteWindows] = useState<NoteWindow[]>([]);
  const [nextZIndex, setNextZIndex] = useState(30);
  const dragRef = useRef<{
    windowId: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  // 完整便签列表支持搜索和置顶筛选，排序时置顶优先。
  const filteredNotes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return notes
      .filter(note => {
        const matchesQuery =
          !normalizedQuery ||
          note.title.toLowerCase().includes(normalizedQuery) ||
          note.content.toLowerCase().includes(normalizedQuery);
        const matchesFilter = filter === "全部" || note.pinned;
        return matchesQuery && matchesFilter;
      })
      .sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }, [filter, notes, query]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = event.clientX - dragRef.current.startX;
      const dy = event.clientY - dragRef.current.startY;
      const { windowId, origX, origY } = dragRef.current;
      setNoteWindows(current =>
        current.map(noteWindow =>
          noteWindow.windowId === windowId
            ? {
                ...noteWindow,
                position: {
                  x: Math.max(8, origX + dx),
                  y: Math.max(8, origY + dy)
                }
              }
            : noteWindow
        )
      );
    };

    const handleMouseUp = () => {
      dragRef.current = null;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  /** 提升便签浮窗层级，模拟桌面窗口聚焦。 */
  const focusWindow = (windowId: string) => {
    setNoteWindows(current =>
      current.map(noteWindow => (noteWindow.windowId === windowId ? { ...noteWindow, zIndex: nextZIndex } : noteWindow))
    );
    setNextZIndex(current => current + 1);
  };

  /** 每次点击便签都打开一个新的编辑小窗，不复用已有窗口。 */
  const openNoteWindow = (note?: Note) => {
    const offset = noteWindows.length * 24;
    const windowId = `note-window-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nextWindow: NoteWindow = {
      windowId,
      noteId: note?.id ?? null,
      title: note?.title ?? "",
      content: note?.content ?? "",
      color: note?.color ?? "yellow",
      position: {
        x: 48 + (offset % 180),
        y: 70 + (offset % 120)
      },
      zIndex: nextZIndex
    };

    setNoteWindows(current => [...current, nextWindow]);
    setNextZIndex(current => current + 1);
  };

  const updateNoteWindow = (windowId: string, patch: Partial<Pick<NoteWindow, "title" | "content" | "color">>) => {
    setNoteWindows(current =>
      current.map(noteWindow => (noteWindow.windowId === windowId ? { ...noteWindow, ...patch } : noteWindow))
    );
  };

  const closeNoteWindow = (windowId: string) => {
    setNoteWindows(current => current.filter(noteWindow => noteWindow.windowId !== windowId));
  };

  /** 保存浮窗草稿；新便签先创建，已有便签则更新标题/正文/颜色。 */
  const saveNoteWindow = (windowId: string) => {
    const noteWindow = noteWindows.find(item => item.windowId === windowId);
    if (!noteWindow) return;

    const title = noteWindow.title.trim() || "未命名便签";
    const content = noteWindow.content.trim();
    if (!noteWindow.title.trim() && !content) return;

    if (noteWindow.noteId) {
      updateNote(noteWindow.noteId, { title, content, color: noteWindow.color });
    } else {
      const newNoteId = addNote({ title, content, color: noteWindow.color });
      setNoteWindows(current =>
        current.map(item => (item.windowId === windowId ? { ...item, noteId: newNoteId, title, content } : item))
      );
    }
  };

  const togglePinned = (noteId: string) => {
    togglePinnedInStore(noteId);
  };

  /** 删除便签前二次确认，并同步关闭对应浮窗。 */
  const deleteNote = (noteId: string) => {
    const note = notes.find(item => item.id === noteId);
    if (!window.confirm(`确定删除便签「${note?.title || "未命名便签"}」吗？删除后不可恢复。`)) return;
    removeNote(noteId);
    setNoteWindows(current => current.filter(noteWindow => noteWindow.noteId !== noteId));
  };

  return (
    <div className="relative min-h-full overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 bg-white px-6 py-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white">
              <StickyNote className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">便签</h1>
              <p className="text-sm font-medium text-slate-400">记录课堂提醒和临时想法</p>
            </div>
          </div>
          <Button className="bg-blue-600 font-bold hover:bg-blue-700" onClick={() => openNoteWindow()}>
            <Plus className="h-4 w-4" />
            新建便签
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
            <Input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="搜索标题/内容..."
              className="border-transparent bg-slate-50 pl-9 shadow-none dark:bg-slate-800"
            />
          </div>
          {(["全部", "置顶"] as const).map(item => (
            <Button
              key={item}
              variant={filter === item ? "default" : "outline"}
              onClick={() => setFilter(item)}
              className={cn(filter === item && "bg-blue-600 hover:bg-blue-700")}
            >
              {item}
            </Button>
          ))}
        </div>
      </header>

      <main className="grid grid-cols-1 gap-4 overflow-auto p-5 sm:grid-cols-2 xl:grid-cols-3">
        {filteredNotes.map(note => (
          <article
            key={note.id}
            onClick={() => openNoteWindow(note)}
            className={cn(
              "min-h-[190px] cursor-pointer rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
              colorStyles[note.color].card
            )}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-2 flex items-center gap-2">
                  {note.pinned && <Pin className="h-4 w-4 shrink-0" />}
                  <h3 className="truncate text-lg font-black">{note.title}</h3>
                </div>
                <span
                  className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-bold", colorStyles[note.color].chip)}
                >
                  {note.updatedAt}
                </span>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={event => {
                    event.stopPropagation();
                    togglePinned(note.id);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/45 transition hover:bg-white/70 dark:bg-black/20 dark:hover:bg-black/30"
                  aria-label="置顶便签"
                >
                  <Pin className="h-4 w-4" />
                </button>
                <button
                  onClick={event => {
                    event.stopPropagation();
                    deleteNote(note.id);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/45 text-rose-600 transition hover:bg-white/70 dark:bg-black/20 dark:hover:bg-black/30"
                  aria-label="删除便签"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <p className="whitespace-pre-wrap text-sm font-medium leading-7 opacity-80">{note.content}</p>
          </article>
        ))}

        {filteredNotes.length === 0 && (
          <div className="col-span-full flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed bg-white text-slate-400 dark:border-slate-800 dark:bg-slate-900">
            <StickyNote className="mb-3 h-10 w-10" />
            暂无便签
          </div>
        )}
      </main>

      {noteWindows.map(noteWindow => (
        <div
          key={noteWindow.windowId}
          className={cn(
            "absolute w-[340px] overflow-hidden rounded-2xl border shadow-2xl",
            colorStyles[noteWindow.color].card
          )}
          style={{
            left: noteWindow.position.x,
            top: noteWindow.position.y,
            zIndex: noteWindow.zIndex
          }}
          onMouseDown={() => focusWindow(noteWindow.windowId)}
        >
          <div
            className="flex h-11 cursor-move items-center justify-between border-b border-black/5 bg-white/30 px-3 dark:border-white/10 dark:bg-black/10"
            onMouseDown={event => {
              focusWindow(noteWindow.windowId);
              dragRef.current = {
                windowId: noteWindow.windowId,
                startX: event.clientX,
                startY: event.clientY,
                origX: noteWindow.position.x,
                origY: noteWindow.position.y
              };
            }}
          >
            <div className="flex min-w-0 items-center gap-2">
              <StickyNote className="h-4 w-4 shrink-0" />
              <input
                value={noteWindow.title}
                onChange={event => updateNoteWindow(noteWindow.windowId, { title: event.target.value })}
                onMouseDown={event => event.stopPropagation()}
                onClick={event => event.stopPropagation()}
                placeholder="便签"
                className="min-w-0 flex-1 cursor-text rounded-md bg-transparent px-1 text-sm font-black outline-none placeholder:text-current/55 focus:bg-white/45 dark:focus:bg-black/15"
              />
            </div>
            <div className="flex gap-1">
              <button
                onClick={event => {
                  event.stopPropagation();
                  openNoteWindow();
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/35 transition hover:bg-white/60 dark:bg-black/10 dark:hover:bg-black/20"
                aria-label="新建便签"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={event => {
                  event.stopPropagation();
                  setFilter("全部");
                  setQuery("");
                  focusWindow(noteWindow.windowId);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/35 transition hover:bg-white/60 dark:bg-black/10 dark:hover:bg-black/20"
                aria-label="进入便签列表"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={event => {
                  event.stopPropagation();
                  closeNoteWindow(noteWindow.windowId);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/35 transition hover:bg-white/60 dark:bg-black/10 dark:hover:bg-black/20"
                aria-label="关闭"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="space-y-3 p-4">
            <textarea
              value={noteWindow.content}
              onChange={event => updateNoteWindow(noteWindow.windowId, { content: event.target.value })}
              placeholder="马上记录..."
              className="min-h-[150px] w-full resize-none rounded-xl border border-black/10 bg-white/45 p-3 text-sm font-medium leading-6 outline-none transition placeholder:text-current/45 focus:border-blue-400 dark:border-white/10 dark:bg-black/10"
            />

            <div className="flex flex-wrap gap-1.5">
              {colors.map(color => (
                <button
                  key={color}
                  onClick={() => updateNoteWindow(noteWindow.windowId, { color })}
                  className={cn(
                    "flex h-8 items-center gap-1 rounded-lg border px-2 text-xs font-bold transition",
                    noteWindow.color === color
                      ? "border-blue-500 bg-white/60 text-blue-700 dark:bg-black/20 dark:text-blue-300"
                      : "border-black/10 bg-white/30 dark:border-white/10 dark:bg-black/10"
                  )}
                >
                  <span className={cn("h-2.5 w-2.5 rounded-full", colorStyles[color].dot)} />
                  {noteWindow.color === color && <Check className="h-3 w-3" />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-black/5 bg-white/25 px-4 py-3 dark:border-white/10 dark:bg-black/10">
            <button
              onClick={() => noteWindow.noteId && togglePinned(noteWindow.noteId)}
              disabled={!noteWindow.noteId}
              className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-bold transition hover:bg-white/35 disabled:opacity-40 dark:hover:bg-black/20"
            >
              <Pin className="h-3.5 w-3.5" />
              置顶
            </button>
            <div className="flex gap-2">
              {noteWindow.noteId && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-rose-600 hover:text-rose-700"
                  onClick={() => noteWindow.noteId && deleteNote(noteWindow.noteId)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700"
                onClick={() => saveNoteWindow(noteWindow.windowId)}
                disabled={!noteWindow.title.trim() && !noteWindow.content.trim()}
              >
                保存
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

interface StickyNoteQuickProps {
  noteId?: string;
}

export function StickyNoteQuick({ noteId }: StickyNoteQuickProps) {
  useHydrateStickyNotes();
  const notes = useStickyNotesStore(state => state.notes);
  const addNote = useStickyNotesStore(state => state.addNote);
  const updateNote = useStickyNotesStore(state => state.updateNote);
  const removeNote = useStickyNotesStore(state => state.deleteNote);
  const togglePinned = useStickyNotesStore(state => state.togglePinned);
  const openWindow = useWindowStore(state => state.openWindow);
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(noteId ?? null);
  const initialNote = noteId ? notes.find(note => note.id === noteId) : undefined;
  const [title, setTitle] = useState(initialNote?.title ?? "");
  const [content, setContent] = useState(initialNote?.content ?? "");
  const [color, setColor] = useState<NoteColor>(initialNote?.color ?? "yellow");
  const currentNote = currentNoteId ? notes.find(note => note.id === currentNoteId) : undefined;
  const isPinned = Boolean(currentNote?.pinned);
  const hasDraft = Boolean(title.trim() || content.trim());
  const [savedAt, setSavedAt] = useState<string | null>(null);

  /** 菜单打开的小便签：允许只填标题或正文即可保存。 */
  const save = () => {
    if (!hasDraft) return;
    const trimmedContent = content.trim();
    const trimmedTitle = title.trim() || "未命名便签";

    if (currentNoteId) {
      updateNote(currentNoteId, {
        title: trimmedTitle,
        content: trimmedContent,
        color
      });
      setSavedAt(nowLabel());
      return;
    }

    const createdNoteId = addNote({
      title: trimmedTitle,
      content: trimmedContent,
      color
    });
    setCurrentNoteId(createdNoteId);
    setSavedAt(nowLabel());
  };

  /** 每次新建都交给 windowStore 打开独立小窗口。 */
  const createAnother = () => {
    openWindow("便签", `stickyNoteQuick-${Date.now()}`, {
      allowMultiple: true,
      state: "normal",
      prevState: "normal",
      size: { w: 360, h: 430 }
    });
  };

  /** 从快速便签进入完整便签管理组件。 */
  const openNotesList = () => {
    openWindow("便签列表", "stickyNotesList", {
      state: "maximized",
      prevState: "normal"
    });
  };

  /** 删除当前便签；未保存草稿没有 noteId，因此不做删除动作。 */
  const deleteCurrent = () => {
    if (!currentNoteId) return;
    const note = notes.find(item => item.id === currentNoteId);
    if (!window.confirm(`确定删除便签「${note?.title || title || "未命名便签"}」吗？删除后不可恢复。`)) return;
    removeNote(currentNoteId);
    setCurrentNoteId(null);
    setTitle("");
    setContent("");
    setColor("yellow");
  };

  /** 未保存草稿点置顶时先创建便签，再设为置顶。 */
  const handleTogglePinned = () => {
    if (currentNoteId) {
      togglePinned(currentNoteId);
      return;
    }

    if (!hasDraft) return;
    const createdNoteId = addNote({
      title: title.trim() || "未命名便签",
      content: content.trim(),
      color,
      pinned: true
    });
    setCurrentNoteId(createdNoteId);
    setSavedAt(nowLabel());
  };

  return (
    <div className={cn("flex h-full flex-col overflow-hidden", colorStyles[color].card)}>
      <div className="flex items-center justify-between border-b border-black/5 bg-white/30 px-4 py-3 dark:border-white/10 dark:bg-black/10">
        <div className="flex min-w-0 items-center gap-2">
          <StickyNote className="h-4 w-4 shrink-0" />
          <input
            value={title}
            onChange={event => setTitle(event.target.value)}
            placeholder="便签"
            className="min-w-0 flex-1 rounded-md bg-transparent px-1 text-sm font-black outline-none placeholder:text-current/55 focus:bg-white/45 dark:focus:bg-black/15"
            autoFocus
          />
        </div>
        <div className="flex gap-1">
          <button
            onClick={createAnother}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/35 transition hover:bg-white/60 dark:bg-black/10 dark:hover:bg-black/20"
            aria-label="新增便签"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={openNotesList}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/35 transition hover:bg-white/60 dark:bg-black/10 dark:hover:bg-black/20"
            aria-label="进入便签列表"
          >
            <ExternalLink className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-auto p-4">
        <textarea
          value={content}
          onChange={event => setContent(event.target.value)}
          placeholder="马上记录..."
          className="min-h-[170px] w-full resize-none rounded-xl border border-black/10 bg-white/45 p-3 text-sm font-medium leading-6 outline-none transition placeholder:text-current/45 focus:border-blue-400 dark:border-white/10 dark:bg-black/10"
        />
        <div className="flex flex-wrap gap-1.5">
          {colors.map(item => (
            <button
              key={item}
              onClick={() => setColor(item)}
              className={cn(
                "flex h-8 items-center gap-1 rounded-lg border px-2 text-xs font-bold transition",
                color === item
                  ? "border-blue-500 bg-white/60 text-blue-700 dark:bg-black/20 dark:text-blue-300"
                  : "border-black/10 bg-white/30 dark:border-white/10 dark:bg-black/10"
              )}
            >
              <span className={cn("h-2.5 w-2.5 rounded-full", colorStyles[item].dot)} />
              {color === item && <Check className="h-3 w-3" />}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-black/5 bg-white/25 px-4 py-3 dark:border-white/10 dark:bg-black/10">
        <button
          onClick={handleTogglePinned}
          disabled={!currentNoteId && !hasDraft}
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-bold transition hover:bg-white/35 disabled:opacity-40 dark:hover:bg-black/20",
            isPinned && "bg-white/55 text-blue-700 shadow-sm dark:bg-black/25 dark:text-blue-300"
          )}
        >
          <Pin className={cn("h-3.5 w-3.5", isPinned && "fill-current")} />
          {isPinned ? "已置顶" : "置顶"}
        </button>
        <div className="flex gap-2">
          {savedAt && <span className="flex h-8 items-center text-xs font-bold opacity-60">已保存 {savedAt}</span>}
          {currentNoteId && (
            <Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700" onClick={deleteCurrent}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={save} disabled={!hasDraft}>
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}
