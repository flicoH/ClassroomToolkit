import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TeacherContext } from '../auth/teacher-context';
import { WhiteboardDocumentEntity } from './entities/whiteboard-document.entity';
import { WhiteboardSessionEntity } from './entities/whiteboard-session.entity';
import {
  WhiteboardDocument,
  WhiteboardPage,
  WhiteboardSession,
} from './whiteboards.types';

@Injectable()
export class WhiteboardsDatabase {
  constructor(
    @InjectRepository(WhiteboardDocumentEntity)
    private readonly documents: Repository<WhiteboardDocumentEntity>,
    @InjectRepository(WhiteboardSessionEntity)
    private readonly sessions: Repository<WhiteboardSessionEntity>,
    private readonly teacherContext: TeacherContext,
  ) {}

  async findAll() {
    const rows = await this.documents.find({
      where: { teacherId: this.teacherContext.teacherId },
      order: { updatedAt: 'DESC' },
    });
    return rows.map((row) => this.toDocument(row));
  }

  async findById(id: string) {
    const row = await this.documents.findOne({
      where: { id, teacherId: this.teacherContext.teacherId },
    });
    return row ? this.toDocument(row) : undefined;
  }

  async save(document: Pick<WhiteboardDocument, 'id' | 'title' | 'pages'>) {
    await this.documents.save(
      this.documents.create({
        id: document.id,
        teacherId: this.teacherContext.teacherId,
        title: document.title,
        pages: JSON.stringify(document.pages),
      }),
    );
    return (await this.findById(document.id))!;
  }

  async delete(id: string) {
    const result = await this.documents.delete({
      id,
      teacherId: this.teacherContext.teacherId,
    });
    return Boolean(result.affected);
  }

  async findSessions(documentId: string) {
    const rows = await this.sessions.find({
      where: { documentId, teacherId: this.teacherContext.teacherId },
      order: { startedAt: 'DESC' },
    });
    return rows.map((row) => this.toSession(row));
  }

  async findSession(id: string, documentId: string) {
    const row = await this.sessions.findOne({
      where: { id, documentId, teacherId: this.teacherContext.teacherId },
    });
    return row ? this.toSession(row) : undefined;
  }

  async saveSession(
    session: Pick<WhiteboardSession, 'id' | 'documentId' | 'pages'> & {
      endedAt?: Date | null;
    },
  ) {
    await this.sessions.save(
      this.sessions.create({
        id: session.id,
        teacherId: this.teacherContext.teacherId,
        documentId: session.documentId,
        pages: JSON.stringify(session.pages),
        ...(session.endedAt !== undefined ? { endedAt: session.endedAt } : {}),
      }),
    );
    return (await this.findSession(session.id, session.documentId))!;
  }

  private toDocument(entity: WhiteboardDocumentEntity): WhiteboardDocument {
    let pages: WhiteboardPage[] = [];
    try {
      pages = JSON.parse(entity.pages) as WhiteboardPage[];
    } catch {
      pages = [];
    }
    return {
      id: entity.id,
      title: entity.title,
      pages,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private toSession(entity: WhiteboardSessionEntity): WhiteboardSession {
    let pages: WhiteboardPage[] = [];
    try {
      pages = JSON.parse(entity.pages) as WhiteboardPage[];
    } catch {
      pages = [];
    }
    return {
      id: entity.id,
      documentId: entity.documentId,
      pages,
      startedAt: entity.startedAt,
      updatedAt: entity.updatedAt,
      endedAt: entity.endedAt,
    };
  }
}
