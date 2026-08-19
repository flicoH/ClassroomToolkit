import { NoteColor } from './sticky-notes.types';

export class CreateStickyNoteDto {
  title!: string;
  content!: string;
  color!: NoteColor;
  pinned?: boolean;
}

export class UpdateStickyNoteDto {
  title?: string;
  content?: string;
  color?: NoteColor;
  pinned?: boolean;
}
