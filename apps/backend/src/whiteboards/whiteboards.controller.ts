import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { TrackFeature } from '../analytics/track-feature';
import {
  CreateWhiteboardDto,
  UpdateWhiteboardDto,
  UpdateWhiteboardSessionDto,
} from './whiteboards.dto';
import { WhiteboardsService } from './whiteboards.service';

@Controller('whiteboards')
export class WhiteboardsController {
  constructor(private readonly whiteboardsService: WhiteboardsService) {}

  @Get()
  findAll() {
    return this.whiteboardsService.findAll();
  }

  @Get(':documentId')
  findOne(@Param('documentId') documentId: string) {
    return this.whiteboardsService.findOne(documentId);
  }

  @Post()
  @TrackFeature('whiteboard', 'create')
  create(@Body() dto: CreateWhiteboardDto) {
    return this.whiteboardsService.create(dto);
  }

  @Patch(':documentId')
  @TrackFeature('whiteboard', 'save', 'whiteboard')
  update(
    @Param('documentId') documentId: string,
    @Body() dto: UpdateWhiteboardDto,
  ) {
    return this.whiteboardsService.update(documentId, dto);
  }

  @Post(':documentId/duplicate')
  duplicate(@Param('documentId') documentId: string) {
    return this.whiteboardsService.duplicate(documentId);
  }

  @Get(':documentId/sessions')
  findSessions(@Param('documentId') documentId: string) {
    return this.whiteboardsService.findSessions(documentId);
  }

  @Post(':documentId/sessions')
  @TrackFeature('whiteboard', 'start-session')
  createSession(@Param('documentId') documentId: string) {
    return this.whiteboardsService.createSession(documentId);
  }

  @Patch(':documentId/sessions/:sessionId')
  updateSession(
    @Param('documentId') documentId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: UpdateWhiteboardSessionDto,
  ) {
    return this.whiteboardsService.updateSession(documentId, sessionId, dto);
  }

  @Delete(':documentId')
  delete(@Param('documentId') documentId: string) {
    return this.whiteboardsService.delete(documentId);
  }
}
