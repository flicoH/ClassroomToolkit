export type WhiteboardBackground =
  | 'plain'
  | 'grid'
  | 'lined'
  | 'tianzi'
  | 'english'
  | 'music'
  | 'coordinate'
  | 'blackboard';

export interface WhiteboardPage {
  id: string;
  name: string;
  background: WhiteboardBackground;
  backgroundColor: string;
  backgroundImage?: string;
  elements: unknown[];
}

export interface WhiteboardDocument {
  id: string;
  title: string;
  pages: WhiteboardPage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface WhiteboardSession {
  id: string;
  documentId: string;
  pages: WhiteboardPage[];
  startedAt: Date;
  updatedAt: Date;
  endedAt: Date | null;
}
