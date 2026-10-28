import { cn } from "@/lib/utils";
type PetFamily = "图鉴" | "萌芽系" | "焰岩系" | "潮汐系" | "星辉系";

interface PetOption {
  id: string;
  name: string;
  family: Exclude<PetFamily, "图鉴">;
  description: string;
  tone: string;
  badge: string;
  evolutions: readonly [string, string, string, string];
}

export const formStages = [
  "宠物蛋",
  "幼生形态",
  "萌发形态",
  "成长形态",
  "蓄能形态",
  "进阶形态",
  "觉醒形态",
  "强化形态",
  "超凡形态",
  "终极形态"
] as const;
export const petOptions: PetOption[] = [
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
  },
  {
    id: "bamboo-panda",
    name: "竹萌宝",
    family: "萌芽系",
    tone: "from-emerald-50 to-teal-100",
    badge: "bg-emerald-100 text-emerald-700",
    evolutions: ["竹萌宝", "青竹团", "翠竹灵熊", "竹皇圣尊"],
    description: "抱着嫩绿翠竹的憨萌小熊猫，善于耐心倾听与专注学习，每次认真完成任务都会让头顶的竹芽泛起生机绿意。"
  },
  {
    id: "clover-koala",
    name: "桉小萌",
    family: "萌芽系",
    tone: "from-lime-50 to-emerald-100",
    badge: "bg-emerald-100 text-emerald-700",
    evolutions: ["桉小萌", "抱叶考拉", "古森灵考拉", "世界树考拉"],
    description: "喜欢紧紧抱住桉树枝桠的温和考拉，性情平和沉稳，团队协作与互助会让它背上的幸运四叶草绽放清香。"
  },
  {
    id: "flame-dino",
    name: "炽炎龙",
    family: "焰岩系",
    tone: "from-orange-50 to-red-100",
    badge: "bg-orange-100 text-orange-700",
    evolutions: ["炽炎龙", "熔鳞战龙", "烈岩暴龙", "灭世曜焱神龙"],
    description: "背生火焰纹路的可爱小霸龙，遇到难题勇敢探索从不退缩，积极发言会点燃它胸膛中的赤红熔晶之火。"
  },
  {
    id: "lava-hedgehog",
    name: "熔火猬",
    family: "焰岩系",
    tone: "from-amber-50 to-orange-100",
    badge: "bg-orange-100 text-orange-700",
    evolutions: ["熔火猬", "焰刺兽", "金焰刺王", "烈曜金甲猬"],
    description: "背负赤晶熔刺的机敏小刺猬，越是有挑战性的小目标越能激发斗志，进阶后浑身金焰刺甲璀璨耀眼。"
  },
  {
    id: "frost-penguin",
    name: "冰晶企",
    family: "潮汐系",
    tone: "from-cyan-50 to-sky-100",
    badge: "bg-sky-100 text-sky-700",
    evolutions: ["冰晶企", "踏冰小企", "极地帝企灵", "极光冰渊帝企"],
    description: "戴着冰晶围巾在冰面上滑行的小企鹅，憨态可掬且毅力十足，每次坚持不懈的进步都会凝结出纯净的极地冰晶。"
  },
  {
    id: "wave-dolphin",
    name: "跃浪豚",
    family: "潮汐系",
    tone: "from-sky-50 to-blue-100",
    badge: "bg-sky-100 text-sky-700",
    evolutions: ["跃浪豚", "乘波小豚", "碧海灵豚", "苍澜海皇豚"],
    description: "跃出海面的欢快蓝海豚，最擅长在知识的海洋中破浪前行，活跃的课堂互动会让它激起晶莹绚烂的潮汐浪花。"
  },
  {
    id: "star-owl",
    name: "星辉鸮",
    family: "星辉系",
    tone: "from-violet-50 to-indigo-100",
    badge: "bg-violet-100 text-violet-700",
    evolutions: ["星辉鸮", "星羽小鸮", "夜幕星瞳鸮", "宙天星冠神鸮"],
    description: "双眸蕴含璀璨星海的静谧夜鸮，博学深邃，能把零散的知识梳理得井井有条，羽翼间常随思考流淌银河微光。"
  },
  {
    id: "galaxy-shiba",
    name: "星光柴",
    family: "星辉系",
    tone: "from-indigo-50 to-fuchsia-100",
    badge: "bg-violet-100 text-violet-700",
    evolutions: ["星光柴", "曜芒柴", "极星灵柴", "天穹织星神犬"],
    description: "系着星宿方巾的元气柴犬，奔跑时四蹄踏着星轨尘埃，乐观开朗的活力总能点亮整个班级的星空。"
  },
  {
    id: "clover-sheep",
    name: "翠灵羊",
    family: "萌芽系",
    tone: "from-emerald-50 to-teal-100",
    badge: "bg-emerald-100 text-emerald-700",
    evolutions: ["草绒小羊", "翠角灵羊", "云森青羊", "万木神角仙羊"],
    description: "头顶抽出生机幼芽的温和绵羊，善于安静倾听与耐心思考，每次互助合作都会让羊角上的灵木抽出翠绿新枝。"
  },
  {
    id: "lava-pig",
    name: "熔宝豚",
    family: "焰岩系",
    tone: "from-orange-50 to-amber-100",
    badge: "bg-orange-100 text-orange-700",
    evolutions: ["熔火小猪", "炽炎宝豚", "金焰战甲豕", "煌炎镇岳神豕"],
    description:
      "背负熔岩宝甲的敦厚小猪，如储蓄罐般记录每次努力，不畏艰难挫折，越是遇到难题越能燃起炽金熔岩的勇气之火。"
  },
  {
    id: "tide-dragon",
    name: "沧澜龙",
    family: "潮汐系",
    tone: "from-sky-50 to-blue-100",
    badge: "bg-sky-100 text-sky-700",
    evolutions: ["潜水小龙", "踏浪游龙", "沧渊苍龙", "九霄沧澜神龙"],
    description: "从潮汐微澜中苏醒的东方灵龙，举手投足引动甘霖甘露，以包容万物的大智慧陪伴学生在知识海洋中乘风破浪。"
  },
  {
    id: "astral-horse",
    name: "踏星驹",
    family: "星辉系",
    tone: "from-violet-50 to-indigo-100",
    badge: "bg-violet-100 text-violet-700",
    evolutions: ["星尘小驹", "极光骏马", "星轨天马", "天穹宙光神驹"],
    description: "四蹄踏着星轨尘埃的银河天马，志在浩瀚星海，一马当先的昂扬朝气总能激励同伴勇往直前、追寻心中梦想。"
  }
];

const cleanedSpriteNames = new Set([
  "ash-lion",
  "ash-lion-2",
  "bubble-otter-2",
  "coal-tail-fox-2",
  "coal-tail-fox-3",
  "coal-tail-fox-4",
  "coral-whale-2",
  "coral-whale-3",
  "pinecone-puff-2",
  "red-sand-tortoise-2",
  "star-sprout-marten-2",
  "vine-wing-bird-2",
  "vine-wing-bird-3"
]);

function getPetFormName(pet: PetOption, index: number) {
  if (index === 0) return `${pet.name}蛋`;
  if (index === 9) return pet.evolutions[3];
  const assetIndex = Math.min(3, Math.floor((index - 1) / 2));
  return `${pet.evolutions[assetIndex]}·${formStages[index]}`;
}

/** 宠物卡片、报告与详情预览共用同一套透明素材。 */
export function PetSprite({
  pet,
  stageIndex = 1,
  className
}: {
  pet: PetOption;
  stageIndex?: number;
  className?: string;
}) {
  const formName = getPetFormName(pet, stageIndex);
  const assetIndex = Math.min(3, Math.floor((Math.max(stageIndex, 1) - 1) / 2));
  const imageName = assetIndex === 0 ? pet.id : `${pet.id}-${assetIndex + 1}`;
  // Some generated sheets contain neighboring sprite fragments; point only affected stages to cleaned copies.
  const spriteImageName =
    imageName === "red-sand-tortoise-3"
      ? "red-sand-tortoise-3-hotfix"
      : cleanedSpriteNames.has(imageName)
        ? `${imageName}-clean`
        : imageName;
  return (
    <div className={cn("relative aspect-square", className)} aria-label={formName}>
      <img
        src={`/pets/starling/${spriteImageName}.png`}
        alt={formName}
        draggable={false}
        className="pointer-events-none h-full w-full select-none object-contain"
        style={{
          transform: `scale(${1 + stageIndex * 0.012})`,
          filter: `saturate(${1 + stageIndex * 0.035}) hue-rotate(${stageIndex * 2}deg)`
        }}
      />
    </div>
  );
}

export type ReportPet = {
  petId: string | null;
  petName: string | null;
  stage: string;
  level: number;
  petHatched: boolean;
};
export function ReportPetView({ pet }: { pet?: ReportPet | null }) {
  const option = petOptions.find(option => option.id === pet?.petId);
  if (!pet || !option) return <p className="text-sm text-slate-500">暂未领养宠物</p>;
  // Persisted stages use 第N形态; older clients may store the descriptive name.
  const numberedStage = /^第(\d+)形态$/.exec(pet.stage);
  const stageIndex = numberedStage
    ? Math.min(9, Math.max(0, Number(numberedStage[1]) - 1))
    : Math.max(
        0,
        formStages.findIndex(stage => stage === pet.stage)
      );
  return (
    <div className="my-auto flex flex-col items-center justify-center gap-2">
      {pet.petHatched ? (
        <PetSprite pet={option} stageIndex={stageIndex} className="w-40 max-w-full" />
      ) : (
        <img
          src="/pets/stone-monkey.png"
          alt={`${option.name}宠物蛋`}
          className="aspect-square w-40 max-w-full object-contain"
        />
      )}
      <p className="font-semibold">{pet.petName || option.name}</p>
      <p className="text-sm text-slate-600">
        Lv.{pet.level} · {pet.petHatched ? formStages[stageIndex] : "宠物蛋"}
      </p>
    </div>
  );
}
