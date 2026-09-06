import { TrackFeature } from '../analytics/track-feature';
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

  /** 获取全部便签。 */
  @Get()
  findAll() {
    return this.stickyNotesService.findAll();
  }

  /** 创建便签并记录功能使用。 */
  @Post()
  @TrackFeature('sticky-notes', 'create')
  create(@Body() dto: CreateStickyNoteDto) {
    return this.stickyNotesService.create(dto);
  }

  /** 更新便签内容并记录保存行为。 */
  @Patch(':noteId')
  @TrackFeature('sticky-notes', 'save', 'note')
  update(@Param('noteId') noteId: string, @Body() dto: UpdateStickyNoteDto) {
    return this.stickyNotesService.update(noteId, dto);
  }

  /** 切换便签置顶状态。 */
  @Post(':noteId/toggle-pinned')
  togglePinned(@Param('noteId') noteId: string) {
    return this.stickyNotesService.togglePinned(noteId);
  }

  /** 删除便签。 */
  @Delete(':noteId')
  delete(@Param('noteId') noteId: string) {
    return this.stickyNotesService.delete(noteId);
  }
}
