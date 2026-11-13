import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SubjectReportsController } from './subject-reports.controller';
import { SubjectReportsService } from './subject-reports.service';

describe('subject reports classroom photo multipart endpoint', () => {
  let app: INestApplication;
  const save = jest.fn(
    async (
      _id: string,
      file?: { size: number; buffer: Buffer },
      _slot?: unknown,
    ) => ({
      bytes: file?.size,
    }),
  );

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SubjectReportsController],
      providers: [
        {
          provide: SubjectReportsService,
          useValue: { setClassroomPhoto: save },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  beforeEach(() => save.mockClear());
  afterAll(async () => app.close());

  const path = '/subject-reports/reports/rep-1/classroom-photo';

  it('receives the actual photo bytes through the named multipart field', async () => {
    const buffer = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    await request(app.getHttpAdapter().getInstance())
      .post(path)
      .attach('file', buffer, {
        filename: 'photo.png',
        contentType: 'image/png',
      })
      .expect(201);
    expect(save).toHaveBeenCalledWith(
      'rep-1',
      expect.objectContaining({
        buffer,
        mimetype: 'image/png',
        size: buffer.length,
      }),
    );
  });

  it('routes the second photo by slot parameter', async () => {
    const buffer = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    await request(app.getHttpAdapter().getInstance())
      .post(`${path}?slot=1`)
      .attach('file', buffer, 'second.png')
      .expect(201);
    expect(save).toHaveBeenCalledWith(
      'rep-1',
      expect.objectContaining({ buffer }),
      '1',
    );
  });

  it('removes photo through DELETE endpoint', async () => {
    await request(app.getHttpAdapter().getInstance())
      .delete(`${path}?slot=1`)
      .expect(200);
    expect(save).toHaveBeenCalledWith('rep-1', undefined, '1');
  });

  it('accepts exactly 2MB and rejects above 2MB before calling the service', async () => {
    const maximum = Buffer.alloc(2 * 1024 * 1024);
    await request(app.getHttpAdapter().getInstance())
      .post(path)
      .attach('file', maximum, 'photo.jpg')
      .expect(201);
    save.mockClear();

    const tooLarge = Buffer.alloc(2 * 1024 * 1024 + 2);
    await request(app.getHttpAdapter().getInstance())
      .post(path)
      .attach('file', tooLarge, 'photo.jpg')
      .expect(413);
    expect(save).not.toHaveBeenCalled();
  });
});
