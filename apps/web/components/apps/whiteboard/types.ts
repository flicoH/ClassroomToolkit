export type WhiteboardBackground =
  | "plain"
  | "grid"
  | "lined"
  | "tianzi"
  | "english"
  | "music"
  | "coordinate"
  | "blackboard";
export type WhiteboardTool =
  | "select"
  | "pen"
  | "highlighter"
  | "eraser"
  | "line"
  | "arrow"
  | "rect"
  | "ellipse"
  | "text";

interface ElementBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  stroke: string;
  fill: string;
  strokeWidth: number;
  opacity: number;
}

export interface StrokeElement extends ElementBase {
  type: "stroke";
  points: Array<{ x: number; y: number }>;
}

export interface ShapeElement extends ElementBase {
  type: "shape";
  shape: "line" | "arrow" | "rect" | "ellipse";
}

export interface TextElement extends ElementBase {
  type: "text";
  text: string;
  fontSize: number;
  /** 可选的富文本分段；旧数据没有该字段时继续使用 fill 作为整段颜色。 */
  runs?: TextRun[];
}

export interface TextRun {
  text: string;
  color: string;
}

export interface ImageElement extends ElementBase {
  type: "image";
  src: string;
}

export interface TableElement extends ElementBase {
  type: "table";
  rows: number;
  columns: number;
  cells: string[];
  fontSize: number;
}

export interface FormulaElement extends ElementBase {
  type: "formula";
  formula: string;
  fontSize: number;
}

export interface MediaElement extends ElementBase {
  type: "media";
  mediaType: "audio" | "video";
  src: string;
  name: string;
}

export type WhiteboardElement =
  | StrokeElement
  | ShapeElement
  | TextElement
  | ImageElement
  | TableElement
  | FormulaElement
  | MediaElement;

export interface WhiteboardPage {
  id: string;
  name: string;
  background: WhiteboardBackground;
  backgroundColor: string;
  /** PDF/PPTX 导入生成的静态页面底图，板书元素独立叠加。 */
  backgroundImage?: string;
  elements: WhiteboardElement[];
}

export interface WhiteboardSession {
  id: string;
  documentId: string;
  pages: WhiteboardPage[];
  startedAt: string;
  updatedAt: string;
  endedAt: string | null;
}

export interface WhiteboardDocument {
  id: string;
  title: string;
  pages: WhiteboardPage[];
  createdAt: string;
  updatedAt: string;
}

export interface LocalDraft {
  savedAt: number;
  title: string;
  pages: WhiteboardPage[];
}
