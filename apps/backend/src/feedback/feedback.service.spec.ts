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

  it.each([
    'SELECT * FROM teachers',
    'delete from teacher_feedback',
    'DROP TABLE teachers',
    'UPDATE teachers SET name = 1',
    'INSERT INTO teachers VALUES (1)',
    "' UNION SELECT password FROM teachers --",
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    'javascript:alert(1)',
    'const password = document.cookie',
    'function run() { alert(1) }',
    '() => { alert(1) }',
  ])('rejects SQL or JavaScript content: %s', (content) => {
    const database = { save: jest.fn() };
    const service = new FeedbackService(database as never);
    expect(() => service.create({ content })).toThrow(BadRequestException);
    expect(database.save).not.toHaveBeenCalled();
  });

  it.each([
    '建议增加 SQL 课程和 JavaScript 教学资料',
    '页面显示 select 字样时排版错乱',
    '希望代码示例能正常显示',
  ])('accepts ordinary feedback: %s', async (content) => {
    const database = {
      save: jest.fn().mockResolvedValue({ id: 'feedback-1' }),
    };
    await new FeedbackService(database as never).create({ content });
    expect(database.save).toHaveBeenCalledWith(expect.any(String), content);
  });
});
