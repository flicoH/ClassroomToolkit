import { NotFoundException } from '@nestjs/common';
import { WhiteboardsDatabase } from './whiteboards.database';
import { WhiteboardsService } from './whiteboards.service';
import { WhiteboardDocument, WhiteboardSession } from './whiteboards.types';

describe('WhiteboardsService', () => {
  const documents = new Map<string, WhiteboardDocument>();
  const sessions = new Map<string, WhiteboardSession>();
  const database = {
    findAll: jest.fn(async () => [...documents.values()]),
    findById: jest.fn(async (id: string) => documents.get(id)),
    save: jest.fn(
      async (value: Pick<WhiteboardDocument, 'id' | 'title' | 'pages'>) => {
        const saved = {
          ...value,
          createdAt: new Date('2026-09-11T00:00:00Z'),
          updatedAt: new Date('2026-09-11T00:00:00Z'),
        };
        documents.set(value.id, saved);
        return saved;
      },
    ),
    delete: jest.fn(async (id: string) => documents.delete(id)),
    findSessions: jest.fn(async (documentId: string) =>
      [...sessions.values()].filter(
        (session) => session.documentId === documentId,
      ),
    ),
    findSession: jest.fn(async (id: string, documentId: string) => {
      const session = sessions.get(id);
      return session?.documentId === documentId ? session : undefined;
    }),
    saveSession: jest.fn(
      async (
        value: Pick<WhiteboardSession, 'id' | 'documentId' | 'pages'> & {
          endedAt?: Date | null;
        },
      ) => {
        const previous = sessions.get(value.id);
        const saved = {
          ...value,
          startedAt: previous?.startedAt ?? new Date('2026-09-11T01:00:00Z'),
          updatedAt: new Date('2026-09-11T02:00:00Z'),
          endedAt: value.endedAt ?? previous?.endedAt ?? null,
        };
        sessions.set(value.id, saved);
        return saved;
      },
    ),
  } as unknown as WhiteboardsDatabase;
  const service = new WhiteboardsService(database);

  beforeEach(() => {
    documents.clear();
    sessions.clear();
    jest.clearAllMocks();
  });

  it('creates a document with one empty page', async () => {
    const created = await service.create({ title: '数学课' });
    expect(created.title).toBe('数学课');
    expect(created.pages).toHaveLength(1);
    expect(created.pages[0]).toMatchObject({
      name: '第 1 页',
      background: 'plain',
      elements: [],
    });
  });

  it('updates and duplicates a document without reusing element ids', async () => {
    const created = await service.create({ title: '语文课' });
    const pages = [
      {
        ...created.pages[0],
        elements: [{ id: 'element-1', type: 'text', text: '课文' }],
      },
    ];
    const updated = await service.update(created.id, { pages });
    const copy = await service.duplicate(created.id);
    expect(updated.pages[0].elements).toHaveLength(1);
    expect(copy.id).not.toBe(created.id);
    expect(copy.pages[0].id).not.toBe(updated.pages[0].id);
    expect((copy.pages[0].elements[0] as { id: string }).id).not.toBe(
      'element-1',
    );
  });

  it('rejects access to a missing document', async () => {
    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('stores classroom annotations separately from the source document', async () => {
    const document = await service.create({ title: '公开课' });
    const session = await service.createSession(document.id);
    const annotatedPages = structuredClone(session.pages);
    annotatedPages[0]!.elements.push({ id: 'annotation-1', type: 'text' });

    const ended = await service.updateSession(document.id, session.id, {
      pages: annotatedPages,
      ended: true,
    });

    expect(ended.pages[0]!.elements).toHaveLength(1);
    expect(ended.endedAt).toBeInstanceOf(Date);
    expect((await service.findOne(document.id)).pages[0]!.elements).toEqual([]);
    expect(await service.findSessions(document.id)).toEqual([ended]);
  });

  it('rejects a missing classroom annotation record', async () => {
    const document = await service.create({ title: '公开课' });
    await expect(
      service.updateSession(document.id, 'missing-session', { ended: true }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
