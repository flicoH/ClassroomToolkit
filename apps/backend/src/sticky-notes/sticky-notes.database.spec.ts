import { StickyNotesDatabase } from './sticky-notes.database';

describe('StickyNotesDatabase teacher isolation', () => {
  const teacherContext = { teacherId: 'teacher-a' };
  const note = {
    id: 'note-a',
    title: '提醒',
    content: '内容',
    color: 'yellow' as const,
    pinned: false,
    updatedAt: '09:10',
  };

  function createDatabase() {
    const repository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    return {
      repository,
      database: new StickyNotesDatabase(
        repository as never,
        teacherContext as never,
      ),
    };
  }

  it('scopes list and lookup queries to the current teacher', async () => {
    const { repository, database } = createDatabase();
    await database.findAll();
    await database.findById('note-a');

    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teacherId: 'teacher-a' } }),
    );
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 'note-a', teacherId: 'teacher-a' },
    });
  });

  it('forces ownership on writes and scopes deletes', async () => {
    const { repository, database } = createDatabase();
    repository.findOne.mockResolvedValue({ ...note, teacherId: 'teacher-a' });

    await database.save(note);
    await database.delete('note-a');

    expect(repository.create).toHaveBeenCalledWith({
      ...note,
      teacherId: 'teacher-a',
    });
    expect(repository.delete).toHaveBeenCalledWith({
      id: 'note-a',
      teacherId: 'teacher-a',
    });
  });
});
