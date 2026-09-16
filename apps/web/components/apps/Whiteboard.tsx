"use client";

import { ChangeEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Copy,
  Download,
  Eraser,
  FileDown,
  FileUp,
  Focus,
  Highlighter,
  History,
  ImagePlus,
  Layers,
  ListTree,
  Music2,
  Maximize2,
  Minus,
  MousePointer2,
  PenLine,
  Plus,
  Presentation,
  Redo2,
  RectangleHorizontal,
  Save,
  ScanSearch,
  Sigma,
  Sparkles,
  Table2,
  Trash2,
  Type,
  Undo2,
  Users,
  Video,
  X
} from "lucide-react";
import request from "@/lib/request";
import { createUuid } from "@/lib/id";
import toast from "react-hot-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { InputDialog } from "@/components/ui/input-dialog";
import { downloadBlob, createImagePdf } from "./whiteboard/export";
import { deleteWhiteboardDraft, loadWhiteboardDraft, saveWhiteboardDraft } from "./whiteboard/draft-storage";
import { importPdfPages, importPptxPages } from "./whiteboard/importers";
import type {
  FormulaElement,
  LocalDraft,
  MediaElement,
  ShapeElement,
  TableElement,
  TextElement,
  TextRun,
  WhiteboardBackground,
  WhiteboardDocument,
  WhiteboardElement,
  WhiteboardPage,
  WhiteboardSession,
  WhiteboardTool
} from "./whiteboard/types";

const BOARD_WIDTH = 1280;
const BOARD_HEIGHT = 720;
const DRAFT_PREFIX = "classroom-whiteboard-draft:";

interface WhiteboardProps {
  onOpenTool?: (contentKey: string) => void;
}

interface Interaction {
  mode: "draw" | "erase" | "move" | "resize" | "rotate";
  start: { x: number; y: number };
  elementId: string;
  original?: WhiteboardElement;
  /** 只有真正改变元素后才写入历史，避免“只选中”占用一次撤销。 */
  historyRecorded?: boolean;
  changed?: boolean;
}

interface HistoryEntry {
  pages: WhiteboardPage[];
  currentPageId: string;
}

type WhiteboardInputDialog =
  | { kind: "create"; initialValue: string }
  | { kind: "rename"; initialValue: string; documentId: string }
  | { kind: "formula"; initialValue: string };

type AssistantMode = "none" | "spotlight" | "magnifier" | "curtain";

interface InlineTextEditor {
  elementId: string | null;
  point: { x: number; y: number };
  value: string;
  fontSize: number;
  color: string;
  rotation: number;
  runs?: TextRun[];
}

interface TableCellEditor {
  elementId: string;
  cellIndex: number;
  value: string;
}

const toolItems: Array<{ id: WhiteboardTool; label: string; icon: typeof MousePointer2 }> = [
  { id: "select", label: "选择", icon: MousePointer2 },
  { id: "pen", label: "画笔", icon: PenLine },
  { id: "highlighter", label: "荧光笔", icon: Highlighter },
  { id: "eraser", label: "橡皮擦", icon: Eraser },
  { id: "line", label: "直线", icon: Minus },
  { id: "arrow", label: "箭头", icon: ArrowRight },
  { id: "rect", label: "矩形", icon: RectangleHorizontal },
  { id: "ellipse", label: "圆形", icon: Circle },
  { id: "text", label: "文本", icon: Type }
];

const backgroundOptions: Array<{ id: WhiteboardBackground; label: string }> = [
  { id: "plain", label: "纯色" },
  { id: "grid", label: "网格" },
  { id: "lined", label: "横线" },
  { id: "tianzi", label: "田字格" },
  { id: "english", label: "英语四线" },
  { id: "music", label: "五线谱" },
  { id: "coordinate", label: "坐标纸" },
  { id: "blackboard", label: "黑板" }
];

const textPalette = ["#172554", "#2563eb", "#16a34a", "#ca8a04", "#ea580c", "#dc2626", "#9333ea", "#475569"];

function newPage(index: number): WhiteboardPage {
  return {
    id: createUuid(),
    name: `第 ${index} 页`,
    background: "plain",
    backgroundColor: "#ffffff",
    elements: []
  };
}

function clonePages(pages: WhiteboardPage[]) {
  return structuredClone(pages);
}

function safeFilename(title: string) {
  return title.replace(/[\\/:*?"<>|]/g, "-").trim() || "白板课件";
}

function elementBounds(element: WhiteboardElement) {
  if (element.type !== "stroke") {
    return {
      x: Math.min(element.x, element.x + element.width),
      y: Math.min(element.y, element.y + element.height),
      width: Math.max(12, Math.abs(element.width)),
      height: Math.max(12, Math.abs(element.height))
    };
  }
  const xs = element.points.map(point => point.x + element.x);
  const ys = element.points.map(point => point.y + element.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(12, Math.max(...xs) - Math.min(...xs)),
    height: Math.max(12, Math.max(...ys) - Math.min(...ys))
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function textWidth(value: string, fontSize: number) {
  // 中英文字符视觉宽度差异较大；这里采用轻量估算，让输入框和最终选择框随内容即时增长。
  const units = Array.from(value || " ").reduce(
    (total, character) => total + (/\p{ASCII}/u.test(character) ? 0.62 : 1),
    0
  );
  return Math.max(80, units * fontSize + 16);
}

function textRunsWithRangeColor(
  value: string,
  runs: TextRun[] | undefined,
  fallbackColor: string,
  start: number,
  end: number,
  color: string
) {
  const colors = runs?.flatMap(run => Array.from({ length: run.text.length }, () => run.color)) ?? [];
  const result: TextRun[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const characterColor = index >= start && index < end ? color : (colors[index] ?? fallbackColor);
    const previous = result[result.length - 1];
    if (previous?.color === characterColor) previous.text += value[index];
    else result.push({ text: value[index]!, color: characterColor });
  }
  return result;
}

function smoothStrokePath(element: Extract<WhiteboardElement, { type: "stroke" }>) {
  const points = element.points.map(point => ({ x: point.x + element.x, y: point.y + element.y }));
  if (!points.length) return "";
  if (points.length < 3) return `M ${points.map(point => `${point.x} ${point.y}`).join(" L ")}`;
  let path = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index]!;
    const next = points[index + 1]!;
    path += ` Q ${point.x} ${point.y} ${(point.x + next.x) / 2} ${(point.y + next.y) / 2}`;
  }
  const last = points[points.length - 1]!;
  path += ` L ${last.x} ${last.y}`;
  return path;
}

function recognizeStroke(element: Extract<WhiteboardElement, { type: "stroke" }>): ShapeElement | null {
  if (element.points.length < 6 || element.opacity < 0.9) return null;
  const points = element.points.map(point => ({ x: point.x + element.x, y: point.y + element.y }));
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const bounds = elementBounds(element);
  const diagonal = Math.hypot(bounds.width, bounds.height);
  if (diagonal < 45) return null;
  const lineLength = Math.hypot(last.x - first.x, last.y - first.y);
  const makeShape = (
    shape: ShapeElement["shape"],
    x: number,
    y: number,
    width: number,
    height: number
  ): ShapeElement => ({
    id: element.id,
    type: "shape",
    shape,
    x,
    y,
    width,
    height,
    rotation: element.rotation,
    stroke: element.stroke,
    fill: "none",
    strokeWidth: element.strokeWidth,
    opacity: element.opacity
  });
  const lineError =
    points.reduce((total, point) => {
      const area = Math.abs(
        (last.y - first.y) * point.x - (last.x - first.x) * point.y + last.x * first.y - last.y * first.x
      );
      return total + area / Math.max(1, lineLength);
    }, 0) / points.length;
  if (lineError < Math.max(7, element.strokeWidth * 2) && lineLength > 60) {
    return makeShape("line", first.x, first.y, last.x - first.x, last.y - first.y);
  }
  const closed = Math.hypot(last.x - first.x, last.y - first.y) < Math.max(32, diagonal * 0.2);
  if (!closed) return null;
  const edgeError =
    points.reduce(
      (total, point) =>
        total +
        Math.min(
          Math.abs(point.x - bounds.x),
          Math.abs(point.x - (bounds.x + bounds.width)),
          Math.abs(point.y - bounds.y),
          Math.abs(point.y - (bounds.y + bounds.height))
        ),
      0
    ) / points.length;
  const shape = edgeError < Math.max(10, diagonal * 0.035) ? "rect" : "ellipse";
  return makeShape(shape, bounds.x, bounds.y, bounds.width, bounds.height);
}

function displayFormula(formula: string) {
  return formula
    .replace(/\\times/g, "×")
    .replace(/\\div/g, "÷")
    .replace(/\\pm/g, "±")
    .replace(/\\leq/g, "≤")
    .replace(/\\geq/g, "≥")
    .replace(/\\neq/g, "≠")
    .replace(/\\sqrt\{([^}]+)\}/g, "√($1)")
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)")
    .replace(/[{}]/g, "");
}

function pageBackground(page: WhiteboardPage) {
  const patternId = `background-${page.id.replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <>
      <defs>
        {page.background === "grid" && (
          <pattern id={patternId} width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#cbd5e1" strokeWidth="1" />
          </pattern>
        )}
        {page.background === "lined" && (
          <pattern id={patternId} width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 0 32 L 32 32" fill="none" stroke="#bfdbfe" strokeWidth="1.5" />
          </pattern>
        )}
        {page.background === "tianzi" && (
          <pattern id={patternId} width="72" height="72" patternUnits="userSpaceOnUse">
            <rect width="72" height="72" fill="none" stroke="#fca5a5" strokeWidth="1.5" />
            <path d="M36 0V72M0 36H72" stroke="#fecaca" strokeWidth="1" strokeDasharray="5 5" />
          </pattern>
        )}
        {page.background === "english" && (
          <pattern id={patternId} width="160" height="96" patternUnits="userSpaceOnUse">
            {[18, 34, 50, 66].map(y => (
              <path key={y} d={`M0 ${y}H160`} stroke="#93c5fd" strokeWidth="1.3" />
            ))}
          </pattern>
        )}
        {page.background === "music" && (
          <pattern id={patternId} width="220" height="112" patternUnits="userSpaceOnUse">
            {[24, 36, 48, 60, 72].map(y => (
              <path key={y} d={`M0 ${y}H220`} stroke="#94a3b8" strokeWidth="1.2" />
            ))}
          </pattern>
        )}
        {page.background === "coordinate" && (
          <pattern id={patternId} width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="#bae6fd" strokeWidth="1" />
            <path d="M20 0V40M0 20H40" stroke="#e0f2fe" strokeWidth=".7" />
          </pattern>
        )}
        <marker id="whiteboard-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
          <path d="M0,0 L0,6 L9,3 z" fill="context-stroke" />
        </marker>
      </defs>
      <rect width={BOARD_WIDTH} height={BOARD_HEIGHT} fill={page.backgroundColor} />
      {page.background !== "plain" && page.background !== "blackboard" && (
        <rect width={BOARD_WIDTH} height={BOARD_HEIGHT} fill={`url(#${patternId})`} />
      )}
      {page.backgroundImage && (
        <image
          href={page.backgroundImage}
          width={BOARD_WIDTH}
          height={BOARD_HEIGHT}
          preserveAspectRatio="xMidYMid meet"
        />
      )}
    </>
  );
}

function ElementNode({ element }: { element: WhiteboardElement }) {
  // 笔迹允许从起点向左上延伸，旋转中心必须使用真实包围盒，而不能直接依赖 width/height。
  const bounds = elementBounds(element);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const transform = element.rotation ? `rotate(${element.rotation} ${centerX} ${centerY})` : undefined;
  const common = {
    "data-element-id": element.id,
    opacity: element.opacity,
    transform,
    style: { cursor: "inherit" }
  };

  if (element.type === "stroke") {
    return (
      <path
        {...common}
        d={smoothStrokePath(element)}
        fill="none"
        stroke={element.stroke}
        strokeWidth={element.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    );
  }
  if (element.type === "text") {
    return (
      <text {...common} x={element.x} y={element.y + element.fontSize} fill={element.fill} fontSize={element.fontSize}>
        {element.runs?.length
          ? element.runs.map((run, index) => (
              <tspan key={`${index}-${run.color}`} fill={run.color}>
                {run.text}
              </tspan>
            ))
          : element.text}
      </text>
    );
  }
  if (element.type === "image") {
    return (
      <image {...common} href={element.src} x={element.x} y={element.y} width={element.width} height={element.height} />
    );
  }
  if (element.type === "table") {
    const cellWidth = element.width / element.columns;
    const cellHeight = element.height / element.rows;
    return (
      <g {...common}>
        <rect
          x={element.x}
          y={element.y}
          width={element.width}
          height={element.height}
          fill={element.fill}
          stroke={element.stroke}
          strokeWidth={element.strokeWidth}
        />
        {Array.from({ length: element.columns - 1 }, (_, index) => (
          <line
            key={`c-${index}`}
            x1={element.x + cellWidth * (index + 1)}
            y1={element.y}
            x2={element.x + cellWidth * (index + 1)}
            y2={element.y + element.height}
            stroke={element.stroke}
            strokeWidth={element.strokeWidth}
          />
        ))}
        {Array.from({ length: element.rows - 1 }, (_, index) => (
          <line
            key={`r-${index}`}
            x1={element.x}
            y1={element.y + cellHeight * (index + 1)}
            x2={element.x + element.width}
            y2={element.y + cellHeight * (index + 1)}
            stroke={element.stroke}
            strokeWidth={element.strokeWidth}
          />
        ))}
        {element.cells.map((cell, index) => (
          <text
            key={index}
            x={element.x + (index % element.columns) * cellWidth + 8}
            y={element.y + Math.floor(index / element.columns) * cellHeight + element.fontSize + 6}
            fontSize={element.fontSize}
            fill={element.stroke}
          >
            {cell}
          </text>
        ))}
      </g>
    );
  }
  if (element.type === "formula") {
    return (
      <text
        {...common}
        x={element.x}
        y={element.y + element.fontSize}
        fill={element.fill}
        fontSize={element.fontSize}
        fontFamily="Cambria Math, STIX Two Math, serif"
        fontStyle="italic"
      >
        {displayFormula(element.formula)}
      </text>
    );
  }
  if (element.type === "media") {
    return (
      <foreignObject {...common} x={element.x} y={element.y} width={element.width} height={element.height}>
        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-lg border-2 border-slate-300 bg-slate-900/95 p-2 text-white">
          {element.mediaType === "video" ? (
            <video src={element.src} controls className="h-full w-full object-contain" />
          ) : (
            <div className="flex w-full flex-col items-center gap-3">
              <Music2 className="h-10 w-10" />
              <span className="max-w-full truncate text-sm">{element.name}</span>
              <audio src={element.src} controls className="w-full" />
            </div>
          )}
        </div>
      </foreignObject>
    );
  }
  if (element.shape === "rect") {
    return (
      <rect
        {...common}
        x={element.x}
        y={element.y}
        width={element.width}
        height={element.height}
        rx="4"
        fill={element.fill}
        stroke={element.stroke}
        strokeWidth={element.strokeWidth}
      />
    );
  }
  if (element.shape === "ellipse") {
    return (
      <ellipse
        {...common}
        cx={centerX}
        cy={centerY}
        rx={element.width / 2}
        ry={element.height / 2}
        fill={element.fill}
        stroke={element.stroke}
        strokeWidth={element.strokeWidth}
      />
    );
  }
  return (
    <line
      {...common}
      x1={element.x}
      y1={element.y}
      x2={element.x + element.width}
      y2={element.y + element.height}
      stroke={element.stroke}
      strokeWidth={element.strokeWidth}
      strokeLinecap="round"
      markerEnd={element.shape === "arrow" ? "url(#whiteboard-arrow)" : undefined}
    />
  );
}

function drawBackground(ctx: CanvasRenderingContext2D, page: WhiteboardPage) {
  ctx.fillStyle = page.backgroundColor;
  ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
  if (page.background === "plain" || page.background === "blackboard") return;
  ctx.lineWidth = 1;
  if (page.background === "grid") {
    ctx.strokeStyle = "#cbd5e1";
    for (let x = 0; x <= BOARD_WIDTH; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, BOARD_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y <= BOARD_HEIGHT; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(BOARD_WIDTH, y);
      ctx.stroke();
    }
  } else if (page.background === "lined") {
    ctx.strokeStyle = "#bfdbfe";
    for (let y = 32; y <= BOARD_HEIGHT; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(BOARD_WIDTH, y);
      ctx.stroke();
    }
  } else if (page.background === "tianzi") {
    for (let x = 0; x < BOARD_WIDTH; x += 72) {
      for (let y = 0; y < BOARD_HEIGHT; y += 72) {
        ctx.strokeStyle = "#fca5a5";
        ctx.strokeRect(x, y, 72, 72);
        ctx.strokeStyle = "#fecaca";
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(x + 36, y);
        ctx.lineTo(x + 36, y + 72);
        ctx.moveTo(x, y + 36);
        ctx.lineTo(x + 72, y + 36);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  } else if (page.background === "english" || page.background === "music") {
    ctx.strokeStyle = page.background === "english" ? "#93c5fd" : "#94a3b8";
    const block = page.background === "english" ? 96 : 112;
    const lines = page.background === "english" ? [18, 34, 50, 66] : [24, 36, 48, 60, 72];
    for (let offset = 0; offset < BOARD_HEIGHT; offset += block)
      for (const line of lines) {
        ctx.beginPath();
        ctx.moveTo(0, offset + line);
        ctx.lineTo(BOARD_WIDTH, offset + line);
        ctx.stroke();
      }
  } else if (page.background === "coordinate") {
    for (let x = 0; x <= BOARD_WIDTH; x += 20) {
      ctx.strokeStyle = x % 40 === 0 ? "#bae6fd" : "#e0f2fe";
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, BOARD_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y <= BOARD_HEIGHT; y += 20) {
      ctx.strokeStyle = y % 40 === 0 ? "#bae6fd" : "#e0f2fe";
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(BOARD_WIDTH, y);
      ctx.stroke();
    }
  }
}

async function loadCanvasImage(src: string) {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}

async function renderPage(page: WhiteboardPage, format: "png" | "jpeg" = "png") {
  const canvas = document.createElement("canvas");
  canvas.width = BOARD_WIDTH;
  canvas.height = BOARD_HEIGHT;
  const ctx = canvas.getContext("2d")!;
  drawBackground(ctx, page);
  if (page.backgroundImage) {
    const background = await loadCanvasImage(page.backgroundImage);
    ctx.drawImage(background, 0, 0, BOARD_WIDTH, BOARD_HEIGHT);
  }
  for (const element of page.elements) {
    ctx.save();
    ctx.globalAlpha = element.opacity;
    const bounds = elementBounds(element);
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    if (element.rotation) {
      ctx.translate(centerX, centerY);
      ctx.rotate((element.rotation * Math.PI) / 180);
      ctx.translate(-centerX, -centerY);
    }
    if (element.type === "stroke") {
      const points = element.points.map(point => ({ x: point.x + element.x, y: point.y + element.y }));
      ctx.beginPath();
      if (points[0]) ctx.moveTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length - 1; index += 1) {
        const point = points[index]!;
        const next = points[index + 1]!;
        ctx.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
      }
      if (points.length > 1) ctx.lineTo(points[points.length - 1]!.x, points[points.length - 1]!.y);
      ctx.strokeStyle = element.stroke;
      ctx.lineWidth = element.strokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    } else if (element.type === "text") {
      ctx.font = `${element.fontSize}px sans-serif`;
      ctx.textBaseline = "top";
      let textX = element.x;
      const runs = element.runs?.length ? element.runs : [{ text: element.text, color: element.fill }];
      for (const run of runs) {
        ctx.fillStyle = run.color;
        ctx.fillText(run.text, textX, element.y);
        textX += ctx.measureText(run.text).width;
      }
    } else if (element.type === "image") {
      const image = await loadCanvasImage(element.src);
      ctx.drawImage(image, element.x, element.y, element.width, element.height);
    } else if (element.type === "table") {
      const cellWidth = element.width / element.columns;
      const cellHeight = element.height / element.rows;
      ctx.fillStyle = element.fill === "none" ? "#ffffff" : element.fill;
      ctx.fillRect(element.x, element.y, element.width, element.height);
      ctx.strokeStyle = element.stroke;
      ctx.lineWidth = element.strokeWidth;
      ctx.strokeRect(element.x, element.y, element.width, element.height);
      for (let column = 1; column < element.columns; column += 1) {
        ctx.beginPath();
        ctx.moveTo(element.x + column * cellWidth, element.y);
        ctx.lineTo(element.x + column * cellWidth, element.y + element.height);
        ctx.stroke();
      }
      for (let row = 1; row < element.rows; row += 1) {
        ctx.beginPath();
        ctx.moveTo(element.x, element.y + row * cellHeight);
        ctx.lineTo(element.x + element.width, element.y + row * cellHeight);
        ctx.stroke();
      }
      ctx.font = `${element.fontSize}px sans-serif`;
      ctx.fillStyle = element.stroke;
      element.cells.forEach((cell, index) =>
        ctx.fillText(
          cell,
          element.x + (index % element.columns) * cellWidth + 8,
          element.y + Math.floor(index / element.columns) * cellHeight + 8
        )
      );
    } else if (element.type === "formula") {
      ctx.font = `italic ${element.fontSize}px Cambria Math, serif`;
      ctx.fillStyle = element.fill;
      ctx.fillText(displayFormula(element.formula), element.x, element.y);
    } else if (element.type === "media") {
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(element.x, element.y, element.width, element.height);
      ctx.fillStyle = "#ffffff";
      ctx.font = "24px sans-serif";
      ctx.fillText(
        element.mediaType === "video" ? `视频：${element.name}` : `音频：${element.name}`,
        element.x + 20,
        element.y + 20
      );
    } else {
      ctx.strokeStyle = element.stroke;
      ctx.fillStyle = element.fill;
      ctx.lineWidth = element.strokeWidth;
      if (element.shape === "rect") {
        if (element.fill !== "none") ctx.fillRect(element.x, element.y, element.width, element.height);
        ctx.strokeRect(element.x, element.y, element.width, element.height);
      } else if (element.shape === "ellipse") {
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, element.width / 2, element.height / 2, 0, 0, Math.PI * 2);
        if (element.fill !== "none") ctx.fill();
        ctx.stroke();
      } else {
        const x2 = element.x + element.width;
        const y2 = element.y + element.height;
        ctx.beginPath();
        ctx.moveTo(element.x, element.y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        if (element.shape === "arrow") {
          const angle = Math.atan2(element.height, element.width);
          ctx.beginPath();
          ctx.moveTo(x2, y2);
          ctx.lineTo(x2 - 18 * Math.cos(angle - Math.PI / 6), y2 - 18 * Math.sin(angle - Math.PI / 6));
          ctx.moveTo(x2, y2);
          ctx.lineTo(x2 - 18 * Math.cos(angle + Math.PI / 6), y2 - 18 * Math.sin(angle + Math.PI / 6));
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }
  return canvas.toDataURL(format === "png" ? "image/png" : "image/jpeg", 0.92);
}

export function Whiteboard({ onOpenTool }: WhiteboardProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLInputElement>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const inlineTextInputRef = useRef<HTMLInputElement>(null);
  const tableCellInputRef = useRef<HTMLInputElement>(null);
  const inlineTextCancelledRef = useRef(false);
  const saveGenerationRef = useRef(0);
  const latestDocumentRef = useRef<WhiteboardDocument | null>(null);
  const latestDirtyRevisionRef = useRef(0);
  const lastSavedTitleRef = useRef("未命名课件");
  const colorBeforeScratchRef = useRef("#172554");
  const sessionEndingRef = useRef(false);
  const [documents, setDocuments] = useState<WhiteboardDocument[]>([]);
  const [documentValue, setDocumentValue] = useState<WhiteboardDocument | null>(null);
  const [currentPageId, setCurrentPageId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<WhiteboardTool>("select");
  const [color, setColor] = useState("#172554");
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "local" | "error">("saved");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isPresenting, setIsPresenting] = useState(false);
  const [scratchPage, setScratchPage] = useState<WhiteboardPage | null>(null);
  const [past, setPast] = useState<HistoryEntry[]>([]);
  const [future, setFuture] = useState<HistoryEntry[]>([]);
  const [dirtyRevision, setDirtyRevision] = useState(0);
  const [inputDialog, setInputDialog] = useState<WhiteboardInputDialog | null>(null);
  const [inlineTextEditor, setInlineTextEditor] = useState<InlineTextEditor | null>(null);
  const [tableCellEditor, setTableCellEditor] = useState<TableCellEditor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WhiteboardDocument | null>(null);
  const [assistantMode, setAssistantMode] = useState<AssistantMode>("none");
  const [assistantPoint, setAssistantPoint] = useState({ x: BOARD_WIDTH / 2, y: BOARD_HEIGHT / 2 });
  const [curtainHeight, setCurtainHeight] = useState(BOARD_HEIGHT * 0.65);
  const [smartInk, setSmartInk] = useState(true);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionPages, setSessionPages] = useState<WhiteboardPage[] | null>(null);
  const [sessionRevision, setSessionRevision] = useState(0);
  const [sessionHistory, setSessionHistory] = useState<WhiteboardSession[] | null>(null);
  const [sessionHistoryLoading, setSessionHistoryLoading] = useState(false);

  const activePages = isPresenting && sessionPages ? sessionPages : documentValue?.pages;
  const currentPage = scratchPage ?? activePages?.find(page => page.id === currentPageId) ?? activePages?.[0];
  const currentIndex = activePages?.findIndex(page => page.id === currentPageId) ?? 0;
  const selected = currentPage?.elements.find(element => element.id === selectedId);
  const inlineTextEditorKey = inlineTextEditor
    ? `${inlineTextEditor.elementId ?? "new"}:${inlineTextEditor.point.x}:${inlineTextEditor.point.y}`
    : null;
  const inlineTextElementId = inlineTextEditor?.elementId;
  const tableCellEditorKey = tableCellEditor ? `${tableCellEditor.elementId}:${tableCellEditor.cellIndex}` : null;

  useEffect(() => {
    if (!inlineTextEditorKey) return;
    const frame = requestAnimationFrame(() => {
      const input = inlineTextInputRef.current;
      input?.focus();
      // 进入编辑时只把光标放在末尾，不自动全选整段，避免颜色操作被误认为“全选着色”。
      if (input && inlineTextElementId) input.setSelectionRange(input.value.length, input.value.length);
    });
    return () => cancelAnimationFrame(frame);
  }, [inlineTextEditorKey, inlineTextElementId]);

  useEffect(() => {
    if (!tableCellEditorKey) return;
    const frame = requestAnimationFrame(() => {
      tableCellInputRef.current?.focus();
      tableCellInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [tableCellEditorKey]);

  useEffect(() => {
    latestDocumentRef.current = documentValue;
    latestDirtyRevisionRef.current = dirtyRevision;
  }, [dirtyRevision, documentValue]);

  useEffect(
    () => () => {
      const latest = latestDocumentRef.current;
      if (!latest || latestDirtyRevisionRef.current === 0) return;
      // 关闭整个应用窗口时 React 不会调用“返回列表”，因此卸载阶段仍需立即落一份本地草稿。
      void saveWhiteboardDraft(latest.id, {
        savedAt: Date.now(),
        title: latest.title.trim() || lastSavedTitleRef.current,
        pages: latest.pages
      }).catch(() => undefined);
    },
    []
  );

  const loadDocuments = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const result = await request<WhiteboardDocument[], WhiteboardDocument[]>("/api/whiteboards");
      setDocuments(result);
    } catch {
      // 请求层已经显示具体错误；组件只负责阻止拒绝冒泡并提供重试入口。
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // 初次挂载需要从服务端加载课件列表，此处是一次性的外部数据同步。
    const timer = window.setTimeout(() => void loadDocuments(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDocuments]);

  const dirtyDocumentId = documentValue?.id;
  const dirtyDocumentTitle = documentValue?.title;
  const dirtyDocumentPages = documentValue?.pages;

  useEffect(() => {
    if (!dirtyDocumentId || !dirtyDocumentTitle || !dirtyDocumentPages || dirtyRevision === 0) return;
    const normalizedTitle = dirtyDocumentTitle.trim() || lastSavedTitleRef.current || "未命名课件";
    const draft: LocalDraft = { savedAt: Date.now(), title: normalizedTitle, pages: dirtyDocumentPages };
    const documentId = dirtyDocumentId;
    const generation = ++saveGenerationRef.current;
    const draftTimer = setTimeout(() => {
      void saveWhiteboardDraft(documentId, draft).catch(() => {
        if (saveGenerationRef.current === generation) setSaveState("error");
      });
    }, 180);
    const serverTimer = setTimeout(async () => {
      try {
        const saved = await request<WhiteboardDocument, WhiteboardDocument>({
          url: `/api/whiteboards/${documentId}`,
          method: "PATCH",
          data: { title: draft.title, pages: draft.pages }
        });
        if (saveGenerationRef.current !== generation) return;
        lastSavedTitleRef.current = saved.title;
        setDocumentValue(current =>
          current?.id === saved.id ? { ...current, title: saved.title, updatedAt: saved.updatedAt } : current
        );
        setDocuments(current => current.map(item => (item.id === saved.id ? saved : item)));
        await deleteWhiteboardDraft(documentId).catch(() => undefined);
        setDirtyRevision(0);
        setSaveState("saved");
      } catch {
        if (saveGenerationRef.current !== generation) return;
        try {
          await saveWhiteboardDraft(documentId, draft);
          setSaveState("local");
        } catch {
          setSaveState("error");
        }
      }
    }, 1200);
    return () => {
      clearTimeout(draftTimer);
      clearTimeout(serverTimer);
    };
    // updatedAt 变化不应重启保存计时器，否则服务端响应会形成自动保存循环。
  }, [dirtyDocumentId, dirtyDocumentPages, dirtyDocumentTitle, dirtyRevision]);

  useEffect(() => {
    if (!documentValue || !sessionId || !sessionPages || sessionRevision === 0) return;
    const timer = setTimeout(() => {
      void request<WhiteboardSession, WhiteboardSession>({
        url: `/api/whiteboards/${documentValue.id}/sessions/${sessionId}`,
        method: "PATCH",
        data: { pages: sessionPages }
      }).catch(() => toast.error("课堂批注暂未同步，结束授课时将再次尝试"));
    }, 1000);
    return () => clearTimeout(timer);
  }, [documentValue, sessionId, sessionPages, sessionRevision]);

  const openDocument = async (document: WhiteboardDocument) => {
    let opened = document;
    let restoredNewerDraft = false;
    try {
      let draft = await loadWhiteboardDraft(document.id);
      // 兼容旧版 localStorage 草稿，成功迁移后立即释放其有限配额。
      const legacyKey = `${DRAFT_PREFIX}${document.id}`;
      const rawDraft = localStorage.getItem(legacyKey);
      if (rawDraft) {
        const legacyDraft = JSON.parse(rawDraft) as LocalDraft;
        if (!draft || legacyDraft.savedAt > draft.savedAt) {
          await saveWhiteboardDraft(document.id, legacyDraft);
          draft = legacyDraft;
        }
        localStorage.removeItem(legacyKey);
      }
      if (draft && draft.savedAt > new Date(document.updatedAt).getTime()) {
        opened = { ...document, title: draft.title, pages: draft.pages };
        restoredNewerDraft = true;
      }
    } catch {
      // IndexedDB 被禁用时仍打开服务端版本，避免本地恢复能力阻断编辑器。
    }
    setDocumentValue(opened);
    setCurrentPageId(opened.pages[0]?.id || "");
    setSelectedId(null);
    setTableCellEditor(null);
    setPast([]);
    setFuture([]);
    lastSavedTitleRef.current = document.title;
    // 新于服务器的本地草稿应自动补传，不能在打开后永久停留在单机状态。
    setDirtyRevision(restoredNewerDraft ? 1 : 0);
    setSaveState(restoredNewerDraft ? "saving" : "saved");
  };

  const markDirty = () => {
    setSaveState("saving");
    setDirtyRevision(value => value + 1);
  };

  const closeDocument = async () => {
    if (documentValue && dirtyRevision > 0) {
      const normalizedTitle = documentValue.title.trim() || lastSavedTitleRef.current || "未命名课件";
      const draft = { savedAt: Date.now(), title: normalizedTitle, pages: documentValue.pages };
      try {
        await saveWhiteboardDraft(documentValue.id, draft);
      } catch {
        toast.error("本地空间不足，当前草稿未能保存");
        return;
      }
      // 返回列表前主动刷新服务器；失败时保留 IndexedDB 草稿，下一次打开会自动重试。
      try {
        const saved = await request<WhiteboardDocument, WhiteboardDocument>({
          url: `/api/whiteboards/${documentValue.id}`,
          method: "PATCH",
          data: { title: draft.title, pages: draft.pages }
        });
        lastSavedTitleRef.current = saved.title;
        setDocuments(current => current.map(item => (item.id === saved.id ? saved : item)));
        await deleteWhiteboardDraft(documentValue.id).catch(() => undefined);
        latestDocumentRef.current = null;
        latestDirtyRevisionRef.current = 0;
        setDirtyRevision(0);
      } catch {
        setSaveState("local");
      }
    }
    setDocumentValue(null);
  };

  const pushHistory = useCallback(() => {
    if (!documentValue || scratchPage || isPresenting) return;
    setPast(history => [
      ...history.slice(-49),
      { pages: clonePages(documentValue.pages), currentPageId: currentPageId || documentValue.pages[0]?.id || "" }
    ]);
    setFuture([]);
  }, [currentPageId, documentValue, isPresenting, scratchPage]);

  const updateCurrentPage = useCallback(
    (updater: (page: WhiteboardPage) => WhiteboardPage, record = true, dirty = true) => {
      if (!currentPage) return;
      if (record) pushHistory();
      if (scratchPage) {
        setScratchPage(page => (page ? updater(page) : page));
        return;
      }
      if (isPresenting && sessionPages) {
        setSessionPages(pages => pages?.map(page => (page.id === currentPage.id ? updater(page) : page)) ?? pages);
        if (dirty) setSessionRevision(value => value + 1);
        return;
      }
      setDocumentValue(current =>
        current
          ? {
              ...current,
              pages: current.pages.map(page => (page.id === currentPage.id ? updater(page) : page))
            }
          : current
      );
      if (dirty) markDirty();
    },
    [currentPage, isPresenting, pushHistory, scratchPage, sessionPages]
  );

  const updateElement = useCallback(
    (id: string, updater: (element: WhiteboardElement) => WhiteboardElement, record = true, dirty = true) => {
      updateCurrentPage(
        page => ({ ...page, elements: page.elements.map(element => (element.id === id ? updater(element) : element)) }),
        record,
        dirty
      );
    },
    [updateCurrentPage]
  );

  const startInlineTextEditor = (point: { x: number; y: number }, element?: TextElement) => {
    inlineTextCancelledRef.current = false;
    interactionRef.current = null;
    setSelectedId(element?.id ?? null);
    setInlineTextEditor({
      elementId: element?.id ?? null,
      point: element ? { x: element.x, y: element.y } : { x: clamp(point.x, 0, BOARD_WIDTH - 80), y: point.y },
      value: element?.text ?? "",
      fontSize: element?.fontSize ?? 32,
      color: element?.fill ?? color,
      rotation: element?.rotation ?? 0,
      runs: element?.runs ? structuredClone(element.runs) : undefined
    });
  };

  const commitInlineText = (format?: { runs?: TextRun[]; color?: string }) => {
    const editor = inlineTextEditor;
    setInlineTextEditor(null);
    if (!editor || inlineTextCancelledRef.current) {
      inlineTextCancelledRef.current = false;
      return;
    }
    const value = editor.value;
    // 空白的新输入直接丢弃；编辑已有文字时则保留原内容，避免一次误删造成数据丢失。
    if (!value.trim()) return;
    const nextRuns = format ? format.runs : editor.runs;
    const nextColor = format?.color ?? editor.color;
    const width = Math.min(BOARD_WIDTH - editor.point.x, textWidth(value, editor.fontSize));
    const height = Math.max(12, editor.fontSize * 1.35);
    if (editor.elementId) {
      const existing = currentPage?.elements.find(element => element.id === editor.elementId);
      if (
        existing?.type === "text" &&
        (existing.text !== value ||
          existing.fill !== nextColor ||
          JSON.stringify(existing.runs) !== JSON.stringify(nextRuns))
      ) {
        updateElement(editor.elementId, element =>
          element.type === "text"
            ? { ...element, text: value, width, height, fill: nextColor, stroke: nextColor, runs: nextRuns }
            : element
        );
      }
      return;
    }
    const element: TextElement = {
      id: createUuid(),
      type: "text",
      text: value,
      x: editor.point.x,
      y: clamp(editor.point.y, 0, BOARD_HEIGHT - height),
      width,
      height,
      rotation: 0,
      stroke: nextColor,
      fill: nextColor,
      strokeWidth,
      opacity: 1,
      fontSize: editor.fontSize,
      runs: nextRuns
    };
    updateCurrentPage(page => ({ ...page, elements: [...page.elements, element] }));
    setSelectedId(element.id);
    setTool("select");
  };

  const cancelInlineText = () => {
    inlineTextCancelledRef.current = true;
    setInlineTextEditor(null);
  };

  const startTableCellEditor = (point: { x: number; y: number }, table: TableElement) => {
    const centerX = table.x + table.width / 2;
    const centerY = table.y + table.height / 2;
    const radians = (-table.rotation * Math.PI) / 180;
    const offsetX = point.x - centerX;
    const offsetY = point.y - centerY;
    // 旋转后的表格先把点击坐标还原到本地坐标系，确保仍能命中正确单元格。
    const localX = centerX + offsetX * Math.cos(radians) - offsetY * Math.sin(radians);
    const localY = centerY + offsetX * Math.sin(radians) + offsetY * Math.cos(radians);
    const column = clamp(Math.floor((localX - table.x) / (table.width / table.columns)), 0, table.columns - 1);
    const row = clamp(Math.floor((localY - table.y) / (table.height / table.rows)), 0, table.rows - 1);
    const cellIndex = row * table.columns + column;
    interactionRef.current = null;
    setSelectedId(table.id);
    setTableCellEditor({ elementId: table.id, cellIndex, value: table.cells[cellIndex] ?? "" });
  };

  const commitTableCellEditor = () => {
    const editor = tableCellEditor;
    setTableCellEditor(null);
    if (!editor) return;
    const table = currentPage?.elements.find(element => element.id === editor.elementId);
    if (table?.type !== "table" || table.cells[editor.cellIndex] === editor.value) return;
    updateElement(editor.elementId, element => {
      if (element.type !== "table") return element;
      const cells = [...element.cells];
      cells[editor.cellIndex] = editor.value;
      return { ...element, cells };
    });
  };

  const cancelTableCellEditor = () => setTableCellEditor(null);

  const pointFromEvent = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current!;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const transformed = point.matrixTransform(svg.getScreenCTM()?.inverse());
    return {
      x: Math.max(0, Math.min(BOARD_WIDTH, transformed.x)),
      y: Math.max(0, Math.min(BOARD_HEIGHT, transformed.y))
    };
  };

  const beginInteraction = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!currentPage) return;
    // 画布外点击先结束当前文字输入，防止同一次指针事件又触发绘图或移动。
    if (inlineTextEditor) {
      commitInlineText();
      return;
    }
    if (tableCellEditor) {
      commitTableCellEditor();
      return;
    }
    const point = pointFromEvent(event);
    if (assistantMode !== "none") {
      setAssistantPoint(point);
      if (assistantMode === "curtain") setCurtainHeight(point.y);
      svgRef.current?.setPointerCapture(event.pointerId);
      return;
    }
    const targetId =
      (event.target as SVGElement).closest?.("[data-element-id]")?.getAttribute("data-element-id") ?? null;
    svgRef.current?.setPointerCapture(event.pointerId);

    if (tool === "eraser") {
      let erased = false;
      if (targetId) {
        pushHistory();
        updateCurrentPage(
          page => ({ ...page, elements: page.elements.filter(element => element.id !== targetId) }),
          false,
          false
        );
        if (selectedId === targetId) setSelectedId(null);
        erased = true;
      }
      interactionRef.current = {
        mode: "erase",
        start: point,
        elementId: "",
        historyRecorded: erased,
        changed: erased
      };
      return;
    }
    if (tool === "select") {
      if (!targetId) {
        setSelectedId(null);
        return;
      }
      const element = currentPage.elements.find(item => item.id === targetId);
      if (!element) return;
      setSelectedId(targetId);
      interactionRef.current = {
        mode: "move",
        start: point,
        elementId: targetId,
        original: structuredClone(element),
        historyRecorded: false,
        changed: false
      };
      return;
    }
    if (tool === "text") {
      const target = currentPage.elements.find(element => element.id === targetId);
      startInlineTextEditor(point, target?.type === "text" ? target : undefined);
      return;
    }

    pushHistory();
    const id = createUuid();
    let element: WhiteboardElement;
    if (tool === "pen" || tool === "highlighter") {
      element = {
        id,
        type: "stroke",
        points: [{ x: 0, y: 0 }],
        x: point.x,
        y: point.y,
        width: 1,
        height: 1,
        rotation: 0,
        stroke: tool === "highlighter" ? "#fde047" : color,
        fill: "none",
        strokeWidth: tool === "highlighter" ? Math.max(14, strokeWidth * 3) : strokeWidth,
        opacity: tool === "highlighter" ? 0.45 : 1
      };
    } else {
      element = {
        id,
        type: "shape",
        shape: tool,
        x: point.x,
        y: point.y,
        width: 1,
        height: 1,
        rotation: 0,
        stroke: color,
        fill: "none",
        strokeWidth,
        opacity: 1
      } as ShapeElement;
    }
    updateCurrentPage(page => ({ ...page, elements: [...page.elements, element] }), false, false);
    interactionRef.current = {
      mode: "draw",
      start: point,
      elementId: id,
      historyRecorded: true,
      changed: false
    };
  };

  const moveInteraction = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (assistantMode !== "none" && (assistantMode !== "curtain" || event.buttons > 0)) {
      const point = pointFromEvent(event);
      setAssistantPoint(point);
      if (assistantMode === "curtain") setCurtainHeight(point.y);
      return;
    }
    const interaction = interactionRef.current;
    if (!interaction) return;
    const point = pointFromEvent(event);
    if (interaction.mode === "erase") {
      const targetId = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest?.("[data-element-id]")
        ?.getAttribute("data-element-id");
      if (targetId) {
        if (!interaction.historyRecorded) {
          pushHistory();
          interaction.historyRecorded = true;
        }
        updateCurrentPage(
          page => ({ ...page, elements: page.elements.filter(element => element.id !== targetId) }),
          false,
          false
        );
        if (selectedId === targetId) setSelectedId(null);
        interaction.changed = true;
      }
    } else if (interaction.mode === "draw") {
      interaction.changed = true;
      updateElement(
        interaction.elementId,
        element => {
          if (element.type === "stroke") {
            const points = [...element.points, { x: point.x - interaction.start.x, y: point.y - interaction.start.y }];
            const boundsX = points.map(item => item.x);
            const boundsY = points.map(item => item.y);
            return {
              ...element,
              points,
              width: Math.max(...boundsX) - Math.min(...boundsX),
              height: Math.max(...boundsY) - Math.min(...boundsY)
            };
          }
          if (element.type === "shape" && (element.shape === "line" || element.shape === "arrow")) {
            return {
              ...element,
              x: interaction.start.x,
              y: interaction.start.y,
              width: point.x - interaction.start.x,
              height: point.y - interaction.start.y
            };
          }
          return {
            ...element,
            x: Math.min(interaction.start.x, point.x),
            y: Math.min(interaction.start.y, point.y),
            width: Math.max(1, Math.abs(point.x - interaction.start.x)),
            height: Math.max(1, Math.abs(point.y - interaction.start.y))
          };
        },
        false,
        false
      );
    } else if (interaction.original) {
      const hasMoved = point.x !== interaction.start.x || point.y !== interaction.start.y;
      if (!hasMoved) return;
      if (!interaction.historyRecorded) {
        pushHistory();
        interaction.historyRecorded = true;
      }
      interaction.changed = true;
      updateElement(
        interaction.elementId,
        element => {
          const original = interaction.original!;
          if (interaction.mode === "move") {
            const bounds = elementBounds(original);
            const requestedX = point.x - interaction.start.x;
            const requestedY = point.y - interaction.start.y;
            // 保证元素真实包围盒始终留在画布内，避免拖出后无法再次选中。
            const deltaX = clamp(requestedX, -bounds.x, BOARD_WIDTH - bounds.x - bounds.width);
            const deltaY = clamp(requestedY, -bounds.y, BOARD_HEIGHT - bounds.y - bounds.height);
            return {
              ...element,
              x: original.x + deltaX,
              y: original.y + deltaY
            };
          }
          if (interaction.mode === "resize") {
            const bounds = elementBounds(original);
            const ratioX = Math.max(0.1, (point.x - bounds.x) / Math.max(1, bounds.width));
            const ratioY = Math.max(0.1, (point.y - bounds.y) / Math.max(1, bounds.height));
            if (element.type === "stroke") {
              return {
                ...element,
                points:
                  original.type === "stroke"
                    ? original.points.map(item => {
                        const absoluteX = original.x + item.x;
                        const absoluteY = original.y + item.y;
                        return {
                          x: bounds.x + (absoluteX - bounds.x) * ratioX - original.x,
                          y: bounds.y + (absoluteY - bounds.y) * ratioY - original.y
                        };
                      })
                    : element.points
              };
            }
            if (element.type === "text" && original.type === "text") {
              // 文本没有排版框概念，使用等比缩放同步字号和选择框，避免只变框不变字。
              const ratio = Math.max(0.1, Math.min(ratioX, ratioY));
              return {
                ...element,
                width: Math.max(12, original.width * ratio),
                height: Math.max(12, original.height * ratio),
                fontSize: Math.max(8, original.fontSize * ratio)
              };
            }
            if (element.type === "shape" && (element.shape === "line" || element.shape === "arrow")) {
              const width = Math.max(12, Math.abs(original.width) * ratioX);
              const height = Math.max(12, Math.abs(original.height) * ratioY);
              // 箭头方向由宽高符号决定；缩放包围盒时必须保留符号与起终点方向。
              return {
                ...element,
                x: original.width < 0 ? bounds.x + width : bounds.x,
                y: original.height < 0 ? bounds.y + height : bounds.y,
                width: original.width < 0 ? -width : width,
                height: original.height < 0 ? -height : height
              };
            }
            return {
              ...element,
              width: Math.max(12, original.width * ratioX),
              height: Math.max(12, original.height * ratioY)
            };
          }
          const bounds = elementBounds(original);
          const cx = bounds.x + bounds.width / 2;
          const cy = bounds.y + bounds.height / 2;
          return { ...element, rotation: Math.round((Math.atan2(point.y - cy, point.x - cx) * 180) / Math.PI + 90) };
        },
        false,
        false
      );
    }
  };

  const finishInteraction = () => {
    const interaction = interactionRef.current;
    if (interaction?.mode === "draw" && interaction.changed && smartInk) {
      const stroke = currentPage?.elements.find(element => element.id === interaction.elementId);
      if (stroke?.type === "stroke") {
        const recognized = recognizeStroke(stroke);
        if (recognized) updateElement(stroke.id, () => recognized, false, false);
      }
    }
    if (interaction?.mode === "draw" && !interaction.changed) {
      // 单击但未拖动不会留下不可见的 1×1 元素，也不占用撤销历史。
      if (scratchPage) {
        setScratchPage(page =>
          page ? { ...page, elements: page.elements.filter(element => element.id !== interaction.elementId) } : page
        );
      } else {
        setDocumentValue(current =>
          current
            ? {
                ...current,
                pages: current.pages.map(page =>
                  page.id === currentPage?.id
                    ? { ...page, elements: page.elements.filter(element => element.id !== interaction.elementId) }
                    : page
                )
              }
            : current
        );
        setPast(history => history.slice(0, -1));
      }
    } else if (interaction?.mode === "move" && !interaction.changed && interaction.original?.type === "text") {
      // 文字保持“拖动即移动、单击即编辑”，避免为了修改内容再切换工具或打开弹窗。
      startInlineTextEditor(interaction.start, interaction.original);
      return;
    } else if (interaction?.mode === "move" && !interaction.changed && interaction.original?.type === "table") {
      // 表格保持“拖动即移动、单击单元格即编辑”，不额外引入弹窗。
      startTableCellEditor(interaction.start, interaction.original);
      return;
    } else if (interaction?.changed && !scratchPage) {
      if (isPresenting) setSessionRevision(value => value + 1);
      else markDirty();
    }
    interactionRef.current = null;
  };

  const beginHandle = (event: ReactPointerEvent, mode: "resize" | "rotate") => {
    if (!selected) return;
    event.stopPropagation();
    (event.currentTarget as SVGElement).setPointerCapture?.(event.pointerId);
    interactionRef.current = {
      mode,
      start: pointFromEvent(event as ReactPointerEvent<SVGSVGElement>),
      elementId: selected.id,
      original: structuredClone(selected),
      historyRecorded: false,
      changed: false
    };
  };

  const undo = () => {
    if (!documentValue || !past.length || scratchPage) return;
    const previous = past[past.length - 1];
    setFuture(history =>
      [
        { pages: clonePages(documentValue.pages), currentPageId: currentPageId || documentValue.pages[0]?.id || "" },
        ...history
      ].slice(0, 50)
    );
    setPast(history => history.slice(0, -1));
    setDocumentValue({ ...documentValue, pages: previous!.pages });
    setCurrentPageId(
      previous!.pages.some(page => page.id === previous!.currentPageId)
        ? previous!.currentPageId
        : previous!.pages[0]?.id || ""
    );
    setSelectedId(null);
    markDirty();
  };

  const redo = () => {
    if (!documentValue || !future.length || scratchPage) return;
    const next = future[0];
    setPast(history =>
      [
        ...history,
        { pages: clonePages(documentValue.pages), currentPageId: currentPageId || documentValue.pages[0]?.id || "" }
      ].slice(-50)
    );
    setFuture(history => history.slice(1));
    setDocumentValue({ ...documentValue, pages: next!.pages });
    setCurrentPageId(
      next!.pages.some(page => page.id === next!.currentPageId) ? next!.currentPageId : next!.pages[0]?.id || ""
    );
    setSelectedId(null);
    markDirty();
  };

  const createDocument = () => {
    setInputDialog({ kind: "create", initialValue: "我的白板课件" });
  };

  const renameDocument = (item: WhiteboardDocument) => {
    setInputDialog({ kind: "rename", initialValue: item.title, documentId: item.id });
  };

  const duplicateDocument = async (item: WhiteboardDocument) => {
    const copy = await request<WhiteboardDocument, WhiteboardDocument>({
      url: `/api/whiteboards/${item.id}/duplicate`,
      method: "POST"
    });
    setDocuments(items => [copy, ...items]);
  };

  const deleteDocument = (item: WhiteboardDocument) => {
    setDeleteTarget(item);
  };

  const confirmInputDialog = async (value: string) => {
    if (!inputDialog) return;
    if (inputDialog.kind === "create") {
      const created = await request<WhiteboardDocument, WhiteboardDocument>({
        url: "/api/whiteboards",
        method: "POST",
        data: { title: value }
      });
      setDocuments(items => [created, ...items]);
      await openDocument(created);
    } else if (inputDialog.kind === "rename") {
      const updated = await request<WhiteboardDocument, WhiteboardDocument>({
        url: `/api/whiteboards/${inputDialog.documentId}`,
        method: "PATCH",
        data: { title: value }
      });
      setDocuments(items => items.map(item => (item.id === updated.id ? updated : item)));
    } else {
      const formula: FormulaElement = {
        id: createUuid(),
        type: "formula",
        formula: value,
        x: 260,
        y: 280,
        width: Math.min(760, Math.max(220, value.length * 28)),
        height: 72,
        rotation: 0,
        stroke: color,
        fill: color,
        strokeWidth: 1,
        opacity: 1,
        fontSize: 42
      };
      updateCurrentPage(page => ({ ...page, elements: [...page.elements, formula] }));
      setSelectedId(formula.id);
      setTool("select");
    }
    setInputDialog(null);
  };

  const confirmDeleteDocument = async () => {
    if (!deleteTarget) return;
    try {
      await request<{ deleted: boolean }, { deleted: boolean }>({
        url: `/api/whiteboards/${deleteTarget.id}`,
        method: "DELETE"
      });
      localStorage.removeItem(`${DRAFT_PREFIX}${deleteTarget.id}`);
      await deleteWhiteboardDraft(deleteTarget.id).catch(() => undefined);
      setDocuments(items => items.filter(value => value.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      // 请求层已经显示错误，保留确认弹窗供重试。
    }
  };

  const addPage = () => {
    if (!documentValue) return;
    pushHistory();
    const page = newPage(documentValue.pages.length + 1);
    setDocumentValue({ ...documentValue, pages: [...documentValue.pages, page] });
    setCurrentPageId(page.id);
    setSelectedId(null);
    markDirty();
  };

  const duplicatePage = (page: WhiteboardPage) => {
    if (!documentValue) return;
    pushHistory();
    const copy = {
      ...structuredClone(page),
      id: createUuid(),
      name: `${page.name} 副本`,
      elements: page.elements.map(element => ({ ...element, id: createUuid() }))
    };
    const index = documentValue.pages.findIndex(item => item.id === page.id);
    const pages = [...documentValue.pages];
    pages.splice(index + 1, 0, copy);
    setDocumentValue({ ...documentValue, pages });
    setCurrentPageId(copy.id);
    setSelectedId(null);
    markDirty();
  };

  const deletePage = (page: WhiteboardPage) => {
    if (!documentValue || documentValue.pages.length === 1) return;
    pushHistory();
    const pages = documentValue.pages.filter(item => item.id !== page.id);
    setDocumentValue({ ...documentValue, pages });
    if (currentPageId === page.id) setCurrentPageId(pages[Math.max(0, currentIndex - 1)]!.id);
    setSelectedId(null);
    markDirty();
  };

  const insertImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !currentPage) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("图片不能超过 8MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const ratio = Math.min(1, 520 / image.width, 360 / image.height);
        const width = Math.max(80, image.width * ratio);
        const height = Math.max(60, image.height * ratio);
        const element: WhiteboardElement = {
          id: createUuid(),
          type: "image",
          src: String(reader.result),
          x: (BOARD_WIDTH - width) / 2,
          y: (BOARD_HEIGHT - height) / 2,
          width,
          height,
          rotation: 0,
          stroke: "none",
          fill: "none",
          strokeWidth: 0,
          opacity: 1
        };
        updateCurrentPage(page => ({ ...page, elements: [...page.elements, element] }));
        setSelectedId(element.id);
        setTool("select");
      };
      image.onerror = () => toast.error("图片无法读取，请选择有效的 PNG、JPEG、WebP 或 GIF 文件");
      image.src = String(reader.result);
    };
    reader.onerror = () => toast.error("图片读取失败");
    reader.readAsDataURL(file);
  };

  const importCourseware = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !documentValue || isPresenting) return;
    if (file.size > 30 * 1024 * 1024) {
      toast.error("导入文件不能超过 30MB");
      return;
    }
    try {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (extension !== "pdf" && extension !== "pptx") {
        toast.error("仅支持 PDF 或 PPTX 文件");
        return;
      }
      setImportStatus(`正在读取 ${file.name}`);
      const pages =
        extension === "pdf"
          ? await importPdfPages(file, (current, total) => setImportStatus(`正在导入 PDF：${current}/${total}`))
          : await importPptxPages(file, (current, total) => setImportStatus(`正在转换 PPTX：${current}/${total}`));
      if (!pages.length) throw new Error("课件中没有可导入的页面");
      if (JSON.stringify(pages).length > 20 * 1024 * 1024) throw new Error("转换后的课件超过 20MB，请拆分文件后导入");
      pushHistory();
      setDocumentValue(current => (current ? { ...current, pages: [...current.pages, ...pages] } : current));
      setCurrentPageId(pages[0]!.id);
      setSelectedId(null);
      markDirty();
      toast.success(`已导入 ${pages.length} 页`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "课件导入失败");
    } finally {
      setImportStatus(null);
    }
  };

  const insertTable = () => {
    const table: TableElement = {
      id: createUuid(),
      type: "table",
      rows: 4,
      columns: 3,
      cells: Array(12).fill(""),
      x: 260,
      y: 180,
      width: 760,
      height: 360,
      rotation: 0,
      stroke: color,
      fill: "#ffffff",
      strokeWidth: 2,
      opacity: 1,
      fontSize: 22
    };
    updateCurrentPage(page => ({ ...page, elements: [...page.elements, table] }));
    setSelectedId(table.id);
    setTool("select");
  };

  const changeTableGrid = (axis: "row" | "column", delta: -1 | 1) => {
    if (selected?.type !== "table") return;
    setTableCellEditor(null);
    updateElement(selected.id, element => {
      if (element.type !== "table") return element;
      const rows = axis === "row" ? clamp(element.rows + delta, 1, 12) : element.rows;
      const columns = axis === "column" ? clamp(element.columns + delta, 1, 12) : element.columns;
      if (rows === element.rows && columns === element.columns) return element;

      // 按行列坐标复制旧内容，新增单元格为空，删除列时不会打乱其余行的数据。
      const cells = Array.from({ length: rows * columns }, (_, index) => {
        const row = Math.floor(index / columns);
        const column = index % columns;
        return row < element.rows && column < element.columns
          ? (element.cells[row * element.columns + column] ?? "")
          : "";
      });
      const cellWidth = element.width / element.columns;
      const cellHeight = element.height / element.rows;
      return {
        ...element,
        rows,
        columns,
        cells,
        width:
          axis === "column"
            ? Math.min(BOARD_WIDTH - element.x, Math.max(120, element.width + cellWidth * delta))
            : element.width,
        height:
          axis === "row"
            ? Math.min(BOARD_HEIGHT - element.y, Math.max(80, element.height + cellHeight * delta))
            : element.height
      };
    });
  };

  const insertMedia = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !currentPage) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("音视频文件不能超过 8MB");
      return;
    }
    const mediaType = file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : null;
    if (!mediaType) {
      toast.error("请选择音频或视频文件");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const media: MediaElement = {
        id: createUuid(),
        type: "media",
        mediaType,
        src: String(reader.result),
        name: file.name,
        x: 320,
        y: mediaType === "video" ? 130 : 260,
        width: 640,
        height: mediaType === "video" ? 400 : 180,
        rotation: 0,
        stroke: "#64748b",
        fill: "#0f172a",
        strokeWidth: 2,
        opacity: 1
      };
      updateCurrentPage(page => ({ ...page, elements: [...page.elements, media] }));
      setSelectedId(media.id);
      setTool("select");
    };
    reader.onerror = () => toast.error("媒体文件读取失败");
    reader.readAsDataURL(file);
  };

  const applyTemplate = (template: string) => {
    if (!currentPage || template === "none") return;
    const base = { rotation: 0, stroke: "#64748b", strokeWidth: 2, opacity: 1 };
    const elements: WhiteboardElement[] =
      template === "title"
        ? [
            {
              ...base,
              id: createUuid(),
              type: "text",
              text: "课程标题",
              x: 390,
              y: 240,
              width: 500,
              height: 70,
              fill: "#172554",
              fontSize: 54
            },
            {
              ...base,
              id: createUuid(),
              type: "text",
              text: "在此输入副标题",
              x: 470,
              y: 340,
              width: 340,
              height: 42,
              fill: "#64748b",
              fontSize: 28
            }
          ]
        : template === "columns"
          ? ([
              {
                ...base,
                id: createUuid(),
                type: "text",
                text: "主题",
                x: 70,
                y: 45,
                width: 420,
                height: 52,
                fill: "#172554",
                fontSize: 40
              },
              {
                ...base,
                id: createUuid(),
                type: "shape",
                shape: "line",
                x: 640,
                y: 130,
                width: 0,
                height: 510,
                fill: "none"
              },
              {
                ...base,
                id: createUuid(),
                type: "text",
                text: "要点一",
                x: 110,
                y: 150,
                width: 300,
                height: 42,
                fill: "#2563eb",
                fontSize: 30
              },
              {
                ...base,
                id: createUuid(),
                type: "text",
                text: "要点二",
                x: 710,
                y: 150,
                width: 300,
                height: 42,
                fill: "#2563eb",
                fontSize: 30
              }
            ] as WhiteboardElement[])
          : [
              {
                ...base,
                id: createUuid(),
                type: "text",
                text: "课堂练习",
                x: 70,
                y: 40,
                width: 400,
                height: 52,
                fill: "#172554",
                fontSize: 40
              },
              ...Array.from({ length: 3 }, (_, index) => ({
                ...base,
                id: createUuid(),
                type: "shape" as const,
                shape: "rect" as const,
                x: 90,
                y: 135 + index * 175,
                width: 1100,
                height: 135,
                fill: "none"
              }))
            ];
    updateCurrentPage(page => ({ ...page, backgroundImage: undefined, elements: [...page.elements, ...elements] }));
  };

  const changeBackground = (background: WhiteboardBackground) => {
    updateCurrentPage(page => ({
      ...page,
      background,
      backgroundImage: undefined,
      backgroundColor:
        background === "blackboard" ? "#12372a" : page.background === "blackboard" ? "#ffffff" : page.backgroundColor
    }));
    if (background === "blackboard") setColor("#ffffff");
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    updateCurrentPage(page => ({ ...page, elements: page.elements.filter(element => element.id !== selectedId) }));
    setSelectedId(null);
  };

  const changeColor = (nextColor: string) => {
    setColor(nextColor);
    if (inlineTextEditor) {
      // 底部全局颜色只负责整段文字；局部字符颜色由输入框旁的调色板处理。
      setInlineTextEditor(current => (current ? { ...current, color: nextColor, runs: undefined } : current));
      return;
    }
    if (!selected || selected.type === "image" || selected.type === "media") return;

    // 选中对象时修改对象本身；未选中（或选中图片、媒体）时只更新后续绘制使用的默认颜色。
    updateElement(selected.id, element => {
      if (element.type === "text") {
        return { ...element, fill: nextColor, stroke: nextColor, runs: undefined };
      }
      if (element.type === "formula") return { ...element, fill: nextColor, stroke: nextColor };
      if (element.type === "shape" || element.type === "stroke" || element.type === "table") {
        return { ...element, stroke: nextColor };
      }
      return element;
    });
  };

  const applyInlineTextColor = (nextColor: string) => {
    if (!inlineTextEditor) return;
    const input = inlineTextInputRef.current;
    const selectionStart = input?.selectionStart ?? 0;
    const selectionEnd = input?.selectionEnd ?? selectionStart;
    if (selectionStart >= selectionEnd) {
      toast.error("请先拖选需要变色的文字");
      input?.focus();
      return;
    }
    const selectedAll = selectionStart === 0 && selectionEnd === inlineTextEditor.value.length;
    const runs = selectedAll
      ? undefined
      : textRunsWithRangeColor(
          inlineTextEditor.value,
          inlineTextEditor.runs,
          inlineTextEditor.color,
          selectionStart,
          selectionEnd,
          nextColor
        );
    commitInlineText({ color: selectedAll ? nextColor : inlineTextEditor.color, runs });
  };

  const moveLayer = (direction: "up" | "down") => {
    if (!selectedId || !currentPage) return;
    const index = currentPage.elements.findIndex(element => element.id === selectedId);
    const target = direction === "up" ? index + 1 : index - 1;
    // 已在最顶层/最底层时不产生空历史和无意义的保存请求。
    if (index < 0 || target < 0 || target >= currentPage.elements.length) return;
    updateCurrentPage(page => {
      const elements = [...page.elements];
      [elements[index], elements[target]] = [elements[target]!, elements[index]!];
      return { ...page, elements };
    });
  };

  const exportPng = async () => {
    if (!currentPage) return;
    const dataUrl = await renderPage(currentPage);
    const blob = await (await fetch(dataUrl)).blob();
    downloadBlob(blob, `${safeFilename(documentValue?.title || "临时黑板")}-${currentPage.name}.png`);
  };

  const exportPdf = async () => {
    if (!documentValue) return;
    try {
      const pages = scratchPage ? [scratchPage] : isPresenting && sessionPages ? sessionPages : documentValue.pages;
      const images = [];
      for (const page of pages)
        images.push({ dataUrl: await renderPage(page, "jpeg"), width: BOARD_WIDTH, height: BOARD_HEIGHT });
      const title = scratchPage ? "临时黑板" : documentValue.title;
      downloadBlob(createImagePdf(images), `${safeFilename(title)}.pdf`);
    } catch {
      // 导出状态与云端保存状态相互独立，失败时不能把保存标签改成“已保存”。
      toast.error("PDF 导出失败，请检查页面中的图片是否有效");
    }
  };

  const exportSessionPdf = async (session: WhiteboardSession) => {
    if (!documentValue) return;
    try {
      const images = [];
      for (const page of session.pages)
        images.push({ dataUrl: await renderPage(page, "jpeg"), width: BOARD_WIDTH, height: BOARD_HEIGHT });
      const date = new Date(session.startedAt).toLocaleDateString("zh-CN").replaceAll("/", "-");
      downloadBlob(createImagePdf(images), `${safeFilename(documentValue.title)}-课堂批注-${date}.pdf`);
    } catch {
      toast.error("课堂批注导出失败，请检查记录中的媒体是否有效");
    }
  };

  const loadSessionHistory = async () => {
    if (!documentValue) return;
    setSessionHistoryLoading(true);
    try {
      const sessions = await request<WhiteboardSession[], WhiteboardSession[]>(
        `/api/whiteboards/${documentValue.id}/sessions`
      );
      setSessionHistory(sessions);
    } catch {
      // 请求层会展示服务端错误；面板保持关闭，避免显示不完整数据。
    } finally {
      setSessionHistoryLoading(false);
    }
  };

  const enterPresentation = async () => {
    if (!documentValue) return;
    sessionEndingRef.current = false;
    const pages = clonePages(documentValue.pages);
    try {
      const session = await request<WhiteboardSession, WhiteboardSession>({
        url: `/api/whiteboards/${documentValue.id}/sessions`,
        method: "POST"
      });
      setSessionId(session.id);
      setSessionPages(pages);
      setSessionRevision(1);
    } catch {
      setSessionId(null);
      setSessionPages(pages);
      toast.error("课堂记录暂时无法创建，本次批注仅在当前页面保留");
    }
    setIsPresenting(true);
    document.body.classList.add("whiteboard-presenting");
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      /* 浏览器可能禁止程序触发全屏，仍保留应用内授课模式。 */
    }
  };

  const finishPresentation = useCallback(async () => {
    if (sessionEndingRef.current) return;
    sessionEndingRef.current = true;
    if (documentValue && sessionId && sessionPages) {
      try {
        await request<WhiteboardSession, WhiteboardSession>({
          url: `/api/whiteboards/${documentValue.id}/sessions/${sessionId}`,
          method: "PATCH",
          data: { pages: sessionPages, ended: true }
        });
        toast.success("课堂批注已独立保存");
      } catch {
        toast.error("课堂批注保存失败，请保持当前页面后重试");
        sessionEndingRef.current = false;
        return;
      }
    }
    setIsPresenting(false);
    setSessionId(null);
    setSessionPages(null);
    setSessionRevision(0);
    setAssistantMode("none");
    document.body.classList.remove("whiteboard-presenting");
    if (document.fullscreenElement) await document.exitFullscreen?.().catch(() => undefined);
  }, [documentValue, sessionId, sessionPages, setAssistantMode]);

  useEffect(() => {
    const onFullscreen = () => {
      if (!document.fullscreenElement) {
        void finishPresentation();
      }
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.body.classList.remove("whiteboard-presenting");
    };
  }, [finishPresentation]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const isFormField = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !isFormField) {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId && !isFormField) deleteSelected();
      if (event.key === "Escape") {
        setSelectedId(null);
        setTool("select");
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  const selectedBounds = selected ? elementBounds(selected) : null;
  const selectedColor =
    selected?.type === "text" || selected?.type === "formula"
      ? selected.fill
      : selected?.type === "shape" || selected?.type === "stroke" || selected?.type === "table"
        ? selected.stroke
        : color;
  const colorControlLabel =
    selected?.type === "text"
      ? "文字颜色"
      : selected?.type === "shape"
        ? "图形颜色"
        : selected?.type === "stroke"
          ? "笔迹颜色"
          : selected?.type === "table"
            ? "表格颜色"
            : selected?.type === "formula"
              ? "公式颜色"
              : "颜色";
  const inlineTextWidth = inlineTextEditor
    ? Math.min(BOARD_WIDTH - inlineTextEditor.point.x, textWidth(inlineTextEditor.value, inlineTextEditor.fontSize))
    : 0;
  const inlineTextHeight = inlineTextEditor ? Math.max(44, inlineTextEditor.fontSize * 1.55) : 0;
  const inlinePanelWidth = inlineTextEditor
    ? Math.min(BOARD_WIDTH - inlineTextEditor.point.x, Math.max(390, inlineTextWidth))
    : 0;
  const inlinePanelHeight = inlineTextEditor ? inlineTextHeight + 58 : 0;
  const inlineTextY = inlineTextEditor ? clamp(inlineTextEditor.point.y, 0, BOARD_HEIGHT - inlinePanelHeight) : 0;
  const inlineTextTransform =
    inlineTextEditor?.rotation && inlineTextEditor
      ? `rotate(${inlineTextEditor.rotation} ${inlineTextEditor.point.x + inlineTextWidth / 2} ${inlineTextY + inlineTextHeight / 2})`
      : undefined;
  const editingTable = tableCellEditor
    ? currentPage?.elements.find(
        (element): element is TableElement => element.id === tableCellEditor.elementId && element.type === "table"
      )
    : undefined;
  const editingTableColumn = tableCellEditor && editingTable ? tableCellEditor.cellIndex % editingTable.columns : 0;
  const editingTableRow =
    tableCellEditor && editingTable ? Math.floor(tableCellEditor.cellIndex / editingTable.columns) : 0;
  const editingTableCellWidth = editingTable ? editingTable.width / editingTable.columns : 0;
  const editingTableCellHeight = editingTable ? editingTable.height / editingTable.rows : 0;
  const editingTableTransform = editingTable?.rotation
    ? `rotate(${editingTable.rotation} ${editingTable.x + editingTable.width / 2} ${editingTable.y + editingTable.height / 2})`
    : undefined;
  const toolCursor = tool === "select" ? "default" : tool === "eraser" ? "cell" : "crosshair";
  const titleSaveLabel =
    saveState === "saving"
      ? "保存中…"
      : saveState === "local"
        ? "已保存到本机"
        : saveState === "error"
          ? "保存失败"
          : "已保存";
  const inputDialogTitle =
    inputDialog?.kind === "create" ? "新建白板课件" : inputDialog?.kind === "formula" ? "插入公式" : "重命名课件";
  const dialogs = (
    <>
      <InputDialog
        open={Boolean(inputDialog)}
        title={inputDialogTitle}
        initialValue={inputDialog?.initialValue}
        description={
          inputDialog?.kind === "formula" ? "支持常用 LaTeX 写法，例如 \\frac{a}{b}、\\sqrt{x}、\\times。" : undefined
        }
        placeholder={inputDialog?.kind === "formula" ? "请输入公式" : "请输入课件名称"}
        confirmText={inputDialog?.kind === "formula" ? "插入" : "确定"}
        onConfirm={confirmInputDialog}
        onCancel={() => setInputDialog(null)}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除白板课件"
        description={`确定删除“${deleteTarget?.title ?? ""}”吗？删除后无法恢复。`}
        confirmText="删除"
        onConfirm={() => void confirmDeleteDocument()}
        onCancel={() => setDeleteTarget(null)}
      />
      {importStatus && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div
            role="status"
            className="flex items-center gap-3 rounded-xl border bg-white px-6 py-5 font-medium text-slate-800 shadow-2xl dark:bg-slate-900 dark:text-slate-100"
          >
            <FileUp className="h-5 w-5 animate-pulse text-blue-600" />
            {importStatus}
          </div>
        </div>
      )}
      {sessionHistory && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
          role="presentation"
          onPointerDown={event => {
            if (event.target === event.currentTarget) setSessionHistory(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="whiteboard-session-history-title"
            className="flex max-h-[78vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl dark:bg-slate-900"
          >
            <header className="flex items-center gap-3 border-b px-5 py-4 dark:border-slate-700">
              <History className="h-5 w-5 text-blue-600" />
              <div className="min-w-0 flex-1">
                <h3 id="whiteboard-session-history-title" className="font-semibold">
                  课堂批注记录
                </h3>
                <p className="text-xs text-slate-500">授课批注独立保存，不会覆盖原课件。</p>
              </div>
              <button
                type="button"
                aria-label="关闭课堂批注记录"
                onClick={() => setSessionHistory(null)}
                className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="min-h-0 overflow-y-auto p-4">
              {sessionHistory.length === 0 ? (
                <div className="flex min-h-36 items-center justify-center rounded-xl border border-dashed text-sm text-slate-500">
                  暂无课堂批注记录
                </div>
              ) : (
                <div className="space-y-2">
                  {sessionHistory.map(session => (
                    <article
                      key={session.id}
                      className="flex items-center gap-3 rounded-xl border p-3 dark:border-slate-700"
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950">
                        <Presentation className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{new Date(session.startedAt).toLocaleString("zh-CN")}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {session.pages.length} 页 · {session.endedAt ? "已结束" : "自动保存中"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void exportSessionPdf(session)}
                        className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
                      >
                        <FileDown className="h-4 w-4" />
                        导出 PDF
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );

  if (isLoading)
    return <div className="flex h-full items-center justify-center text-sm text-slate-500">正在加载白板课件…</div>;

  if (!documentValue) {
    return (
      <div className="h-full overflow-auto bg-slate-50 p-6 dark:bg-slate-950">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">互动白板</h2>
              <p className="mt-1 text-sm text-slate-500">备课、板书和课堂工具都在一个工作区</p>
            </div>
            <button
              onClick={createDocument}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              新建课件
            </button>
          </div>
          {loadError && (
            <div className="mb-4 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              <span>课件列表加载失败，请确认后端和数据库已启动。</span>
              <button
                onClick={loadDocuments}
                className="rounded-lg bg-amber-100 px-3 py-1.5 font-medium hover:bg-amber-200 dark:bg-amber-900"
              >
                重试
              </button>
            </div>
          )}
          {documents.length === 0 ? (
            <button
              onClick={createDocument}
              className="flex min-h-72 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white text-slate-500 transition hover:border-blue-400 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900"
            >
              <Presentation className="mb-3 h-12 w-12" />
              <span className="font-medium">创建第一份白板课件</span>
              <span className="mt-1 text-xs">支持画笔、图形、文本、图片和多页内容</span>
            </button>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {documents.map(item => (
                <div
                  key={item.id}
                  className="group overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-slate-900"
                >
                  <button
                    onClick={() => openDocument(item)}
                    className="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-800 dark:to-indigo-950"
                  >
                    <PenLine className="h-12 w-12 text-blue-500" />
                  </button>
                  <div className="p-4">
                    <button
                      className="max-w-full truncate text-left font-semibold hover:text-blue-600"
                      onClick={() => openDocument(item)}
                    >
                      {item.title}
                    </button>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.pages.length} 页 · {new Date(item.updatedAt).toLocaleString("zh-CN")}
                    </p>
                    <div className="mt-3 flex gap-1 opacity-70 group-hover:opacity-100">
                      <button
                        title="重命名"
                        onClick={() => renameDocument(item)}
                        className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Type className="h-4 w-4" />
                      </button>
                      <button
                        title="复制"
                        onClick={() => duplicateDocument(item)}
                        className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        title="删除"
                        onClick={() => deleteDocument(item)}
                        className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {dialogs}
      </div>
    );
  }

  return (
    <div
      className={`flex h-full min-h-0 flex-col bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100 ${isPresenting ? "fixed inset-0 z-[200]" : ""}`}
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-white px-3 dark:bg-slate-900">
        {!isPresenting && (
          <button
            title="返回课件列表"
            onClick={() => void closeDocument()}
            className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <input
          value={documentValue.title}
          readOnly={isPresenting}
          onChange={event => {
            if (isPresenting) return;
            setDocumentValue({ ...documentValue, title: event.target.value });
            markDirty();
          }}
          onBlur={() => {
            if (documentValue.title.trim()) return;
            setDocumentValue({ ...documentValue, title: lastSavedTitleRef.current || "未命名课件" });
          }}
          maxLength={128}
          aria-label="课件名称"
          className="min-w-0 max-w-72 flex-1 rounded-md bg-transparent px-2 font-semibold outline-none focus:bg-slate-100 dark:focus:bg-slate-800"
        />
        <span
          className={`hidden items-center gap-1 text-xs sm:flex ${saveState === "local" ? "text-amber-600" : saveState === "error" ? "text-red-600" : "text-slate-500"}`}
        >
          <Save className="h-3.5 w-3.5" />
          {titleSaveLabel}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {!isPresenting && (
            <>
              <button
                onClick={() => void loadSessionHistory()}
                disabled={sessionHistoryLoading}
                title="课堂批注记录"
                className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800"
              >
                <History className={`h-4 w-4 ${sessionHistoryLoading ? "animate-spin" : ""}`} />
              </button>
              <button
                title="撤销"
                disabled={!past.length}
                onClick={undo}
                className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
              >
                <Undo2 className="h-4 w-4" />
              </button>
              <button
                title="重做"
                disabled={!future.length}
                onClick={redo}
                className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
              >
                <Redo2 className="h-4 w-4" />
              </button>
            </>
          )}
          {!isPresenting && (
            <>
              <button
                onClick={() => importRef.current?.click()}
                title="导入 PDF 或 PPTX"
                className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <FileUp className="h-4 w-4" />
              </button>
              <input
                ref={importRef}
                type="file"
                accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                className="hidden"
                onChange={importCourseware}
              />
            </>
          )}
          <button
            onClick={exportPng}
            title="导出当前页 PNG"
            className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={exportPdf}
            title="导出整份 PDF"
            className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <FileDown className="h-4 w-4" />
          </button>
          {isPresenting ? (
            <button
              onClick={() => void finishPresentation()}
              className="flex items-center gap-1 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600"
            >
              <X className="h-4 w-4" />
              结束授课
            </button>
          ) : (
            <button
              onClick={enterPresentation}
              className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
            >
              <Presentation className="h-4 w-4" />
              授课
            </button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {!isPresenting && (
          <aside className="hidden w-36 shrink-0 overflow-y-auto border-r bg-white p-2 md:block dark:bg-slate-900">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-medium text-slate-500">页面</span>
              <button
                onClick={addPage}
                title="新增页面"
                className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2">
              {documentValue.pages.map((page, index) => (
                <div
                  key={page.id}
                  className={`group rounded-lg border-2 p-1 ${page.id === currentPageId ? "border-blue-500" : "border-transparent hover:border-slate-300"}`}
                >
                  <button
                    onClick={() => {
                      setCurrentPageId(page.id);
                      setSelectedId(null);
                    }}
                    className="relative aspect-video w-full overflow-hidden rounded border bg-white"
                    style={{ backgroundColor: page.backgroundColor }}
                  >
                    {page.backgroundImage && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 bg-contain bg-center bg-no-repeat"
                        style={{ backgroundImage: `url(${page.backgroundImage})` }}
                      />
                    )}
                    <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-slate-300">
                      {index + 1}
                    </span>
                    <span className="absolute bottom-1 right-1 text-[9px] text-slate-400">
                      {page.elements.length} 项
                    </span>
                  </button>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="truncate px-1 text-[10px] text-slate-500">{page.name}</span>
                    <div className="hidden group-hover:flex">
                      <button title="复制页面" onClick={() => duplicatePage(page)} className="p-1">
                        <Copy className="h-3 w-3" />
                      </button>
                      <button
                        title="删除页面"
                        disabled={documentValue.pages.length === 1}
                        onClick={() => deletePage(page)}
                        className="p-1 text-red-500 disabled:opacity-30"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}

        <main className="relative flex min-w-0 flex-1 flex-col items-center justify-center overflow-hidden p-2 sm:p-4">
          {!isPresenting && !scratchPage && currentPage && (
            <div className="absolute inset-x-2 top-2 z-20 flex items-center justify-center gap-1 md:hidden">
              <button
                aria-label="上一页"
                title="上一页"
                disabled={currentIndex <= 0}
                onClick={() => setCurrentPageId(documentValue.pages[currentIndex - 1]!.id)}
                className="rounded-full bg-white/95 p-2 shadow disabled:opacity-30 dark:bg-slate-800/95"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="rounded-full bg-white/95 px-3 py-2 text-xs shadow dark:bg-slate-800/95">
                {currentIndex + 1} / {activePages?.length ?? 0}
              </span>
              <button
                aria-label="下一页"
                title="下一页"
                disabled={currentIndex >= (activePages?.length ?? 0) - 1}
                onClick={() => setCurrentPageId(activePages![currentIndex + 1]!.id)}
                className="rounded-full bg-white/95 p-2 shadow disabled:opacity-30 dark:bg-slate-800/95"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                aria-label="新增页面"
                title="新增页面"
                onClick={addPage}
                className="rounded-full bg-white/95 p-2 shadow dark:bg-slate-800/95"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                aria-label="复制当前页面"
                title="复制当前页面"
                onClick={() => duplicatePage(currentPage)}
                className="rounded-full bg-white/95 p-2 shadow dark:bg-slate-800/95"
              >
                <Copy className="h-4 w-4" />
              </button>
              <button
                aria-label="删除当前页面"
                title="删除当前页面"
                disabled={documentValue.pages.length === 1}
                onClick={() => deletePage(currentPage)}
                className="rounded-full bg-white/95 p-2 text-red-500 shadow disabled:opacity-30 dark:bg-slate-800/95"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
          {scratchPage && (
            <div className="absolute left-1/2 top-2 z-20 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white shadow">
              临时黑板 · 内容不会保存
            </div>
          )}
          <div
            className="flex max-h-full w-full max-w-[calc((100vh-8rem)*1.777)] items-center justify-center overflow-hidden rounded-lg bg-white shadow-2xl"
            style={{ aspectRatio: `${BOARD_WIDTH}/${BOARD_HEIGHT}` }}
          >
            {currentPage && (
              <svg
                ref={svgRef}
                viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
                className="h-full w-full touch-none select-none"
                style={{ cursor: toolCursor }}
                onPointerDown={beginInteraction}
                onPointerMove={moveInteraction}
                onPointerUp={finishInteraction}
                onPointerCancel={finishInteraction}
              >
                <g id={`whiteboard-content-${currentPage.id}`}>
                  {pageBackground(currentPage)}
                  {currentPage.elements.map(element =>
                    element.id === inlineTextEditor?.elementId ? null : (
                      <ElementNode key={element.id} element={element} />
                    )
                  )}
                </g>
                {inlineTextEditor && (
                  <foreignObject
                    x={inlineTextEditor.point.x}
                    y={inlineTextY}
                    width={inlinePanelWidth}
                    height={inlinePanelHeight}
                    transform={inlineTextTransform}
                    onPointerDown={event => event.stopPropagation()}
                  >
                    <div className="flex h-full flex-col items-start">
                      <input
                        ref={inlineTextInputRef}
                        aria-label={inlineTextEditor.elementId ? "修改白板文字" : "输入白板文字"}
                        maxLength={200}
                        value={inlineTextEditor.value}
                        onChange={event => {
                          setInlineTextEditor(current =>
                            current ? { ...current, value: event.target.value, runs: undefined } : current
                          );
                        }}
                        onBlur={() => commitInlineText()}
                        onKeyDown={event => {
                          event.stopPropagation();
                          if (event.key === "Enter") event.currentTarget.blur();
                          if (event.key === "Escape") cancelInlineText();
                        }}
                        className="rounded-md border-2 border-blue-500 bg-white/95 px-2 shadow-lg outline-none"
                        style={{
                          width: inlineTextWidth,
                          height: inlineTextHeight,
                          fontSize: inlineTextEditor.fontSize,
                          color: inlineTextEditor.color
                        }}
                      />
                      <div className="mt-1 flex h-12 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 shadow-lg">
                        <span className="mr-1 whitespace-nowrap text-xs text-slate-500">拖选文字后：</span>
                        {textPalette.map(paletteColor => (
                          <button
                            key={paletteColor}
                            type="button"
                            aria-label={`局部文字颜色 ${paletteColor}`}
                            title={paletteColor}
                            className="h-6 w-6 rounded-full border-2 border-white shadow ring-1 ring-slate-300"
                            style={{ backgroundColor: paletteColor }}
                            onPointerDown={event => {
                              event.preventDefault();
                              event.stopPropagation();
                              applyInlineTextColor(paletteColor);
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </foreignObject>
                )}
                {tableCellEditor && editingTable && (
                  <foreignObject
                    x={editingTable.x + editingTableColumn * editingTableCellWidth + 1}
                    y={editingTable.y + editingTableRow * editingTableCellHeight + 1}
                    width={Math.max(1, editingTableCellWidth - 2)}
                    height={Math.max(1, editingTableCellHeight - 2)}
                    transform={editingTableTransform}
                    onPointerDown={event => event.stopPropagation()}
                  >
                    <input
                      ref={tableCellInputRef}
                      aria-label={`编辑表格第 ${editingTableRow + 1} 行第 ${editingTableColumn + 1} 列`}
                      maxLength={200}
                      value={tableCellEditor.value}
                      onChange={event =>
                        setTableCellEditor(current => (current ? { ...current, value: event.target.value } : current))
                      }
                      onBlur={commitTableCellEditor}
                      onKeyDown={event => {
                        event.stopPropagation();
                        if (event.key === "Enter") event.currentTarget.blur();
                        if (event.key === "Escape") cancelTableCellEditor();
                      }}
                      className="h-full w-full border-2 border-blue-500 bg-white px-2 text-slate-900 shadow-lg outline-none"
                      style={{ fontSize: editingTable.fontSize }}
                    />
                  </foreignObject>
                )}
                {selected && selectedBounds && tool === "select" && !inlineTextEditor && !tableCellEditor && (
                  <g data-selection-controls="true">
                    <rect
                      x={selectedBounds.x - 6}
                      y={selectedBounds.y - 6}
                      width={selectedBounds.width + 12}
                      height={selectedBounds.height + 12}
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth="2"
                      strokeDasharray="8 5"
                      pointerEvents="none"
                    />
                    <line
                      x1={selectedBounds.x + selectedBounds.width / 2}
                      y1={selectedBounds.y - 6}
                      x2={selectedBounds.x + selectedBounds.width / 2}
                      y2={selectedBounds.y - 35}
                      stroke="#2563eb"
                      strokeWidth="2"
                      pointerEvents="none"
                    />
                    <circle
                      cx={selectedBounds.x + selectedBounds.width / 2}
                      cy={selectedBounds.y - 42}
                      r="9"
                      fill="#2563eb"
                      stroke="white"
                      strokeWidth="3"
                      className="cursor-grab"
                      onPointerDown={event => beginHandle(event, "rotate")}
                    />
                    <rect
                      x={selectedBounds.x + selectedBounds.width - 4}
                      y={selectedBounds.y + selectedBounds.height - 4}
                      width="16"
                      height="16"
                      rx="3"
                      fill="#2563eb"
                      stroke="white"
                      strokeWidth="3"
                      className="cursor-nwse-resize"
                      onPointerDown={event => beginHandle(event, "resize")}
                    />
                  </g>
                )}
                {assistantMode === "spotlight" && (
                  <g pointerEvents="none">
                    <defs>
                      <mask id="spotlight-mask">
                        <rect width={BOARD_WIDTH} height={BOARD_HEIGHT} fill="white" />
                        <circle cx={assistantPoint.x} cy={assistantPoint.y} r="125" fill="black" />
                      </mask>
                    </defs>
                    <rect
                      width={BOARD_WIDTH}
                      height={BOARD_HEIGHT}
                      fill="#020617"
                      opacity=".82"
                      mask="url(#spotlight-mask)"
                    />
                    <circle
                      cx={assistantPoint.x}
                      cy={assistantPoint.y}
                      r="126"
                      fill="none"
                      stroke="white"
                      strokeOpacity=".75"
                      strokeWidth="3"
                    />
                  </g>
                )}
                {assistantMode === "magnifier" && (
                  <g pointerEvents="none">
                    <defs>
                      <clipPath id="magnifier-clip">
                        <circle cx={assistantPoint.x} cy={assistantPoint.y} r="125" />
                      </clipPath>
                    </defs>
                    <circle
                      cx={assistantPoint.x}
                      cy={assistantPoint.y}
                      r="128"
                      fill="white"
                      stroke="#0f172a"
                      strokeWidth="8"
                    />
                    <g clipPath="url(#magnifier-clip)">
                      <g
                        transform={`translate(${assistantPoint.x} ${assistantPoint.y}) scale(2) translate(${-assistantPoint.x} ${-assistantPoint.y})`}
                      >
                        <use href={`#whiteboard-content-${currentPage.id}`} />
                      </g>
                    </g>
                    <circle
                      cx={assistantPoint.x}
                      cy={assistantPoint.y}
                      r="125"
                      fill="none"
                      stroke="white"
                      strokeWidth="3"
                    />
                  </g>
                )}
                {assistantMode === "curtain" && (
                  <g pointerEvents="none">
                    <rect width={BOARD_WIDTH} height={curtainHeight} fill="#0f172a" opacity=".97" />
                    <rect y={curtainHeight - 9} width={BOARD_WIDTH} height="18" rx="9" fill="#334155" />
                    <rect
                      x={BOARD_WIDTH / 2 - 55}
                      y={curtainHeight - 18}
                      width="110"
                      height="36"
                      rx="18"
                      fill="#f8fafc"
                      stroke="#64748b"
                      strokeWidth="3"
                    />
                  </g>
                )}
              </svg>
            )}
          </div>

          {isPresenting && (activePages?.length ?? 0) > 1 && (
            <div className="absolute inset-x-0 bottom-20 flex justify-center gap-2">
              <button
                aria-label="上一页"
                title="上一页"
                disabled={currentIndex <= 0}
                onClick={() => setCurrentPageId(activePages![currentIndex - 1]!.id)}
                className="rounded-full bg-white/90 p-3 shadow disabled:opacity-30 dark:bg-slate-800"
              >
                <ChevronLeft />
              </button>
              <span className="rounded-full bg-white/90 px-4 py-3 text-sm shadow dark:bg-slate-800">
                {currentIndex + 1} / {activePages?.length ?? 0}
              </span>
              <button
                aria-label="下一页"
                title="下一页"
                disabled={currentIndex >= (activePages?.length ?? 0) - 1}
                onClick={() => setCurrentPageId(activePages![currentIndex + 1]!.id)}
                className="rounded-full bg-white/90 p-3 shadow disabled:opacity-30 dark:bg-slate-800"
              >
                <ChevronRight />
              </button>
            </div>
          )}

          <div className="absolute bottom-3 left-1/2 z-30 flex max-w-[calc(100%-16px)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-2xl border bg-white/95 p-1.5 shadow-xl backdrop-blur dark:bg-slate-900/95">
            {toolItems.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  title={item.label}
                  onClick={() => {
                    setTool(item.id);
                    if (item.id !== "select") setSelectedId(null);
                  }}
                  className={`flex shrink-0 flex-col items-center rounded-xl px-2 py-1 text-[10px] ${tool === item.id ? "bg-blue-600 text-white" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
            <span className="mx-1 h-8 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />
            <button
              title="插入图片"
              onClick={() => fileRef.current?.click()}
              className="flex shrink-0 flex-col items-center rounded-xl px-2 py-1 text-[10px] hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ImagePlus className="h-4 w-4" />
              <span>图片</span>
            </button>
            <input
              ref={fileRef}
              className="hidden"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={insertImage}
            />
            <button
              title="插入表格"
              onClick={insertTable}
              className="flex shrink-0 flex-col items-center rounded-xl px-2 py-1 text-[10px] hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Table2 className="h-4 w-4" />
              <span>表格</span>
            </button>
            <button
              title="插入公式"
              onClick={() => setInputDialog({ kind: "formula", initialValue: "\\frac{a}{b}" })}
              className="flex shrink-0 flex-col items-center rounded-xl px-2 py-1 text-[10px] hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Sigma className="h-4 w-4" />
              <span>公式</span>
            </button>
            <button
              title="插入音视频"
              onClick={() => mediaRef.current?.click()}
              className="flex shrink-0 flex-col items-center rounded-xl px-2 py-1 text-[10px] hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Video className="h-4 w-4" />
              <span>媒体</span>
            </button>
            <input ref={mediaRef} type="file" accept="audio/*,video/*" className="hidden" onChange={insertMedia} />
            <input
              aria-label={colorControlLabel}
              title={colorControlLabel}
              type="color"
              value={selectedColor}
              onChange={event => changeColor(event.target.value)}
              className="h-8 w-8 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
            />
            <select
              title="线宽"
              value={strokeWidth}
              onChange={event => setStrokeWidth(Number(event.target.value))}
              className="h-8 shrink-0 rounded-lg border bg-white px-1 text-xs dark:bg-slate-900"
            >
              <option value="2">细</option>
              <option value="4">中</option>
              <option value="8">粗</option>
              <option value="14">特粗</option>
            </select>
            {!isPresenting && currentPage && (
              <select
                title="页面背景"
                value={currentPage.background}
                onChange={event => changeBackground(event.target.value as WhiteboardBackground)}
                className="h-8 shrink-0 rounded-lg border bg-white px-1 text-xs dark:bg-slate-900"
              >
                {backgroundOptions.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            )}
            {!isPresenting && currentPage && (
              <input
                title="背景颜色"
                type="color"
                value={currentPage.backgroundColor}
                onChange={event => updateCurrentPage(page => ({ ...page, backgroundColor: event.target.value }))}
                className="h-8 w-8 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
              />
            )}
            {!isPresenting && (
              <select
                title="页面模板"
                defaultValue="none"
                onChange={event => {
                  applyTemplate(event.target.value);
                  event.currentTarget.value = "none";
                }}
                className="h-8 shrink-0 rounded-lg border bg-white px-1 text-xs dark:bg-slate-900"
              >
                <option value="none">页面模板</option>
                <option value="title">标题页</option>
                <option value="columns">双栏讲解</option>
                <option value="exercise">课堂练习</option>
              </select>
            )}
            <button
              onClick={() => setSmartInk(value => !value)}
              title="智能图形识别"
              className={`flex shrink-0 flex-col items-center rounded-xl px-2 py-1 text-[10px] ${smartInk ? "bg-violet-100 text-violet-700 dark:bg-violet-950" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}
            >
              <ScanSearch className="h-4 w-4" />
              <span>智能笔</span>
            </button>
            {selected && (
              <>
                {selected.type === "table" && !tableCellEditor && (
                  <>
                    <button
                      type="button"
                      aria-label="新增表格行"
                      title="新增表格行"
                      disabled={selected.rows >= 12}
                      onClick={() => changeTableGrid("row", 1)}
                      className="shrink-0 rounded-lg px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
                    >
                      +行
                    </button>
                    <button
                      type="button"
                      aria-label="删除表格末行"
                      title="删除表格末行"
                      disabled={selected.rows <= 1}
                      onClick={() => changeTableGrid("row", -1)}
                      className="shrink-0 rounded-lg px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
                    >
                      −行
                    </button>
                    <button
                      type="button"
                      aria-label="新增表格列"
                      title="新增表格列"
                      disabled={selected.columns >= 12}
                      onClick={() => changeTableGrid("column", 1)}
                      className="shrink-0 rounded-lg px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
                    >
                      +列
                    </button>
                    <button
                      type="button"
                      aria-label="删除表格末列"
                      title="删除表格末列"
                      disabled={selected.columns <= 1}
                      onClick={() => changeTableGrid("column", -1)}
                      className="shrink-0 rounded-lg px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
                    >
                      −列
                    </button>
                  </>
                )}
                <button
                  onClick={() => moveLayer("up")}
                  title="上移一层"
                  className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Layers className="h-4 w-4" />
                </button>
                <button
                  onClick={() => moveLayer("down")}
                  title="下移一层"
                  className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Layers className="h-4 w-4 rotate-180" />
                </button>
                <button
                  onClick={deleteSelected}
                  title="删除元素"
                  className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
            <span className="mx-1 h-8 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />
            <button
              onClick={() => {
                setAssistantMode(mode => (mode === "spotlight" ? "none" : "spotlight"));
                setTool("select");
                setSelectedId(null);
              }}
              title="聚光灯"
              className={`flex shrink-0 flex-col items-center rounded-xl px-2 py-1 text-[10px] ${assistantMode === "spotlight" ? "bg-slate-800 text-white" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}
            >
              <Focus className="h-4 w-4" />
              <span>聚光灯</span>
            </button>
            <button
              onClick={() => {
                setAssistantMode(mode => (mode === "magnifier" ? "none" : "magnifier"));
                setTool("select");
                setSelectedId(null);
              }}
              title="放大镜"
              className={`flex shrink-0 flex-col items-center rounded-xl px-2 py-1 text-[10px] ${assistantMode === "magnifier" ? "bg-slate-800 text-white" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}
            >
              <ScanSearch className="h-4 w-4" />
              <span>放大镜</span>
            </button>
            <button
              onClick={() => {
                setAssistantMode(mode => (mode === "curtain" ? "none" : "curtain"));
                setTool("select");
                setSelectedId(null);
              }}
              title="幕布"
              className={`flex shrink-0 flex-col items-center rounded-xl px-2 py-1 text-[10px] ${assistantMode === "curtain" ? "bg-slate-800 text-white" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}
            >
              <ListTree className="h-4 w-4" />
              <span>幕布</span>
            </button>
            <button
              onClick={() => {
                if (scratchPage) {
                  setScratchPage(null);
                  setColor(colorBeforeScratchRef.current);
                  setSelectedId(null);
                } else {
                  colorBeforeScratchRef.current = color;
                  setScratchPage({ ...newPage(1), name: "临时黑板", backgroundColor: "#111827" });
                  setColor("#ffffff");
                  setSelectedId(null);
                }
              }}
              title="临时黑板"
              className={`flex shrink-0 flex-col items-center rounded-xl px-2 py-1 text-[10px] ${scratchPage ? "bg-slate-800 text-white" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}
            >
              <Maximize2 className="h-4 w-4" />
              <span>{scratchPage ? "返回课件" : "临时板"}</span>
            </button>
            <button
              onClick={() => onOpenTool?.("countdown")}
              title="倒计时"
              className="flex shrink-0 flex-col items-center rounded-xl px-2 py-1 text-[10px] hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Clock3 className="h-4 w-4" />
              <span>计时</span>
            </button>
            <button
              onClick={() => onOpenTool?.("randomPicker")}
              title="随机点名"
              className="flex shrink-0 flex-col items-center rounded-xl px-2 py-1 text-[10px] hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Users className="h-4 w-4" />
              <span>点名</span>
            </button>
            <button
              onClick={() => onOpenTool?.("petPoints")}
              title="宠物积分"
              className="flex shrink-0 flex-col items-center rounded-xl px-2 py-1 text-[10px] hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Sparkles className="h-4 w-4" />
              <span>积分</span>
            </button>
          </div>
        </main>
      </div>
      {dialogs}
    </div>
  );
}
