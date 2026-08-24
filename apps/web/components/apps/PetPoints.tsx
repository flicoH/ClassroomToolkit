/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 * **********************************************************************************************
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownUp,
  BarChart3,
  BookOpen,
  Check,
  CheckSquare,
  ClipboardList,
  Clock3,
  Droplets,
  FileText,
  Flame,
  Gift,
  History,
  Leaf,
  Medal,
  Minus,
  PawPrint,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  Trophy,
  Users,
  X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import request from "@/lib/request";
import { cn } from "@/lib/utils";

type PetFamily = "图鉴" | "萌芽系" | "焰岩系" | "潮汐系" | "星辉系";
type PetStage = "初始形态" | "成长形态" | "进阶形态" | "终极形态";
type ClassName = string;

interface PetOption {
  id: string;
  name: string;
  family: Exclude<PetFamily, "图鉴">;
  description: string;
  tone: string;
  badge: string;
  evolutions: readonly [string, string, string, string];
}

interface StudentPet {
  id: string;
  name: string;
  studentNo: string;
  classId: string;
  className: ClassName;
  group: string;
  score: number;
  maxScore: number;
  trophies: number;
  level: number;
  stage: PetStage;
  petId?: string;
  petName?: string;
  petProgress: number;
  petHatched: boolean;
  absent: boolean;
  completedPets: number;
}

type EvaluationCategory = "课堂表现" | "作业情况" | "品德修养" | "纪律常规";

interface RubricItem {
  id: string;
  category: EvaluationCategory;
  label: string;
  score: number;
  enabled: boolean;
}

interface EvaluationRecord {
  id: string;
  studentId: string;
  category: EvaluationCategory | "手动调整";
  label: string;
  delta: number;
  petDelta?: number;
  note: string;
  createdAt: string;
}

interface RewardItem {
  id: string;
  name: string;
  cost: number;
  stock: number;
  enabled: boolean;
}

interface RedemptionRecord {
  id: string;
  studentId: string;
  rewardName: string;
  cost: number;
  createdAt: string;
}

type SortMode = "分数降序" | "分数升序" | "姓名排序" | "学号排序";
type SettingsPanel = "指标配置" | "奖品配置" | "等级规则" | "宠物统计" | "最近评分" | "积分统计";
type ScoreAdjustMode = "add" | "subtract";

interface PetPointStudentFilters {
  classId: string;
  groupFilter: string;
  query: string;
  sortMode: SortMode;
}

interface ClassroomStudent {
  id: string;
  name: string;
  studentNo: string;
  group?: string;
}

interface Classroom {
  id: string;
  name: string;
  students: ClassroomStudent[];
  groups: string[];
}

interface PetPointsOverview {
  students: StudentPet[];
  rubrics: RubricItem[];
  rewards: RewardItem[];
  records: EvaluationRecord[];
  redemptions: RedemptionRecord[];
}

const fallbackClassrooms: Classroom[] = [
  { id: "grade-1", name: "一年级", groups: ["一组", "二组", "三组"], students: [] },
  { id: "grade-2", name: "二年级", groups: ["一组", "二组"], students: [] },
  { id: "grade-3", name: "三年级", groups: ["一组"], students: [] }
];
const evaluationCategories: EvaluationCategory[] = ["课堂表现", "作业情况", "品德修养", "纪律常规"];

const initialRubrics: RubricItem[] = [
  { id: "class-speaking", category: "课堂表现", label: "积极发言", score: 2, enabled: true },
  { id: "class-listening", category: "课堂表现", label: "认真听讲", score: 1, enabled: true },
  { id: "homework-on-time", category: "作业情况", label: "按时交作业", score: 3, enabled: true },
  { id: "homework-excellent", category: "作业情况", label: "作业优秀", score: 2, enabled: true },
  { id: "character-helpful", category: "品德修养", label: "乐于助人", score: 5, enabled: true },
  { id: "discipline-disrupt", category: "纪律常规", label: "扰乱课堂", score: -2, enabled: true },
  { id: "discipline-late", category: "纪律常规", label: "迟到早退", score: -1, enabled: true }
];

const initialRewards: RewardItem[] = [
  { id: "reward-sticker", name: "星星贴纸", cost: 5, stock: 12, enabled: true },
  { id: "reward-homework-pass", name: "作业免写卡", cost: 12, stock: 6, enabled: true },
  { id: "reward-seat-choice", name: "座位优先选择", cost: 18, stock: 4, enabled: true },
  { id: "reward-mystery-box", name: "惊喜盲盒", cost: 25, stock: 3, enabled: true }
];

const families: PetFamily[] = ["图鉴", "萌芽系", "焰岩系", "潮汐系", "星辉系"];
const evolutionThresholds = [0, 8, 16, 24] as const;
const evolutionStages: PetStage[] = ["初始形态", "成长形态", "进阶形态", "终极形态"];
const eggStages = ["沉睡蛋", "裂纹蛋", "共鸣蛋", "待孵化"] as const;
const hatchThreshold = 4;
const petEvolutionThresholds = [4, 10, 18, 26] as const;
const maxEvolutionScore = 30;

function getEvolutionIndex(score: number) {
  if (score >= evolutionThresholds[3]) return 3;
  if (score >= evolutionThresholds[2]) return 2;
  if (score >= evolutionThresholds[1]) return 1;
  return 0;
}

function getPetEvolutionIndex(progress: number) {
  if (progress >= petEvolutionThresholds[3]) return 3;
  if (progress >= petEvolutionThresholds[2]) return 2;
  if (progress >= petEvolutionThresholds[1]) return 1;
  return 0;
}

function getPetPhase(progress: number) {
  return progress < hatchThreshold ? -1 : getPetEvolutionIndex(progress);
}

const petOptions: PetOption[] = [
  {
    id: "sprout-puff",
    name: "芽团兽",
    family: "萌芽系",
    tone: "from-emerald-50 to-lime-100",
    badge: "bg-emerald-100 text-emerald-700",
    evolutions: ["芽团兽", "叶冠兽", "森心兽", "苍翠圣灵"],
    description: "性格温和的萌芽星灵，会把认真听讲积攒成头顶的新叶，成长后拥有更强的专注力。"
  },
  {
    id: "bud-deer",
    name: "芽角鹿",
    family: "萌芽系",
    tone: "from-lime-50 to-emerald-100",
    badge: "bg-emerald-100 text-emerald-700",
    evolutions: ["芽角鹿", "青枝鹿", "森冠鹿", "苍翠灵鹿"],
    description: "枝角刚刚冒出嫩叶的森林伙伴，善于发现同学的优点，也会因合作而快速成长。"
  },
  {
    id: "amber-horn",
    name: "琥角兽",
    family: "焰岩系",
    tone: "from-orange-50 to-amber-100",
    badge: "bg-orange-100 text-orange-700",
    evolutions: ["琥角兽", "岩甲角兽", "熔晶角兽", "曜岩圣角"],
    description: "从暖岩中苏醒的小角兽，遇到难题会燃起琥珀色勇气，是坚持与行动力的象征。"
  },
  {
    id: "coal-tail-fox",
    name: "炭尾狐",
    family: "焰岩系",
    tone: "from-rose-50 to-orange-100",
    badge: "bg-orange-100 text-orange-700",
    evolutions: ["炭尾狐", "烬尾狐", "熔晶狐", "曜炎天狐"],
    description: "尾端藏着温暖火光的机敏星灵，会把每次主动举手化作不熄的小火苗。"
  },
  {
    id: "cloud-bear",
    name: "云绒熊",
    family: "潮汐系",
    tone: "from-sky-50 to-cyan-100",
    badge: "bg-sky-100 text-sky-700",
    evolutions: ["云绒熊", "浪绒熊", "潮铠熊", "沧澜守望"],
    description: "像云朵一样柔软的潮汐星灵，能够安抚紧张情绪，陪伴主人稳稳完成每个目标。"
  },
  {
    id: "ink-dot-cat",
    name: "墨点喵",
    family: "潮汐系",
    tone: "from-cyan-50 to-slate-100",
    badge: "bg-sky-100 text-sky-700",
    evolutions: ["墨点喵", "墨纹猫", "潮墨灵猫", "沧海墨灵"],
    description: "会用尾巴记录灵感的观察型星灵，身上的墨点会随着好奇心泛起微光。"
  },
  {
    id: "moon-bell-rabbit",
    name: "月铃兔",
    family: "星辉系",
    tone: "from-violet-50 to-fuchsia-100",
    badge: "bg-violet-100 text-violet-700",
    evolutions: ["月铃兔", "月跃兔", "星环兔", "皓月星使"],
    description: "月光下诞生的铃音星灵，安静而敏锐，每完成一次挑战，胸前星徽就会更加明亮。"
  },
  {
    id: "star-compass-fox",
    name: "星巡狐",
    family: "星辉系",
    tone: "from-cyan-50 to-indigo-100",
    badge: "bg-violet-100 text-violet-700",
    evolutions: ["星巡狐", "星轨狐", "星环巡狐", "天穹星巡"],
    description: "额间星盘能辨认目标方向的探索型星灵，最喜欢陪主人完成一段又一段成长旅程。"
  },
  {
    id: "pinecone-puff",
    name: "松果团",
    family: "萌芽系",
    tone: "from-lime-50 to-amber-100",
    badge: "bg-emerald-100 text-emerald-700",
    evolutions: ["松果团", "松针兽", "森甲兽", "古木守灵"],
    description: "把课堂收获藏进松果鳞片的森林星灵，积累越多，身上的古木铠甲就越坚实。"
  },
  {
    id: "vine-wing-bird",
    name: "藤翼雀",
    family: "萌芽系",
    tone: "from-emerald-50 to-teal-100",
    badge: "bg-emerald-100 text-emerald-700",
    evolutions: ["藤翼雀", "青羽雀", "藤冠鸾", "苍林天羽"],
    description: "羽尖像嫩叶一样轻盈的小鸟，会把每一次大胆表达化作向上生长的藤蔓。"
  },
  {
    id: "red-sand-tortoise",
    name: "赤砂龟",
    family: "焰岩系",
    tone: "from-orange-50 to-red-100",
    badge: "bg-orange-100 text-orange-700",
    evolutions: ["赤砂龟", "熔甲龟", "火山巨龟", "赤曜玄龟"],
    description: "沉稳可靠的火山龟，甲壳中的熔纹会记录坚持完成的每一个课堂目标。"
  },
  {
    id: "ash-lion",
    name: "灰烬狮",
    family: "焰岩系",
    tone: "from-rose-50 to-orange-100",
    badge: "bg-orange-100 text-orange-700",
    evolutions: ["灰烬狮", "烈鬃狮", "熔金战狮", "曜炎狮王"],
    description: "鬃毛藏着勇气火苗的狮子星灵，越是主动迎接挑战，火光就越耀眼。"
  },
  {
    id: "bubble-otter",
    name: "泡泡獭",
    family: "潮汐系",
    tone: "from-cyan-50 to-sky-100",
    badge: "bg-sky-100 text-sky-700",
    evolutions: ["泡泡獭", "浪花獭", "潮纹灵獭", "沧澜海獭"],
    description: "喜欢把新知识收进泡泡里的活泼水獭，合作学习会让潮纹快速亮起。"
  },
  {
    id: "coral-whale",
    name: "珊瑚鲸",
    family: "潮汐系",
    tone: "from-sky-50 to-rose-100",
    badge: "bg-sky-100 text-sky-700",
    evolutions: ["珊瑚鲸", "彩礁鲸", "潮歌巨鲸", "深蓝星鲸"],
    description: "背负珊瑚冠的小鲸，会用悠长潮歌收藏耐心、倾听与温柔的课堂时刻。"
  },
  {
    id: "star-sprout-marten",
    name: "星芽貂",
    family: "星辉系",
    tone: "from-violet-50 to-sky-100",
    badge: "bg-violet-100 text-violet-700",
    evolutions: ["星芽貂", "星纹貂", "银河灵貂", "天幕星貂"],
    description: "额间长着星芽的灵巧伙伴，会把每个灵感连接成独一无二的银河轨迹。"
  }
];

const initialStudents: StudentPet[] = [];

/** 宠物卡片与详情预览共用同一套透明素材。 */
function PetSprite({ pet, stageIndex = 0, className }: { pet: PetOption; stageIndex?: number; className?: string }) {
  const formName = pet.evolutions[stageIndex] ?? pet.name;
  const imageName = stageIndex === 0 ? pet.id : `${pet.id}-${stageIndex + 1}`;
  return (
    <div className={cn("relative aspect-square", className)} aria-label={formName}>
      <img
        src={`/pets/starling/${imageName}.png`}
        alt={formName}
        draggable={false}
        className="pointer-events-none h-full w-full select-none object-contain"
      />
    </div>
  );
}

/** 未孵化蛋也会响应积分，确保每次加分都有能量和动效反馈。 */
function IncubatingEgg({ score, className }: { score: number; className?: string }) {
  const stageIndex = getEvolutionIndex(score);
  const energy = Math.min(score, evolutionThresholds[3]);
  const energyRatio = energy / evolutionThresholds[3];
  return (
    <div
      className={cn("relative aspect-square", className)}
      aria-label={`${eggStages[stageIndex]}，孵化能量${energy}/${evolutionThresholds[3]}`}
    >
      <span
        className="pointer-events-none absolute inset-[16%] rounded-full bg-amber-300 blur-2xl transition-all duration-500"
        style={{ opacity: 0.08 + energyRatio * 0.42, transform: `scale(${0.8 + energyRatio * 0.35})` }}
      />
      <img
        key={score}
        src="/pets/stone-monkey.png"
        alt={eggStages[stageIndex]}
        draggable={false}
        className="pointer-events-none relative z-[1] h-full w-full select-none object-contain animate-in fade-in zoom-in-95 duration-300"
        style={{
          filter: `saturate(${0.72 + energyRatio * 0.75}) brightness(${0.9 + energyRatio * 0.16}) drop-shadow(0 10px ${8 + energyRatio * 14}px rgba(245, 158, 11, ${0.08 + energyRatio * 0.32}))`,
          transform: `scale(${0.92 + energyRatio * 0.08})`
        }}
      />
      {stageIndex >= 2 && (
        <Sparkles className="absolute right-[12%] top-[16%] z-[2] h-6 w-6 animate-pulse text-amber-400" />
      )}
      {stageIndex >= 3 && (
        <Sparkles className="absolute bottom-[22%] left-[10%] z-[2] h-5 w-5 animate-pulse text-orange-500" />
      )}
      <div className="absolute bottom-0 left-1/2 z-[3] min-w-32 -translate-x-1/2 rounded-full border border-amber-200 bg-white/95 px-3 py-1.5 text-center shadow-sm">
        <p className="text-[11px] font-black text-amber-700">{eggStages[stageIndex]}</p>
        <p className="text-[10px] font-bold text-slate-400">
          能量 {energy}/{evolutionThresholds[3]}
        </p>
      </div>
    </div>
  );
}

/** 通过色相和系列标识区分每一枚已绑定的宠物蛋，避免额外露出被裁切的宠物预览。 */
function PetEgg({ pet, progress, className }: { pet: PetOption; progress: number; className?: string }) {
  const hue = Array.from(pet.id).reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 280;
  const energyRatio = Math.min(1, progress / hatchThreshold);
  return (
    <div
      className={cn("relative aspect-square", className)}
      aria-label={`${pet.name}宠物蛋，孵化进度${progress}/${hatchThreshold}`}
    >
      <span
        className="absolute inset-[15%] rounded-full bg-amber-300 blur-2xl transition-opacity duration-500"
        style={{ opacity: 0.12 + energyRatio * 0.42 }}
      />
      <img
        src="/pets/stone-monkey.png"
        alt={`${pet.name}宠物蛋`}
        draggable={false}
        className="pet-egg-idle pointer-events-none relative z-[1] h-full w-full select-none object-contain"
        style={{
          filter: `hue-rotate(${hue}deg) saturate(${1.05 + energyRatio * 0.7}) brightness(${0.94 + energyRatio * 0.12}) drop-shadow(0 10px 14px rgba(15, 23, 42, 0.18))`
        }}
      />
      <span
        className={cn(
          "absolute right-[13%] top-[18%] z-[2] rounded-full px-2 py-1 text-[10px] font-black shadow-sm",
          pet.badge
        )}
      >
        {pet.family}
      </span>
      <div className="absolute bottom-0 left-1/2 z-[3] min-w-36 -translate-x-1/2 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-center shadow-sm">
        <p className="text-[11px] font-black text-slate-700">{pet.name}蛋</p>
        <p className="text-[10px] font-bold text-slate-400">
          孵化 {progress}/{hatchThreshold}
        </p>
      </div>
    </div>
  );
}

function FamilyIcon({ family }: { family: PetFamily }) {
  if (family === "图鉴") return <BookOpen className="h-4 w-4" />;
  if (family === "萌芽系") return <Leaf className="h-4 w-4" />;
  if (family === "焰岩系") return <Flame className="h-4 w-4" />;
  if (family === "潮汐系") return <Droplets className="h-4 w-4" />;
  return <Sparkles className="h-4 w-4" />;
}

function AwardIcon({ unlocked }: { unlocked: boolean }) {
  return <Medal className={cn("h-6 w-6", unlocked ? "text-orange-500" : "text-slate-300")} />;
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <strong className="block text-2xl">{value}</strong>
      <span className="text-sm font-bold text-slate-500">{label}</span>
    </div>
  );
}

function normalizeClassName(value: unknown): ClassName {
  return typeof value === "string" && value.trim() ? value.trim() : "一年级";
}

function normalizeClassId(value: unknown, className: ClassName): string {
  return typeof value === "string" && value.trim() ? value.trim() : className;
}

function normalizeStudent(student: StudentPet): StudentPet {
  const petProgress = student.petProgress ?? (student.petId ? student.score : 0);
  const petHatched = student.petHatched ?? Boolean(student.petId);
  const evolutionIndex = getPetEvolutionIndex(petProgress);
  return {
    ...student,
    className: normalizeClassName(student.className),
    classId: normalizeClassId(student.classId, normalizeClassName(student.className)),
    petProgress,
    petHatched,
    level: petHatched ? evolutionIndex + 1 : 1,
    stage: petHatched ? evolutionStages[evolutionIndex]! : "初始形态",
    absent: Boolean(student.absent),
    completedPets: student.completedPets ?? 0
  };
}

function toPetPointStudent(classroom: Classroom, student: ClassroomStudent): StudentPet {
  return {
    id: student.id,
    name: student.name,
    studentNo: student.studentNo,
    classId: classroom.id,
    className: classroom.name,
    group: student.group || "未分组",
    score: 0,
    maxScore: maxEvolutionScore,
    trophies: 0,
    level: 1,
    stage: "初始形态",
    petProgress: 0,
    petHatched: false,
    absent: false,
    completedPets: 0
  };
}

function replaceClassStudents(currentStudents: StudentPet[], classroom: Classroom) {
  const currentById = new Map(currentStudents.map(student => [student.id, student]));
  const nextClassStudents = classroom.students.map(student => {
    const apiStudent = toPetPointStudent(classroom, student);
    const currentStudent = currentById.get(apiStudent.id);
    return currentStudent
      ? normalizeStudent({
          ...currentStudent,
          name: apiStudent.name,
          studentNo: apiStudent.studentNo,
          classId: apiStudent.classId,
          className: apiStudent.className,
          group: apiStudent.group
        })
      : apiStudent;
  });
  return [...currentStudents.filter(student => student.classId !== classroom.id), ...nextClassStudents];
}

export function PetPoints() {
  const [students, setStudents] = useState<StudentPet[]>(initialStudents);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [activeClassId, setActiveClassId] = useState("");
  const [records, setRecords] = useState<EvaluationRecord[]>([]);
  const [rubrics, setRubrics] = useState<RubricItem[]>(initialRubrics);
  const [rewards, setRewards] = useState<RewardItem[]>(initialRewards);
  const [redemptions, setRedemptions] = useState<RedemptionRecord[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("全部分组");
  const [sortMode, setSortMode] = useState<SortMode>("分数降序");
  const [studentDataLoading, setStudentDataLoading] = useState(false);
  const [studentDataError, setStudentDataError] = useState("");
  const studentRequestIdRef = useRef(0);
  const [activeFamily, setActiveFamily] = useState<PetFamily>("图鉴");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [petNickname, setPetNickname] = useState("");
  const [historyStudentId, setHistoryStudentId] = useState<string | null>(null);
  const [recordStudentId, setRecordStudentId] = useState<string | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [evaluationMode, setEvaluationMode] = useState<"batch" | "advanced" | null>(null);
  const [activeCategory, setActiveCategory] = useState<EvaluationCategory>("课堂表现");
  const [selectedRubricIds, setSelectedRubricIds] = useState<string[]>([]);
  const [evaluationNote, setEvaluationNote] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState<SettingsPanel | null>(null);
  const [rewardStoreOpen, setRewardStoreOpen] = useState(false);
  const [rewardStudentId, setRewardStudentId] = useState(initialStudents[0]?.id ?? "");
  const [notice, setNotice] = useState("");
  const [petEffects, setPetEffects] = useState<Record<string, "hatch" | "evolve">>({});
  const [scoreAdjustStudentId, setScoreAdjustStudentId] = useState<string | null>(null);
  const [scoreAdjustMode, setScoreAdjustMode] = useState<ScoreAdjustMode>("add");
  const [scoreAdjustValue, setScoreAdjustValue] = useState(1);
  const [scoreAdjustReason, setScoreAdjustReason] = useState("");
  const [scoreAdjustNote, setScoreAdjustNote] = useState("");
  const [newRubricLabel, setNewRubricLabel] = useState("");
  const [newRubricCategory, setNewRubricCategory] = useState<EvaluationCategory>("课堂表现");
  const [newRubricScore, setNewRubricScore] = useState(1);
  const [newRewardName, setNewRewardName] = useState("");
  const [newRewardCost, setNewRewardCost] = useState(5);
  const [newRewardStock, setNewRewardStock] = useState(1);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!Object.keys(petEffects).length) return;
    const timer = window.setTimeout(() => setPetEffects({}), 1800);
    return () => window.clearTimeout(timer);
  }, [petEffects]);

  const activeClass = useMemo(
    () => classrooms.find(classroom => classroom.id === activeClassId) ?? classrooms[0] ?? fallbackClassrooms[0]!,
    [activeClassId, classrooms]
  );
  const hasBackendClassrooms = classrooms.length > 0;

  const loadPetPointsOverview = useCallback(async () => {
    const overview = await request<PetPointsOverview, PetPointsOverview>("/api/pet-points");
    setStudents(overview.students.map(normalizeStudent));
    setRubrics(overview.rubrics);
    setRewards(overview.rewards);
    setRecords(overview.records);
    setRedemptions(overview.redemptions);
  }, []);

  const requestClassroomStudents = useCallback(
    async (filters: PetPointStudentFilters) => {
      const requestId = studentRequestIdRef.current + 1;
      studentRequestIdRef.current = requestId;
      setStudentDataLoading(true);
      setStudentDataError("");
      try {
        const params = new URLSearchParams({
          group: filters.groupFilter,
          query: filters.query,
          sort: filters.sortMode
        });
        const classroom = await request<Classroom, Classroom>(`/api/classes/${filters.classId}?${params.toString()}`);
        await request<StudentPet[], StudentPet[]>({
          url: "/api/pet-points/students/sync",
          method: "POST",
          data: {
            classId: classroom.id,
            className: classroom.name,
            students: classroom.students
          }
        });
        await loadPetPointsOverview();
        if (studentRequestIdRef.current !== requestId) return;
        setClassrooms(current =>
          current.some(item => item.id === classroom.id)
            ? current.map(item => (item.id === classroom.id ? classroom : item))
            : [...current, classroom]
        );
      } catch {
        if (studentRequestIdRef.current === requestId) {
          setStudentDataError("学生同步失败，请检查后端服务");
        }
      } finally {
        if (studentRequestIdRef.current === requestId) setStudentDataLoading(false);
      }
    },
    [loadPetPointsOverview]
  );

  const requestClassrooms = useCallback(async () => {
    setStudentDataLoading(true);
    setStudentDataError("");
    try {
      const data = await request<Classroom[], Classroom[]>("/api/classes");
      const nextClassrooms = data;
      const nextActiveClass = nextClassrooms[0];
      setClassrooms(nextClassrooms);
      setActiveClassId(nextActiveClass?.id ?? "");
      setStudents(current =>
        nextClassrooms.reduce((nextStudents, classroom) => replaceClassStudents(nextStudents, classroom), current)
      );
      if (nextActiveClass) {
        await requestClassroomStudents({
          classId: nextActiveClass.id,
          groupFilter: "全部分组",
          query: "",
          sortMode: "分数降序"
        });
      } else {
        await loadPetPointsOverview();
      }
    } catch {
      await loadPetPointsOverview().catch(() => undefined);
      setStudentDataError("班级数据接口获取失败，已显示现有宠物积分数据");
    } finally {
      setStudentDataLoading(false);
    }
  }, [loadPetPointsOverview, requestClassroomStudents]);

  useEffect(() => {
    if (!hydrated) return;
    requestClassrooms();
  }, [hydrated, requestClassrooms]);

  const classStudents = useMemo(
    () => students.filter(student => student.classId === activeClass.id),
    [activeClass.id, students]
  );

  const groupOptions = useMemo(
    () => [
      "全部分组",
      ...Array.from(new Set([...(activeClass.groups ?? []), ...classStudents.map(student => student.group)]))
    ],
    [activeClass.groups, classStudents]
  );

  const classStudentIds = useMemo(() => new Set(classStudents.map(student => student.id)), [classStudents]);
  const classRecords = useMemo(
    () => records.filter(record => classStudentIds.has(record.studentId)),
    [classStudentIds, records]
  );

  const filteredStudents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const result = classStudents.filter(student => {
      const matchesQuery =
        !normalized || student.name.toLowerCase().includes(normalized) || student.studentNo.includes(normalized);
      const matchesGroup = groupFilter === "全部分组" || student.group === groupFilter;
      return matchesQuery && matchesGroup;
    });
    return result.sort((a, b) => {
      if (sortMode === "分数升序") return a.score - b.score;
      if (sortMode === "姓名排序") return a.name.localeCompare(b.name, "zh-CN");
      if (sortMode === "学号排序") return a.studentNo.localeCompare(b.studentNo);
      return b.score - a.score;
    });
  }, [classStudents, groupFilter, query, sortMode]);

  const selectedStudent = students.find(student => student.id === selectedStudentId);
  const historyStudent = students.find(student => student.id === historyStudentId);
  const recordStudent = students.find(student => student.id === recordStudentId);
  const scoreAdjustStudent = students.find(student => student.id === scoreAdjustStudentId);
  const rewardStudent = classStudents.find(student => student.id === rewardStudentId) ?? classStudents[0];
  const filteredPets = petOptions.filter(pet => activeFamily === "图鉴" || pet.family === activeFamily);
  const selectedPet = petOptions.find(pet => pet.id === selectedPetId);
  const enabledCategoryRubrics = rubrics.filter(item => item.enabled && item.category === activeCategory);
  const selectedRubrics = rubrics.filter(item => selectedRubricIds.includes(item.id));
  const commonScoreRubrics = rubrics.filter(
    item => item.enabled && (scoreAdjustMode === "add" ? item.score > 0 : item.score < 0)
  );
  const availableRewards = rewards.filter(item => item.enabled);
  const evaluationTotal = selectedRubrics.reduce((sum, item) => sum + item.score, 0);
  const totalScore = classStudents.reduce((sum, student) => sum + student.score, 0);
  const averageScore = classStudents.length ? Math.round((totalScore / classStudents.length) * 10) / 10 : 0;
  const hatchedCount = classStudents.filter(student => student.petId && student.petHatched).length;

  const requestActiveClassStudents = (nextFilters: Partial<PetPointStudentFilters>) => {
    if (!hasBackendClassrooms) return;
    const filters = {
      classId: activeClass.id,
      groupFilter,
      query,
      sortMode,
      ...nextFilters
    };
    requestClassroomStudents(filters);
  };

  const switchClass = (classId: string) => {
    if (!hasBackendClassrooms) return;
    const nextClass = classrooms.find(classroom => classroom.id === classId);
    if (!nextClass) return;
    setActiveClassId(classId);
    setQuery("");
    setGroupFilter("全部分组");
    setSelectedStudentIds([]);
    setBatchMode(false);
    setEvaluationMode(null);
    setRewardStudentId("");
    requestClassroomStudents({
      classId: nextClass.id,
      groupFilter: "全部分组",
      query: "",
      sortMode
    });
  };

  const switchGroup = (nextGroup: string) => {
    setGroupFilter(nextGroup);
    setSelectedStudentIds([]);
    requestActiveClassStudents({ groupFilter: nextGroup });
  };

  const switchSortMode = (nextSortMode: SortMode) => {
    setSortMode(nextSortMode);
    requestActiveClassStudents({ sortMode: nextSortMode });
  };

  const switchQuery = (nextQuery: string) => {
    setQuery(nextQuery);
    setSelectedStudentIds([]);
    requestActiveClassStudents({ query: nextQuery });
  };

  const updateStudentScore = async (
    studentId: string,
    delta: number,
    label = delta > 0 ? "手动加分" : "手动扣分",
    note = ""
  ) => {
    const student = students.find(item => item.id === studentId);
    if (!student) return;
    await request<StudentPet[], StudentPet[]>({
      url: "/api/pet-points/scores/adjust",
      method: "POST",
      data: { studentIds: [studentId], delta, label, category: "手动调整", note }
    });
    await loadPetPointsOverview();
  };

  const openScoreAdjust = (studentId: string, mode: ScoreAdjustMode) => {
    setScoreAdjustStudentId(studentId);
    setScoreAdjustMode(mode);
    setScoreAdjustValue(1);
    setScoreAdjustReason(mode === "add" ? "手动加分" : "手动扣分");
    setScoreAdjustNote("");
  };

  const closeScoreAdjust = () => {
    setScoreAdjustStudentId(null);
    setScoreAdjustValue(1);
    setScoreAdjustReason("");
    setScoreAdjustNote("");
  };

  const applyScoreAdjust = (value = scoreAdjustValue, reason = scoreAdjustReason) => {
    if (!scoreAdjustStudent) return;
    const normalizedValue = Math.max(1, Math.min(maxEvolutionScore, Math.round(Math.abs(value))));
    const delta = scoreAdjustMode === "add" ? normalizedValue : -normalizedValue;
    void updateStudentScore(
      scoreAdjustStudent.id,
      delta,
      reason.trim() || (delta > 0 ? "手动加分" : "手动扣分"),
      scoreAdjustNote.trim()
    );
    closeScoreAdjust();
  };

  const addRubric = async () => {
    const label = newRubricLabel.trim();
    if (!label) return;
    await request<RubricItem, RubricItem>({
      url: "/api/pet-points/rubrics",
      method: "POST",
      data: {
        category: newRubricCategory,
        label,
        score: Math.max(-10, Math.min(10, Math.round(newRubricScore)))
      }
    });
    await loadPetPointsOverview();
    setNewRubricLabel("");
    setNewRubricScore(1);
  };

  const addReward = async () => {
    const name = newRewardName.trim();
    if (!name) return;
    await request<RewardItem, RewardItem>({
      url: "/api/pet-points/rewards",
      method: "POST",
      data: {
        name,
        cost: Math.max(1, Math.round(newRewardCost)),
        stock: Math.max(0, Math.round(newRewardStock))
      }
    });
    await loadPetPointsOverview();
    setNewRewardName("");
    setNewRewardCost(5);
    setNewRewardStock(1);
  };

  const redeemReward = async (reward: RewardItem) => {
    if (!rewardStudent || reward.stock <= 0 || rewardStudent.score < reward.cost) return;
    await request<RedemptionRecord, RedemptionRecord>({
      url: "/api/pet-points/rewards/redeem",
      method: "POST",
      data: {
        studentId: rewardStudent.id,
        rewardId: reward.id
      }
    });
    await loadPetPointsOverview();
    setNotice(`${rewardStudent.name} 已兑换 ${reward.name}`);
  };

  const applyEvaluation = async () => {
    if (!selectedStudentIds.length || !selectedRubrics.length) return;
    await Promise.all(
      selectedRubrics.map(item =>
        request<StudentPet[], StudentPet[]>({
          url: "/api/pet-points/scores/adjust",
          method: "POST",
          data: {
            studentIds: selectedStudentIds,
            delta: item.score,
            label: item.label,
            category: item.category,
            note: evaluationNote.trim()
          }
        })
      )
    );
    await loadPetPointsOverview();
    setNotice(`已为 ${selectedStudentIds.length} 名学生完成评分`);
    setEvaluationMode(null);
    setSelectedRubricIds([]);
    setEvaluationNote("");
    setSelectedStudentIds([]);
    setBatchMode(false);
  };

  const removeRecord = async (record: EvaluationRecord) => {
    await request<{ deleted: boolean }, { deleted: boolean }>({
      url: `/api/pet-points/records/${record.id}`,
      method: "DELETE"
    });
    await loadPetPointsOverview();
    setNotice("评价记录已删除，积分与成长能量已同步回退");
  };

  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudentIds(current =>
      current.includes(studentId) ? current.filter(id => id !== studentId) : [...current, studentId]
    );
  };

  const toggleAllVisible = () => {
    const visibleIds = filteredStudents.map(student => student.id);
    const allSelected = visibleIds.every(id => selectedStudentIds.includes(id));
    setSelectedStudentIds(current =>
      allSelected ? current.filter(id => !visibleIds.includes(id)) : Array.from(new Set([...current, ...visibleIds]))
    );
  };

  const invertVisible = () => {
    const visibleIds = filteredStudents.map(student => student.id);
    setSelectedStudentIds(current => {
      const outside = current.filter(id => !visibleIds.includes(id));
      const inverted = visibleIds.filter(id => !current.includes(id));
      return [...outside, ...inverted];
    });
  };

  const openPetPicker = (studentId: string) => {
    setSelectedStudentId(studentId);
    setSelectedPetId(null);
    setPetNickname("");
    setActiveFamily("图鉴");
  };

  const selectPet = (pet: PetOption) => {
    setSelectedPetId(pet.id);
    setPetNickname(pet.name);
  };

  const closePetPicker = () => {
    setSelectedStudentId(null);
    setSelectedPetId(null);
    setPetNickname("");
  };

  const confirmPet = async () => {
    if (!selectedStudent || !selectedPet) return;
    const nickname = petNickname.trim() || selectedPet.name;
    await request<StudentPet, StudentPet>({
      url: `/api/pet-points/students/${selectedStudent.id}/pet`,
      method: "PATCH",
      data: { petId: selectedPet.id, petName: nickname }
    });
    await loadPetPointsOverview();
    closePetPicker();
  };

  const openSettingsPanel = (panel: SettingsPanel) => {
    setSettingsPanel(panel);
    setSettingsOpen(false);
  };

  const resetPet = (student: StudentPet) => {
    setStudents(current =>
      current.map(item =>
        item.id === student.id
          ? {
              ...item,
              petId: undefined,
              petName: undefined,
              petProgress: 0,
              petHatched: false,
              score: 0,
              level: 1,
              stage: "初始形态",
              completedPets: item.completedPets + (item.petId && item.petProgress >= petEvolutionThresholds[3] ? 1 : 0)
            }
          : item
      )
    );
    setNotice("宠物养成进度已重置");
  };

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));

  const metricPicker = (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {evaluationCategories.map(category => (
          <button
            key={category}
            onClick={() => setActiveCategory(category)}
            className={cn(
              "h-10 rounded-lg bg-slate-100 text-sm font-black text-slate-500 transition",
              activeCategory === category && "bg-slate-950 text-white"
            )}
          >
            {category}
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {enabledCategoryRubrics.map(item => {
          const selected = selectedRubricIds.includes(item.id);
          return (
            <button
              key={item.id}
              onClick={() =>
                setSelectedRubricIds(current =>
                  selected ? current.filter(id => id !== item.id) : [...current, item.id]
                )
              }
              className={cn(
                "flex min-h-20 items-center justify-between rounded-xl border-2 border-slate-100 bg-white p-4 text-left transition hover:border-slate-200",
                selected && "border-orange-400 bg-orange-50"
              )}
            >
              <span className="flex items-center gap-2 font-black">
                {selected ? (
                  <CheckSquare className="h-5 w-5 text-orange-500" />
                ) : (
                  <Square className="h-5 w-5 text-slate-300" />
                )}
                {item.label}
              </span>
              <span className={cn("text-xl font-black", item.score > 0 ? "text-emerald-600" : "text-rose-500")}>
                {item.score > 0 ? `+${item.score}` : item.score}
              </span>
            </button>
          );
        })}
      </div>
      {!enabledCategoryRubrics.length && (
        <div className="mt-4 rounded-xl bg-slate-50 p-8 text-center font-bold text-slate-400">该分类暂无启用指标</div>
      )}
    </div>
  );

  return (
    <div className="relative min-h-full bg-[#f7f9fc] text-slate-950">
      {notice && (
        <div className="fixed left-1/2 top-5 z-[90] -translate-x-1/2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-xl">
          {notice}
        </div>
      )}
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-5 py-3 shadow-sm">
        <div className="flex items-center gap-3 pr-2">
          <PawPrint className="h-5 w-5 text-pink-500" />
          <h2 className="text-lg font-black">宠物积分</h2>
        </div>
        <label className="flex h-11 items-center gap-2 rounded-xl bg-slate-50 px-3 text-xl font-black hover:bg-slate-100">
          <span className="h-8 w-1.5 rounded-full bg-orange-500" />
          <select
            value={activeClass.id}
            onChange={event => switchClass(event.target.value)}
            disabled={!hasBackendClassrooms || studentDataLoading}
            className="appearance-none bg-transparent pr-5 outline-none"
            aria-label="切换班级"
          >
            {classrooms.map(classroom => (
              <option key={classroom.id} value={classroom.id}>
                {classroom.name}
              </option>
            ))}
          </select>
        </label>
        <div className="relative h-11 min-w-[210px] flex-1 xl:max-w-[340px]">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={event => switchQuery(event.target.value)}
            disabled={!hasBackendClassrooms}
            placeholder="姓名、拼音、学号"
            className="h-11 rounded-xl border-0 bg-slate-100 pl-12 text-base font-semibold shadow-none"
          />
        </div>
        {studentDataLoading && (
          <Badge className="border border-sky-100 bg-sky-50 px-3 py-2 text-sky-600 shadow-none">接口加载中</Badge>
        )}
        {studentDataError && (
          <Badge className="border border-rose-100 bg-rose-50 px-3 py-2 text-rose-600 shadow-none">
            {studentDataError}
          </Badge>
        )}
        {batchMode ? (
          <>
            <span className="rounded-xl bg-orange-50 px-4 py-3 text-sm font-black text-orange-600">
              已选 {selectedStudentIds.length} / {filteredStudents.length}
            </span>
            <Button variant="outline" className="h-11 rounded-xl font-bold" onClick={invertVisible}>
              反选
            </Button>
            <Button variant="outline" className="h-11 rounded-xl font-bold" onClick={toggleAllVisible}>
              {filteredStudents.every(student => selectedStudentIds.includes(student.id)) ? "取消全选" : "全选"}
            </Button>
            <Button
              variant="ghost"
              className="h-11 rounded-xl font-bold"
              onClick={() => {
                setBatchMode(false);
                setSelectedStudentIds([]);
              }}
            >
              取消
            </Button>
            <Button
              className="h-11 rounded-xl bg-orange-500 font-black text-white hover:bg-orange-600"
              disabled={!selectedStudentIds.length}
              onClick={() => {
                setEvaluationMode("batch");
                setSelectedRubricIds([]);
              }}
            >
              确定评分
            </Button>
          </>
        ) : (
          <>
            <label className="relative flex h-11 items-center rounded-xl border border-slate-200 bg-white pl-11 pr-3 font-bold">
              <Users className="absolute left-4 h-5 w-5 text-slate-500" />
              <select
                value={groupFilter}
                onChange={event => switchGroup(event.target.value)}
                disabled={!hasBackendClassrooms}
                className="appearance-none bg-transparent pr-5 outline-none"
                aria-label="筛选分组"
              >
                {groupOptions.map(group => (
                  <option key={group}>{group}</option>
                ))}
              </select>
            </label>
            <label className="relative flex h-11 items-center rounded-xl border border-slate-200 bg-white pl-11 pr-3 font-bold">
              <ArrowDownUp className="absolute left-4 h-5 w-5 text-slate-500" />
              <select
                value={sortMode}
                onChange={event => switchSortMode(event.target.value as SortMode)}
                disabled={!hasBackendClassrooms}
                className="appearance-none bg-transparent pr-5 outline-none"
                aria-label="排序方式"
              >
                {["分数降序", "分数升序", "姓名排序", "学号排序"].map(mode => (
                  <option key={mode}>{mode}</option>
                ))}
              </select>
            </label>
            <Button
              className="relative h-11 rounded-xl bg-gradient-to-r from-violet-500 to-sky-400 px-5 font-black text-white"
              disabled={!hasBackendClassrooms}
              onClick={() => setReportOpen(true)}
            >
              <ClipboardList className="h-5 w-5" />
              学期报告
              <Badge className="absolute -right-2 -top-2 bg-red-500 text-white">限时</Badge>
            </Button>
            <Button
              variant="ghost"
              className="h-11 rounded-xl bg-amber-100 px-4 font-bold text-amber-700 hover:bg-amber-200"
              disabled={!hasBackendClassrooms}
              onClick={() => {
                setRewardStoreOpen(true);
                setRewardStudentId(classStudents[0]?.id ?? "");
              }}
            >
              <Gift className="h-5 w-5" />
              兑换站
            </Button>
            <Button
              variant="ghost"
              className="h-11 rounded-xl bg-slate-100 px-4 font-bold"
              disabled={!hasBackendClassrooms}
              onClick={() => {
                setBatchMode(true);
                setSelectedStudentIds([]);
              }}
            >
              <BookOpen className="h-5 w-5" />
              批量
            </Button>
            <Button
              variant="ghost"
              className="h-11 rounded-xl bg-slate-100 px-4 font-bold"
              disabled={!hasBackendClassrooms}
              onClick={() => {
                setEvaluationMode("advanced");
                setSelectedStudentIds([]);
                setSelectedRubricIds([]);
              }}
            >
              <SlidersHorizontal className="h-5 w-5" />
              高级
            </Button>
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 rounded-xl bg-slate-100"
                aria-label="设置"
                disabled={!hasBackendClassrooms}
                onClick={() => setSettingsOpen(current => !current)}
              >
                <Settings className="h-5 w-5" />
              </Button>
              {settingsOpen && (
                <div className="absolute right-0 top-12 z-20 grid w-44 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                  {(["指标配置", "奖品配置", "等级规则", "宠物统计", "最近评分", "积分统计"] as SettingsPanel[]).map(
                    panel => (
                      <button
                        key={panel}
                        onClick={() => openSettingsPanel(panel)}
                        className="rounded-lg px-3 py-2 text-left text-sm font-bold hover:bg-slate-100"
                      >
                        {panel}
                      </button>
                    )
                  )}
                  <button
                    onClick={() => {
                      setSettingsOpen(false);
                      setConfirmAction({
                        title: "刷新宠物积分数据",
                        description: "将重新从后端读取学生积分、宠物、评价记录、奖品和指标配置。",
                        confirmLabel: "确认刷新",
                        onConfirm: () => {
                          void loadPetPointsOverview().then(() => setNotice("后端数据已刷新"));
                        }
                      });
                    }}
                    className="rounded-lg px-3 py-2 text-left text-sm font-bold text-sky-600 hover:bg-sky-50"
                  >
                    刷新后端数据
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </header>

      <main className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-2 2xl:grid-cols-3">
        {filteredStudents.map(student => {
          const pet = petOptions.find(item => item.id === student.petId);
          const genericEvolutionIndex = getEvolutionIndex(student.score);
          const petEvolutionIndex = getPetEvolutionIndex(student.petProgress);
          const currentFormName = pet?.evolutions[petEvolutionIndex];
          const nextPetThreshold = petEvolutionThresholds[petEvolutionIndex + 1];
          const growthValue = pet ? student.petProgress : student.score;
          const percent = Math.round((growthValue / student.maxScore) * 100);
          const petEffect = petEffects[student.id];
          return (
            <section
              key={student.id}
              className={cn(
                "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
                selectedStudentIds.includes(student.id) && "border-orange-400 ring-2 ring-orange-200"
              )}
            >
              <div className="relative flex h-48 items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-[radial-gradient(circle_at_center,#ffffff_0%,#f8fafc_72%)]">
                {batchMode && (
                  <span
                    className={cn(
                      "absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 bg-white",
                      selectedStudentIds.includes(student.id)
                        ? "border-orange-500 text-orange-500"
                        : "border-slate-200 text-slate-300"
                    )}
                  >
                    {selectedStudentIds.includes(student.id) ? <Check className="h-4 w-4" /> : null}
                  </span>
                )}
                {student.trophies > 0 && (
                  <Badge className="absolute left-3 top-3 z-10 border border-orange-200 bg-white px-3 py-1 text-orange-500 shadow-none">
                    <Trophy className="h-4 w-4" /> x{student.trophies}
                  </Badge>
                )}
                <button
                  onClick={() => (batchMode ? toggleStudentSelection(student.id) : openPetPicker(student.id))}
                  className="group flex h-full w-full items-center justify-center"
                  aria-label={`为${student.name}选择宠物`}
                >
                  {pet && student.petHatched ? (
                    <div className="text-center">
                      <PetSprite
                        key={`${pet.id}-${petEvolutionIndex}-${petEffect ?? "idle"}`}
                        pet={pet}
                        stageIndex={petEvolutionIndex}
                        className={cn(
                          "mx-auto w-36 animate-in fade-in zoom-in-75 duration-500 group-hover:scale-105",
                          petEffect && "pet-evolution-pop"
                        )}
                      />
                      <div className="flex items-center justify-center gap-1.5">
                        <span className={cn("rounded-full px-2 py-1 text-[11px] font-black", pet.badge)}>
                          {pet.family}
                        </span>
                        <span className="rounded-full bg-white/90 px-2 py-1 text-xs font-black text-slate-600 shadow-sm">
                          {currentFormName}
                        </span>
                      </div>
                    </div>
                  ) : pet ? (
                    <PetEgg
                      key={`${pet.id}-egg-${student.petProgress}`}
                      pet={pet}
                      progress={student.petProgress}
                      className="w-40 transition duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <IncubatingEgg
                      key={`egg-${student.score}`}
                      score={student.score}
                      className="w-40 transition duration-300 group-hover:scale-105"
                    />
                  )}
                </button>
                {petEffect && pet && (
                  <div
                    className={cn(
                      "pointer-events-none absolute inset-0 z-[8] flex items-center justify-center overflow-hidden rounded-2xl",
                      petEffect === "hatch" ? "pet-hatch-effect" : "pet-evolve-effect"
                    )}
                  >
                    <span className="pet-effect-ring absolute h-28 w-28 rounded-full border-4 border-white/80" />
                    <span className="pet-effect-ring pet-effect-ring-delay absolute h-40 w-40 rounded-full border-2 border-amber-300/70" />
                    <div className="relative flex flex-col items-center rounded-xl bg-white/90 px-5 py-3 text-center shadow-xl">
                      <Sparkles className="h-7 w-7 animate-pulse text-amber-500" />
                      <strong className="mt-1 text-lg font-black text-slate-950">
                        {petEffect === "hatch" ? "孵化成功" : "进化成功"}
                      </strong>
                      <span className="text-xs font-bold text-slate-500">
                        {petEffect === "hatch" ? pet.evolutions[0] : currentFormName}
                      </span>
                    </div>
                  </div>
                )}
                {!batchMode && (
                  <div className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-3">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-11 w-11 rounded-xl bg-white/90"
                      onClick={() => setRecordStudentId(student.id)}
                      aria-label="评价记录"
                    >
                      <ClipboardList className="h-5 w-5 text-slate-500" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-11 w-11 rounded-xl bg-white/90"
                      onClick={() => setHistoryStudentId(student.id)}
                      aria-label="养成记录"
                    >
                      <History className="h-5 w-5 text-slate-500" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-end justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black leading-5">{student.name}</h3>
                  <p className="font-black tracking-wide text-black">#{student.studentNo}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 rounded-lg bg-rose-50 text-rose-500"
                    onClick={() => openScoreAdjust(student.id, "subtract")}
                    disabled={batchMode}
                    aria-label={`为${student.name}扣分`}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <div className="text-3xl font-black text-slate-950">
                    {student.score}
                    <span className="text-lg text-slate-300">/{student.maxScore}</span>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600"
                    onClick={() => openScoreAdjust(student.id, "add")}
                    disabled={batchMode}
                    aria-label={`为${student.name}加分`}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div
                className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100"
                aria-label={`${pet ? "宠物成长" : "孵化"}进度${percent}%`}
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-500 to-yellow-400 transition-all duration-300"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <div className="mt-2 flex items-center gap-3">
                <Badge className="bg-orange-100 text-orange-600 hover:bg-orange-100">
                  {pet && !student.petHatched ? "孵化中" : `Lv.${student.level}`}
                </Badge>
                <span className="text-sm font-black text-slate-500">
                  {pet ? (student.petHatched ? student.stage : `${pet.name}蛋`) : eggStages[genericEvolutionIndex]}
                </span>
                <span className={cn("ml-auto text-xs font-bold", pet ? "text-emerald-600" : "text-amber-600")}>
                  {pet
                    ? !student.petHatched
                      ? `再得 ${hatchThreshold - student.petProgress} 分孵化`
                      : nextPetThreshold
                        ? `再得 ${nextPetThreshold - student.petProgress} 分进化`
                        : "已达终极形态"
                    : student.score >= evolutionThresholds[3]
                      ? "能量已满，点击选择宠物蛋"
                      : `再得 ${evolutionThresholds[genericEvolutionIndex + 1]! - student.score} 分进入下一阶段`}
                </span>
              </div>
            </section>
          );
        })}
      </main>

      {!filteredStudents.length && (
        <div className="flex min-h-72 flex-col items-center justify-center text-slate-300">
          <Search className="h-10 w-10" />
          <p className="mt-3 font-black">没有匹配的学生</p>
        </div>
      )}

      {evaluationMode === "batch" && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <section className="w-full max-w-[760px] rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-black">批量评分</h3>
                <p className="mt-1 text-sm font-semibold text-slate-400">
                  已选择 {selectedStudentIds.length} 名学生，可同时选择多个评价指标
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setEvaluationMode(null)} aria-label="关闭批量评分">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="mt-5">{metricPicker}</div>
            <Input
              value={evaluationNote}
              onChange={event => setEvaluationNote(event.target.value)}
              maxLength={60}
              placeholder="添加评价备注（可选）"
              className="mt-5 h-11 rounded-xl bg-slate-50"
            />
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
              <p className="font-bold text-slate-500">
                已选 {selectedRubrics.length} 项，每人合计{" "}
                <span className={cn("text-xl font-black", evaluationTotal >= 0 ? "text-emerald-600" : "text-rose-500")}>
                  {evaluationTotal > 0 ? `+${evaluationTotal}` : evaluationTotal}
                </span>
              </p>
              <Button
                onClick={() => void applyEvaluation()}
                disabled={!selectedRubrics.length}
                className="h-11 rounded-xl bg-orange-500 px-6 font-black text-white hover:bg-orange-600"
              >
                <Save className="h-5 w-5" />
                确认评分
              </Button>
            </div>
          </section>
        </div>
      )}

      {evaluationMode === "advanced" && (
        <div className="absolute inset-0 z-40 bg-[#f7f9fc] p-4 sm:p-6">
          <section className="mx-auto flex h-full max-w-[1280px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="text-xl font-black">高级评分</h3>
                <p className="text-sm font-semibold text-slate-400">批量选择学生和多个评价指标</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-orange-50 px-3 py-2 text-sm font-black text-orange-600">
                  学生 {selectedStudentIds.length}
                </span>
                <span className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-600">
                  指标 {selectedRubrics.length}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setEvaluationMode(null);
                    setSelectedStudentIds([]);
                    setSelectedRubricIds([]);
                  }}
                  aria-label="关闭高级评分"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[340px_1fr]">
              <aside className="overflow-y-auto border-r border-slate-100 bg-slate-50 p-5">
                <div className="flex items-center justify-between">
                  <h4 className="font-black">选择学生</h4>
                  <button
                    onClick={() =>
                      setSelectedStudentIds(
                        selectedStudentIds.length === classStudents.length
                          ? []
                          : classStudents.map(student => student.id)
                      )
                    }
                    className="text-sm font-black text-orange-600"
                  >
                    {selectedStudentIds.length === classStudents.length ? "取消全选" : "全选"}
                  </button>
                </div>
                <div className="mt-4 grid gap-2">
                  {classStudents.map(student => {
                    const selected = selectedStudentIds.includes(student.id);
                    return (
                      <button
                        key={student.id}
                        onClick={() => toggleStudentSelection(student.id)}
                        className={cn(
                          "flex items-center justify-between rounded-xl border-2 border-transparent bg-white p-3 text-left",
                          selected && "border-orange-400 bg-orange-50"
                        )}
                      >
                        <span>
                          <strong className="block text-sm">{student.name}</strong>
                          <span className="text-xs font-semibold text-slate-400">
                            {student.group} · #{student.studentNo}
                          </span>
                        </span>
                        {selected ? (
                          <CheckSquare className="h-5 w-5 text-orange-500" />
                        ) : (
                          <Square className="h-5 w-5 text-slate-300" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </aside>
              <div className="min-h-0 overflow-y-auto p-5 sm:p-6">
                <h4 className="mb-4 font-black">选择评价指标</h4>
                {metricPicker}
                <Input
                  value={evaluationNote}
                  onChange={event => setEvaluationNote(event.target.value)}
                  maxLength={60}
                  placeholder="添加评价备注（可选）"
                  className="mt-5 h-11 rounded-xl bg-slate-50"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
              <p className="font-bold text-slate-500">
                每人合计{" "}
                <span className={cn("text-xl font-black", evaluationTotal >= 0 ? "text-emerald-600" : "text-rose-500")}>
                  {evaluationTotal > 0 ? `+${evaluationTotal}` : evaluationTotal}
                </span>
              </p>
              <Button
                onClick={() => void applyEvaluation()}
                disabled={!selectedStudentIds.length || !selectedRubrics.length}
                className="h-11 rounded-xl bg-slate-950 px-7 font-black text-white hover:bg-slate-800"
              >
                <Save className="h-5 w-5" />
                确认评分
              </Button>
            </div>
          </section>
        </div>
      )}

      {recordStudent && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/45 p-4">
          <section className="flex max-h-[82vh] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h3 className="text-xl font-black">{recordStudent.name} 的评价记录</h3>
                <p className="mt-1 text-sm font-semibold text-slate-400">
                  累计 {recordStudent.score} 分 ·{" "}
                  {records.filter(record => record.studentId === recordStudent.id).length} 次评价
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setRecordStudentId(null)} aria-label="关闭评价记录">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex items-center justify-between bg-amber-50 px-6 py-3">
              <span className="font-black text-amber-800">今日请假</span>
              <button
                onClick={() =>
                  setStudents(current =>
                    current.map(student =>
                      student.id === recordStudent.id ? { ...student, absent: !student.absent } : student
                    )
                  )
                }
                className={cn(
                  "relative h-7 w-12 rounded-full transition",
                  recordStudent.absent ? "bg-orange-500" : "bg-slate-300"
                )}
                aria-pressed={recordStudent.absent}
              >
                <span
                  className={cn(
                    "absolute top-1 h-5 w-5 rounded-full bg-white transition",
                    recordStudent.absent ? "left-6" : "left-1"
                  )}
                />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {records.filter(record => record.studentId === recordStudent.id).length ? (
                <div className="grid gap-3">
                  {records
                    .filter(record => record.studentId === recordStudent.id)
                    .map(record => (
                      <article
                        key={record.id}
                        className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4"
                      >
                        <span
                          className={cn(
                            "flex h-10 min-w-10 items-center justify-center rounded-lg px-2 text-base font-black",
                            (record.delta || record.petDelta || 0) > 0
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-rose-100 text-rose-600"
                          )}
                        >
                          {record.delta
                            ? record.delta > 0
                              ? `+${record.delta}`
                              : record.delta
                            : `${(record.petDelta ?? 0) > 0 ? "+" : ""}${record.petDelta ?? 0}能量`}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <strong>{record.label}</strong>
                            <Badge variant="outline">{record.category}</Badge>
                          </div>
                          {record.note && <p className="mt-1 text-sm font-semibold text-slate-500">{record.note}</p>}
                          <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-slate-400">
                            <Clock3 className="h-3.5 w-3.5" />
                            {formatDate(record.createdAt)}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-rose-500 hover:bg-rose-100 hover:text-rose-600"
                          onClick={() =>
                            setConfirmAction({
                              title: "删除评价记录",
                              description: `删除“${record.label}”后，将回退 ${Math.abs(record.delta)} 分${record.petDelta ? `，并回退 ${Math.abs(record.petDelta)} 点成长能量` : ""}。`,
                              confirmLabel: "确认删除",
                              onConfirm: () => removeRecord(record)
                            })
                          }
                          aria-label="删除评价记录"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </article>
                    ))}
                </div>
              ) : (
                <div className="flex min-h-56 flex-col items-center justify-center text-center text-slate-300">
                  <Sparkles className="h-10 w-10" />
                  <p className="mt-4 text-lg font-black">静候佳音</p>
                  <p className="mt-1 text-sm font-semibold">还没有评价记录</p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {selectedStudent && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-5">
          <section className="flex h-[84vh] w-full max-w-[1120px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-6 py-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-100 text-orange-500">
                <PawPrint className="h-6 w-6" />
              </div>
              <div className="mr-2">
                <h3 className="text-xl font-black">为 {selectedStudent.name} 选择孵化星灵</h3>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-300">Class Starling System</p>
              </div>
              <div className="flex flex-1 flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1 sm:flex-nowrap">
                {families.map(family => (
                  <button
                    key={family}
                    onClick={() => setActiveFamily(family)}
                    className={cn(
                      "flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-black text-slate-400 transition",
                      activeFamily === family && "bg-white text-orange-600 shadow-sm"
                    )}
                  >
                    <FamilyIcon family={family} />
                    {family}
                  </button>
                ))}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-lg"
                onClick={closePetPicker}
                aria-label="关闭宠物选择"
              >
                <X className="h-6 w-6" />
              </Button>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1.75fr_1fr]">
              <div className="grid auto-rows-[180px] grid-cols-2 gap-4 overflow-y-auto bg-[#f7f9fc] p-5 sm:grid-cols-3">
                {filteredPets.map(pet => (
                  <button
                    key={pet.id}
                    onClick={() => selectPet(pet)}
                    className={cn(
                      "relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-transparent bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
                      selectedPetId === pet.id && "border-orange-400 shadow-md"
                    )}
                  >
                    {selectedPetId === pet.id && (
                      <span className="absolute right-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-white">
                        <Check className="h-4 w-4" />
                      </span>
                    )}
                    <span
                      className={cn(
                        "absolute left-3 top-3 z-10 rounded-full px-2 py-1 text-[11px] font-black",
                        pet.badge
                      )}
                    >
                      {pet.family}
                    </span>
                    <div
                      className={cn(
                        "flex h-28 w-full items-center justify-center rounded-xl bg-gradient-to-br",
                        pet.tone
                      )}
                    >
                      <PetSprite pet={pet} className="w-24" />
                    </div>
                    <div className="mt-2 w-full border-t border-dashed border-slate-200 pt-2 text-left text-base font-black">
                      {pet.name}
                    </div>
                  </button>
                ))}
              </div>

              <aside className="flex min-h-0 flex-col border-l border-slate-100 bg-white p-6">
                {selectedPet ? (
                  <div className="flex min-h-0 flex-1 flex-col">
                    <div
                      className={cn(
                        "flex min-h-[220px] items-center justify-center rounded-2xl bg-gradient-to-br",
                        selectedPet.tone
                      )}
                    >
                      <PetEgg pet={selectedPet} progress={0} className="w-[220px] max-w-full" />
                    </div>
                    <div className="mt-5 flex items-center gap-2">
                      <h4 className="text-2xl font-black">{selectedPet.name}</h4>
                      <span className={cn("rounded-full px-2.5 py-1 text-xs font-black", selectedPet.badge)}>
                        {selectedPet.family}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{selectedPet.description}</p>
                    <div className="mt-4 grid grid-cols-4 gap-1 rounded-xl bg-slate-50 p-2">
                      {selectedPet.evolutions.map((formName, index) => (
                        <div key={formName} className="min-w-0 px-1 py-2 text-center">
                          <div
                            className={cn(
                              "mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black",
                              index === 0 ? selectedPet.badge : "bg-white text-slate-400"
                            )}
                          >
                            {index + 1}
                          </div>
                          <p className="truncate text-[11px] font-black text-slate-600" title={formName}>
                            {formName}
                          </p>
                          <p className="mt-0.5 text-[10px] font-bold text-slate-400">
                            {petEvolutionThresholds[index]} 能量
                          </p>
                        </div>
                      ))}
                    </div>
                    <Input
                      value={petNickname}
                      onChange={event => setPetNickname(event.target.value)}
                      maxLength={12}
                      placeholder="输入它独一无二的名字..."
                      className="mt-5 h-11 rounded-xl border-0 bg-slate-100 px-4 font-semibold shadow-none"
                    />
                    <Button
                      onClick={() => void confirmPet()}
                      className="mt-4 h-12 rounded-xl bg-slate-950 text-base font-black text-white hover:bg-slate-800"
                    >
                      确认选择宠物蛋
                      <Check className="h-5 w-5" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center text-center text-slate-200">
                    <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-dashed border-slate-100">
                      <Sparkles className="h-10 w-10" />
                    </div>
                    <p className="mt-6 text-xl font-black">Waiting for selection</p>
                    <p className="mt-2 text-xs font-black uppercase tracking-[0.18em]">Scanner active...</p>
                  </div>
                )}
              </aside>
            </div>
          </section>
        </div>
      )}

      {historyStudent && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
          <section className="max-h-[84vh] w-full max-w-[720px] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-black">{historyStudent.name} 的成长历程</h3>
                <p className="text-sm font-semibold text-slate-400">#{historyStudent.studentNo}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setHistoryStudentId(null)} aria-label="关闭记录">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl bg-orange-50 p-4">
                <PawPrint className="h-5 w-5 text-orange-500" />
                <strong className="mt-3 block text-2xl">{historyStudent.completedPets}</strong>
                <span className="text-sm font-bold text-orange-700">累计完成宠物</span>
              </div>
              <div className="rounded-xl bg-amber-50 p-4">
                <Medal className="h-5 w-5 text-amber-500" />
                <strong className="mt-3 block text-2xl">{historyStudent.trophies}</strong>
                <span className="text-sm font-bold text-amber-700">当前徽章</span>
              </div>
              <div className="rounded-xl bg-sky-50 p-4">
                <Sparkles className="h-5 w-5 text-sky-500" />
                <strong className="mt-3 block text-2xl">
                  {historyStudent.petId && !historyStudent.petHatched ? "孵化中" : `Lv.${historyStudent.level}`}
                </strong>
                <span className="text-sm font-bold text-sky-700">
                  {historyStudent.petId ? `${historyStudent.petProgress}/${maxEvolutionScore} 能量` : "未绑定宠物蛋"}
                </span>
              </div>
            </div>
            <div className="mt-5 rounded-xl border border-slate-100 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-black">当前养成</h4>
                  <p className="text-sm font-semibold text-slate-400">{historyStudent.petName ?? "尚未选择宠物"}</p>
                </div>
                <Button
                  variant="outline"
                  className="rounded-lg font-bold text-rose-500"
                  disabled={!historyStudent.petId}
                  onClick={() =>
                    setConfirmAction({
                      title: "重置当前宠物",
                      description: "将清空当前宠物和积分进度；已达到终极形态的宠物会计入完成数量。",
                      confirmLabel: "确认重置",
                      onConfirm: () => resetPet(historyStudent)
                    })
                  }
                >
                  <RotateCcw className="h-4 w-4" />
                  重置
                </Button>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2">
                {evolutionStages.map((stage, index) => (
                  <div
                    key={stage}
                    className={cn(
                      "rounded-lg p-3 text-center",
                      historyStudent.petHatched && historyStudent.level > index
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-50 text-slate-300"
                    )}
                  >
                    <div className="font-black">{index + 1}</div>
                    <div className="mt-1 text-xs font-bold">{stage}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-5 rounded-xl border border-slate-100 p-5">
              <div className="flex items-center justify-between">
                <h4 className="font-black">成长徽章</h4>
                <span className="text-xs font-bold text-slate-400">教师可手动调整</span>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-lg"
                  disabled={!historyStudent.trophies}
                  onClick={() =>
                    setStudents(current =>
                      current.map(student =>
                        student.id === historyStudent.id
                          ? { ...student, trophies: Math.max(0, student.trophies - 1) }
                          : student
                      )
                    )
                  }
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <div className="flex min-w-28 items-center justify-center gap-2 rounded-xl bg-amber-50 px-5 py-3 text-xl font-black text-amber-600">
                  <Trophy className="h-5 w-5" />
                  {historyStudent.trophies}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-lg"
                  onClick={() =>
                    setStudents(current =>
                      current.map(student =>
                        student.id === historyStudent.id ? { ...student, trophies: student.trophies + 1 } : student
                      )
                    )
                  }
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="mt-5">
              <h4 className="font-black">成长成就</h4>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {[
                  { score: 4, label: "破壳新星" },
                  { score: 18, label: "成长伙伴" },
                  { score: 26, label: "终极羁绊" }
                ].map(achievement => (
                  <div
                    key={achievement.label}
                    className={cn(
                      "rounded-xl border p-4",
                      historyStudent.petProgress >= achievement.score
                        ? "border-orange-200 bg-orange-50"
                        : "border-slate-100 bg-slate-50 text-slate-300"
                    )}
                  >
                    <AwardIcon unlocked={historyStudent.petProgress >= achievement.score} />
                    <strong className="mt-2 block">{achievement.label}</strong>
                    <span className="text-xs font-bold">达到 {achievement.score} 成长能量</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                variant="outline"
                className="h-11 flex-1 rounded-xl font-black"
                onClick={() => setNotice("成长奖状已生成并保存到本地记录")}
              >
                <FileText className="h-5 w-5" />
                创建奖状
              </Button>
              <Button
                className="h-11 flex-1 rounded-xl bg-slate-950 font-black text-white"
                disabled={!historyStudent.petId}
                onClick={() => setNotice("宠物合影已加入成长档案")}
              >
                <PawPrint className="h-5 w-5" />
                宠物合影
              </Button>
            </div>
            <div className="mt-5 rounded-xl bg-slate-50 p-5">
              <div className="flex items-center gap-2">
                <Gift className="h-5 w-5 text-slate-400" />
                <h4 className="font-black">兑换记录</h4>
              </div>
              <p className="mt-4 text-center text-sm font-semibold text-slate-400">暂时没有奖品兑换记录</p>
            </div>
          </section>
        </div>
      )}

      {reportOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/45 p-4">
          <section className="max-h-[84vh] w-full max-w-[900px] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black">{activeClass.name}学期成长报告</h3>
                <p className="text-sm font-semibold text-slate-400">积分、评价与宠物养成概览</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setReportOpen(false)} aria-label="关闭学期报告">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "班级总积分", value: totalScore, icon: BarChart3 },
                { label: "人均积分", value: averageScore, icon: Sparkles },
                { label: "评价次数", value: classRecords.length, icon: ClipboardList },
                { label: "已孵化宠物", value: hatchedCount, icon: PawPrint }
              ].map(item => (
                <div key={item.label} className="rounded-xl bg-slate-50 p-4">
                  <item.icon className="h-5 w-5 text-orange-500" />
                  <strong className="mt-3 block text-2xl">{item.value}</strong>
                  <span className="text-sm font-bold text-slate-500">{item.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <div>
                <h4 className="font-black">积分排行</h4>
                <div className="mt-3 grid gap-2">
                  {[...classStudents]
                    .sort((a, b) => b.score - a.score)
                    .map((student, index) => (
                      <div key={student.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                        <span
                          className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-lg font-black",
                            index === 0 ? "bg-amber-100 text-amber-700" : "bg-white text-slate-400"
                          )}
                        >
                          {index + 1}
                        </span>
                        <span className="flex-1 font-bold">
                          {student.name}
                          <small className="ml-2 text-slate-400">{student.group}</small>
                        </span>
                        <strong>{student.score} 分</strong>
                      </div>
                    ))}
                </div>
              </div>
              <div>
                <h4 className="font-black">评价分类统计</h4>
                <div className="mt-3 grid gap-3">
                  {evaluationCategories.map(category => {
                    const categoryRecords = classRecords.filter(record => record.category === category);
                    const categoryScore = categoryRecords.reduce((sum, record) => sum + record.delta, 0);
                    return (
                      <div key={category} className="rounded-xl border border-slate-100 p-4">
                        <div className="flex justify-between font-bold">
                          <span>{category}</span>
                          <span>{categoryScore > 0 ? `+${categoryScore}` : categoryScore} 分</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-orange-400"
                            style={{
                              width: `${classRecords.length ? Math.max(8, (categoryRecords.length / classRecords.length) * 100) : 0}%`
                            }}
                          />
                        </div>
                        <p className="mt-2 text-xs font-semibold text-slate-400">{categoryRecords.length} 条记录</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {settingsPanel && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/45 p-4">
          <section className="max-h-[84vh] w-full max-w-[760px] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black">{settingsPanel}</h3>
                <p className="text-sm font-semibold text-slate-400">宠物积分本地配置与数据概览</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSettingsPanel(null)} aria-label="关闭设置">
                <X className="h-5 w-5" />
              </Button>
            </div>
            {settingsPanel === "指标配置" && (
              <div className="mt-5 grid gap-3">
                {rubrics.map(item => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 p-4"
                  >
                    <button
                      onClick={() =>
                        setRubrics(current =>
                          current.map(rubric =>
                            rubric.id === item.id ? { ...rubric, enabled: !rubric.enabled } : rubric
                          )
                        )
                      }
                      className={cn(
                        "relative h-7 w-12 rounded-full transition",
                        item.enabled ? "bg-emerald-500" : "bg-slate-300"
                      )}
                      aria-label={`${item.enabled ? "停用" : "启用"}${item.label}`}
                    >
                      <span
                        className={cn(
                          "absolute top-1 h-5 w-5 rounded-full bg-white transition",
                          item.enabled ? "left-6" : "left-1"
                        )}
                      />
                    </button>
                    <div className="min-w-32 flex-1">
                      <strong className="block">{item.label}</strong>
                      <span className="text-xs font-semibold text-slate-400">{item.category}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() =>
                        setRubrics(current =>
                          current.map(rubric =>
                            rubric.id === item.id ? { ...rubric, score: Math.max(-10, rubric.score - 1) } : rubric
                          )
                        )
                      }
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <strong className={cn("w-10 text-center", item.score >= 0 ? "text-emerald-600" : "text-rose-500")}>
                      {item.score > 0 ? `+${item.score}` : item.score}
                    </strong>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() =>
                        setRubrics(current =>
                          current.map(rubric =>
                            rubric.id === item.id ? { ...rubric, score: Math.min(10, rubric.score + 1) } : rubric
                          )
                        )
                      }
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {settingsPanel === "等级规则" && (
              <div className="mt-5">
                <p className="rounded-xl bg-orange-50 p-4 text-sm font-bold leading-6 text-orange-800">
                  选择宠物后会先获得对应宠物蛋，旧积分不会继承为成长能量。获得 4
                  点新能量后孵化第一形态，随后逐级进化，最多四个形态。
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  {evolutionStages.map((stage, index) => (
                    <div key={stage} className="rounded-xl border border-slate-100 p-4 text-center">
                      <strong className="text-2xl text-orange-500">{petEvolutionThresholds[index]}</strong>
                      <span className="mt-2 block text-sm font-black">{stage}</span>
                      <span className="text-xs font-semibold text-slate-400">成长能量</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {settingsPanel === "宠物统计" && (
              <div className="mt-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <StatTile label="已孵化" value={hatchedCount} />
                  <StatTile label="待孵化" value={classStudents.length - hatchedCount} />
                  <StatTile
                    label="终极形态"
                    value={classStudents.filter(student => student.petHatched && student.level === 4).length}
                  />
                </div>
                <div className="mt-5 grid gap-2">
                  {families
                    .filter(family => family !== "图鉴")
                    .map(family => (
                      <div key={family} className="flex items-center justify-between rounded-xl bg-slate-50 p-4">
                        <span className="flex items-center gap-2 font-black">
                          <FamilyIcon family={family} />
                          {family}
                        </span>
                        <strong>
                          {
                            classStudents.filter(
                              student => petOptions.find(pet => pet.id === student.petId)?.family === family
                            ).length
                          }{" "}
                          只
                        </strong>
                      </div>
                    ))}
                </div>
              </div>
            )}
            {settingsPanel === "最近评分" && (
              <div className="mt-5 grid gap-3">
                {classRecords.slice(0, 10).map(record => {
                  const student = students.find(item => item.id === record.studentId);
                  const displayDelta = record.delta || record.petDelta || 0;
                  return (
                    <div key={record.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-4">
                      <span className={cn("font-black", displayDelta > 0 ? "text-emerald-600" : "text-rose-500")}>
                        {displayDelta > 0 ? `+${displayDelta}` : displayDelta}
                        {!record.delta && record.petDelta ? "能量" : ""}
                      </span>
                      <span className="flex-1 font-bold">
                        {student?.name} · {record.label}
                      </span>
                      <span className="text-xs font-semibold text-slate-400">{formatDate(record.createdAt)}</span>
                    </div>
                  );
                })}
                {!classRecords.length && <p className="py-16 text-center font-bold text-slate-400">暂无评分记录</p>}
              </div>
            )}
            {settingsPanel === "积分统计" && (
              <div className="mt-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <StatTile label="班级总分" value={totalScore} />
                  <StatTile label="平均分" value={averageScore} />
                  <StatTile label="最高分" value={Math.max(0, ...classStudents.map(student => student.score))} />
                </div>
                <div className="mt-5 grid gap-3">
                  {classStudents.map(student => (
                    <div key={student.id}>
                      <div className="flex justify-between text-sm font-bold">
                        <span>{student.name}</span>
                        <span>
                          {student.score}/{student.maxScore}
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-orange-500 to-yellow-400"
                          style={{ width: `${(student.score / student.maxScore) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {scoreAdjustStudent && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <section className="w-full max-w-[560px] rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-black">
                  {scoreAdjustMode === "add" ? "加分" : "扣分"} · {scoreAdjustStudent.name}
                </h3>
                <p className="mt-1 text-sm font-semibold text-slate-400">
                  当前 {scoreAdjustStudent.score}/{scoreAdjustStudent.maxScore} 分，宠物能量{" "}
                  {scoreAdjustStudent.petProgress}/{maxEvolutionScore}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={closeScoreAdjust} aria-label="关闭积分调整">
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
              {[
                { mode: "add" as ScoreAdjustMode, label: "加分", icon: Plus },
                { mode: "subtract" as ScoreAdjustMode, label: "扣分", icon: Minus }
              ].map(item => (
                <button
                  key={item.mode}
                  onClick={() => {
                    setScoreAdjustMode(item.mode);
                    setScoreAdjustReason(item.mode === "add" ? "手动加分" : "手动扣分");
                    setScoreAdjustValue(1);
                  }}
                  className={cn(
                    "flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-black text-slate-500 transition",
                    scoreAdjustMode === item.mode &&
                      (item.mode === "add" ? "bg-emerald-500 text-white shadow-sm" : "bg-rose-500 text-white shadow-sm")
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mt-5">
              <h4 className="text-sm font-black text-slate-500">常用项目</h4>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {commonScoreRubrics.map(item => (
                  <button
                    key={item.id}
                    onClick={() => applyScoreAdjust(Math.abs(item.score), item.label)}
                    className="flex min-h-16 items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-4 text-left transition hover:border-orange-200 hover:bg-orange-50"
                  >
                    <span>
                      <strong className="block">{item.label}</strong>
                      <span className="text-xs font-semibold text-slate-400">{item.category}</span>
                    </span>
                    <span className={cn("text-xl font-black", item.score > 0 ? "text-emerald-600" : "text-rose-500")}>
                      {item.score > 0 ? `+${item.score}` : item.score}
                    </span>
                  </button>
                ))}
              </div>
              {!commonScoreRubrics.length && (
                <p className="mt-3 rounded-xl bg-slate-50 p-5 text-center text-sm font-bold text-slate-400">
                  暂无启用的{scoreAdjustMode === "add" ? "加分" : "扣分"}项目
                </p>
              )}
            </div>

            <div className="mt-5 grid gap-3 rounded-xl border border-slate-100 p-4">
              <label className="text-sm font-black text-slate-500" htmlFor="score-adjust-value">
                自定义分值
              </label>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 rounded-lg"
                  onClick={() => setScoreAdjustValue(value => Math.max(1, value - 1))}
                  aria-label="减少调整分值"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  id="score-adjust-value"
                  type="number"
                  min={1}
                  max={maxEvolutionScore}
                  value={scoreAdjustValue}
                  onChange={event =>
                    setScoreAdjustValue(Math.max(1, Math.min(maxEvolutionScore, Number(event.target.value) || 1)))
                  }
                  className="h-11 flex-1 rounded-xl bg-slate-50 text-center text-xl font-black"
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 rounded-lg"
                  onClick={() => setScoreAdjustValue(value => Math.min(maxEvolutionScore, value + 1))}
                  aria-label="增加调整分值"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <Input
                value={scoreAdjustReason}
                onChange={event => setScoreAdjustReason(event.target.value)}
                maxLength={20}
                placeholder="调整原因"
                className="h-11 rounded-xl bg-slate-50"
              />
              <Input
                value={scoreAdjustNote}
                onChange={event => setScoreAdjustNote(event.target.value)}
                maxLength={60}
                placeholder="备注（可选）"
                className="h-11 rounded-xl bg-slate-50"
              />
              <Button
                onClick={() => applyScoreAdjust()}
                className={cn(
                  "h-12 rounded-xl text-base font-black text-white",
                  scoreAdjustMode === "add" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-rose-500 hover:bg-rose-600"
                )}
              >
                确认{scoreAdjustMode === "add" ? "加" : "扣"} {scoreAdjustValue} 分
                <Check className="h-5 w-5" />
              </Button>
            </div>
          </section>
        </div>
      )}

      {confirmAction && (
        <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/55 p-4">
          <section className="w-full max-w-[420px] rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-100 text-rose-500">
              <Trash2 className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-xl font-black">{confirmAction.title}</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{confirmAction.description}</p>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" className="rounded-xl font-bold" onClick={() => setConfirmAction(null)}>
                取消
              </Button>
              <Button
                className="rounded-xl bg-rose-500 font-black text-white hover:bg-rose-600"
                onClick={() => {
                  confirmAction.onConfirm();
                  setConfirmAction(null);
                }}
              >
                {confirmAction.confirmLabel}
              </Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
