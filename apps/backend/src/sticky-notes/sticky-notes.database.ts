import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StickyNoteEntity } from './entities/sticky-note.entity';
import { StickyNote } from './sticky-notes.types';
import { TeacherContext } from '../auth/teacher-context';

@Injectable()
export class StickyNotesDatabase {
  constructor(
    @InjectRepository(StickyNoteEntity)
    private readonly notes: Repository<StickyNoteEntity>,
    private readonly teacherContext: TeacherContext,
  ) {}

  async findAll() {
    const rows = await this.notes.find({
      where: { teacherId: this.teacherContext.teacherId },
      order: { pinned: 'DESC', createdAt: 'DESC' },
    });
    return rows.map((row) => this.toNote(row));
  }

  async findById(id: string) {
    const row = await this.notes.findOne({
      where: { id, teacherId: this.teacherContext.teacherId },
    });
    return row ? this.toNote(row) : undefined;
  }

  async save(note: StickyNote) {
    await this.notes.save(
      this.notes.create({ ...note, teacherId: this.teacherContext.teacherId }),
    );
    return (await this.findById(note.id))!;
  }

  async delete(id: string) {
    const result = await this.notes.delete({
      id,
      teacherId: this.teacherContext.teacherId,
    });
    return Boolean(result.affected);
  }

  private toNote(entity: StickyNoteEntity): StickyNote {
    return {
      id: entity.id,
      title: entity.title,
      content: entity.content,
      color: entity.color,
      pinned: entity.pinned,
      updatedAt: entity.updatedAt,
    };
  }
}
