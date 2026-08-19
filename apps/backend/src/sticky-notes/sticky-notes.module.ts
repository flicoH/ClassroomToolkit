import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StickyNoteEntity } from './entities/sticky-note.entity';
import { StickyNotesController } from './sticky-notes.controller';
import { StickyNotesDatabase } from './sticky-notes.database';
import { StickyNotesService } from './sticky-notes.service';

@Module({
  imports: [TypeOrmModule.forFeature([StickyNoteEntity])],
  controllers: [StickyNotesController],
  providers: [StickyNotesDatabase, StickyNotesService],
})
export class StickyNotesModule {}
