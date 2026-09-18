import { BadRequestException } from '@nestjs/common';
import { FeedbackService } from './feedback.service';

describe('FeedbackService', () => {
  it('trims and saves valid feedback', async () => {
    const database = {
      save: jest.fn().mockResolvedValue({ id: 'feedback-1' }),
    };
    const result = await new FeedbackService(database as never).create({
      content: '  希望增加深色模式  ',
    });

    expect(database.save).toHaveBeenCalledWith(
      expect.stringMatching(/^feedback-/),
      '希望增加深色模式',
    );
    expect(result).toEqual({ id: 'feedback-1' });
  });

  it('rejects blank feedback', () => {
    const service = new FeedbackService({ save: jest.fn() } as never);
    expect(() => service.create({ content: '   ' })).toThrow(
      BadRequestException,
    );
  });
});
