import { Injectable, NotFoundException } from '@nestjs/common';
import { createEntityId } from '../common/id';
import { CreateStickyNoteDto, UpdateStickyNoteDto } from './sticky-notes.dto';
import { StickyNotesDatabase } from './sticky-notes.database';

@Injectable()
export class StickyNotesService {
  constructor(private readonly database: StickyNotesDatabase) {}

  /** 查询便签列表，并让置顶便签排在前面。 */
  async findAll() {
    const notes = await this.database.findAll();
    return notes.sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }

  /** 创建便签并写入更新时间。 */
  create(dto: CreateStickyNoteDto) {
    return this.database.save({
      id: createEntityId('note'),
      title: dto.title,
      content: dto.content,
      color: dto.color,
      pinned: dto.pinned ?? false,
      updatedAt: this.nowLabel(),
    });
  }

  /** 更新便签内容、颜色或标题，并刷新更新时间。 */
  async update(noteId: string, dto: UpdateStickyNoteDto) {
    const note = await this.getNoteOrThrow(noteId);
    return this.database.save({
      ...note,
      ...dto,
      id: noteId,
      updatedAt: this.nowLabel(),
    });
  }

  /** 翻转便签置顶状态。 */
  async togglePinned(noteId: string) {
    const note = await this.getNoteOrThrow(noteId);
    return this.database.save({
      ...note,
      pinned: !note.pinned,
      updatedAt: this.nowLabel(),
    });
  }

  /** 删除便签前先确认其存在。 */
  async delete(noteId: string) {
    await this.getNoteOrThrow(noteId);
    await this.database.delete(noteId);
    return { deleted: true };
  }

  /** 查询便签，不存在时抛出业务异常。 */
  private async getNoteOrThrow(noteId: string) {
    const note = await this.database.findById(noteId);
    if (!note) throw new NotFoundException('便签不存在');
    return note;
  }

  /** 与前端展示一致，只返回小时和分钟。 */
  private nowLabel() {
    return new Date().toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
}
