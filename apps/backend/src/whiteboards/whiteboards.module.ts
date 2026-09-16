import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhiteboardDocumentEntity } from './entities/whiteboard-document.entity';
import { WhiteboardSessionEntity } from './entities/whiteboard-session.entity';
import { WhiteboardsController } from './whiteboards.controller';
import { WhiteboardsDatabase } from './whiteboards.database';
import { WhiteboardsService } from './whiteboards.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WhiteboardDocumentEntity,
      WhiteboardSessionEntity,
    ]),
  ],
  controllers: [WhiteboardsController],
  providers: [WhiteboardsDatabase, WhiteboardsService],
})
export class WhiteboardsModule {}
