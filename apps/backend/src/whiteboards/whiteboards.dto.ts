import { WhiteboardPage } from './whiteboards.types';

export class CreateWhiteboardDto {
  title?: string;
  pages?: WhiteboardPage[];
}

export class UpdateWhiteboardDto {
  title?: string;
  pages?: WhiteboardPage[];
}

export class UpdateWhiteboardSessionDto {
  pages?: WhiteboardPage[];
  ended?: boolean;
}
