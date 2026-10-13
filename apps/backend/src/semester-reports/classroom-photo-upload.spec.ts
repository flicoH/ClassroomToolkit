import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SemesterReportsController } from './semester-reports.controller';
import { SemesterReportsService } from './semester-reports.service';

describe('classroom photo multipart endpoint', () => {
  let app: INestApplication;
  const save = jest.fn(
    async (_id: string, file: { size: number; buffer: Buffer }) => ({
      bytes: file.size,
    }),
  );
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SemesterReportsController],
      providers: [
        {
          provide: SemesterReportsService,
          useValue: { setClassroomPhoto: save },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  beforeEach(() => save.mockClear());
  afterAll(async () => app.close());
  const path = '/semester-reports/reports/report/classroom-photo';
  it('receives the actual photo bytes through the named multipart field', async () => {
    const buffer = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    await request(app.getHttpServer())
      .post(path)
      .attach('file', buffer, {
        filename: 'photo.png',
        contentType: 'image/png',
      })
      .expect(201);
    expect(save).toHaveBeenCalledWith(
      'report',
      expect.objectContaining({
        buffer,
        mimetype: 'image/png',
        size: buffer.length,
      }),
    );
  });
  it('routes the second photo by slot and rejects multiple files in one slot upload', async () => {
    const buffer = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    await request(app.getHttpServer())
      .post(`${path}?slot=1`)
      .attach('file', buffer, 'second.png')
      .expect(201);
    expect(save).toHaveBeenCalledWith(
      'report',
      expect.objectContaining({ buffer }),
      '1',
    );
    save.mockClear();
    await request(app.getHttpServer())
      .post(path)
      .attach('file', buffer, 'one.png')
      .attach('file', buffer, 'two.png')
      .expect(400);
    expect(save).not.toHaveBeenCalled();
  });

  it('accepts exactly 2MB and rejects one byte above before calling the service', async () => {
    const maximum = Buffer.alloc(2 * 1024 * 1024);
    await request(app.getHttpServer())
      .post(path)
      .attach('file', maximum, 'photo.png')
      .expect(201);
    expect(save).toHaveBeenCalledWith(
      'report',
      expect.objectContaining({ size: maximum.length }),
    );
    save.mockClear();
    await request(app.getHttpServer())
      .post(path)
      .attach('file', Buffer.alloc(maximum.length + 1), 'photo.png')
      .expect(413);
    expect(save).not.toHaveBeenCalled();
  });
  it('rejects JSON requests without a binary file, and incorrectly named file fields', async () => {
    const missing = await request(app.getHttpServer())
      .post(path)
      .send({ file: 'not binary' })
      .expect(400);
    expect(missing.body.message).toBe('请选择课堂照片');
    await request(app.getHttpServer())
      .post(path)
      .attach('photo', Buffer.alloc(12), 'photo.png')
      .expect(400);
    expect(save).not.toHaveBeenCalled();
  });
});
