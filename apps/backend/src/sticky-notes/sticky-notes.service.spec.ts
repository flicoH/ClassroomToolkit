import { StickyNotesService } from './sticky-notes.service';
import { StickyNote } from './sticky-notes.types';

describe('StickyNotesService', () => {
  it('creates and toggles notes through the backend database', async () => {
    const savedNotes = new Map<string, StickyNote>();
    const database = {
      save: jest.fn().mockImplementation(async (note) => {
        savedNotes.set(note.id, note);
        return note;
      }),
      findById: jest.fn().mockImplementation(async (id) => savedNotes.get(id)),
    };
    const service = new StickyNotesService(database as never);

    const created = await service.create({
      title: '课前提醒',
      content: '检查设备',
      color: 'yellow',
      pinned: false,
    });
    const toggled = await service.togglePinned(created.id);

    expect(created.id).toMatch(/^note-/);
    expect(created.updatedAt).toMatch(/^\d{2}:\d{2}$/);
    expect(toggled.pinned).toBe(true);
  });
});
