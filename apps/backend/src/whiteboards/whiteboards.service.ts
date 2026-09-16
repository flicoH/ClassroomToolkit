import { Injectable, NotFoundException } from '@nestjs/common';
import { createEntityId } from '../common/id';
import {
  CreateWhiteboardDto,
  UpdateWhiteboardDto,
  UpdateWhiteboardSessionDto,
} from './whiteboards.dto';
import { WhiteboardsDatabase } from './whiteboards.database';
import { WhiteboardPage } from './whiteboards.types';

@Injectable()
export class WhiteboardsService {
  constructor(private readonly database: WhiteboardsDatabase) {}

  findAll() {
    return this.database.findAll();
  }

  async findOne(id: string) {
    const document = await this.database.findById(id);
    if (!document) throw new NotFoundException('白板课件不存在');
    return document;
  }

  create(dto: CreateWhiteboardDto) {
    return this.database.save({
      id: createEntityId('whiteboard'),
      title: dto.title?.trim() || '未命名课件',
      pages: dto.pages?.length ? dto.pages : [this.createEmptyPage(1)],
    });
  }

  async update(id: string, dto: UpdateWhiteboardDto) {
    const document = await this.findOne(id);
    return this.database.save({
      id,
      title: dto.title?.trim() || document.title,
      pages: dto.pages?.length ? dto.pages : document.pages,
    });
  }

  async duplicate(id: string) {
    const document = await this.findOne(id);
    return this.database.save({
      id: createEntityId('whiteboard'),
      title: `${document.title} - 副本`,
      pages: document.pages.map((page) => ({
        ...page,
        id: createEntityId('page'),
        elements: page.elements.map((element) => ({
          ...(element as Record<string, unknown>),
          id: createEntityId('element'),
        })),
      })),
    });
  }

  async delete(id: string) {
    await this.findOne(id);
    await this.database.delete(id);
    return { deleted: true };
  }

  async findSessions(documentId: string) {
    await this.findOne(documentId);
    return this.database.findSessions(documentId);
  }

  async createSession(documentId: string) {
    const document = await this.findOne(documentId);
    return this.database.saveSession({
      id: createEntityId('whiteboard-session'),
      documentId,
      pages: structuredClone(document.pages),
      endedAt: null,
    });
  }

  async updateSession(
    documentId: string,
    sessionId: string,
    dto: UpdateWhiteboardSessionDto,
  ) {
    await this.findOne(documentId);
    const session = await this.database.findSession(sessionId, documentId);
    if (!session) throw new NotFoundException('课堂批注记录不存在');
    return this.database.saveSession({
      id: session.id,
      documentId,
      pages: dto.pages?.length ? dto.pages : session.pages,
      endedAt: dto.ended ? new Date() : session.endedAt,
    });
  }

  private createEmptyPage(index: number): WhiteboardPage {
    return {
      id: createEntityId('page'),
      name: `第 ${index} 页`,
      background: 'plain',
      backgroundColor: '#ffffff',
      elements: [],
    };
  }
}
