export type NoteColor = 'yellow' | 'blue' | 'green' | 'pink' | 'purple';

export interface StickyNote {
  id: string;
  title: string;
  content: string;
  color: NoteColor;
  pinned: boolean;
  updatedAt: string;
}
