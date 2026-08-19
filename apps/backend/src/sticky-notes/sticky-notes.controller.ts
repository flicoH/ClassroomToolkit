import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CreateStickyNoteDto, UpdateStickyNoteDto } from './sticky-notes.dto';
import { StickyNotesService } from './sticky-notes.service';

@Controller('sticky-notes')
export class StickyNotesController {
  constructor(private readonly stickyNotesService: StickyNotesService) {}

  @Get()
  findAll() {
    return this.stickyNotesService.findAll();
  }

  @Post()
  create(@Body() dto: CreateStickyNoteDto) {
    return this.stickyNotesService.create(dto);
  }

  @Patch(':noteId')
  update(@Param('noteId') noteId: string, @Body() dto: UpdateStickyNoteDto) {
    return this.stickyNotesService.update(noteId, dto);
  }

  @Post(':noteId/toggle-pinned')
  togglePinned(@Param('noteId') noteId: string) {
    return this.stickyNotesService.togglePinned(noteId);
  }

  @Delete(':noteId')
  delete(@Param('noteId') noteId: string) {
    return this.stickyNotesService.delete(noteId);
  }
}
