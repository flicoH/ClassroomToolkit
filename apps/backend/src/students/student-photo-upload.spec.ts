import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import sharp from 'sharp';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { StudentsDatabase } from './students.database';
import { studentPhotoMaxBytes } from './student-photo';

describe('student photo multipart endpoint', () => {
  let app: INestApplication;
  const database = {
    findClassroom: jest.fn(async (id) =>
      id === 'class' ? { id, students: [{ id: 'class:one' }] } : undefined,
    ),
    setStudentPhoto: jest.fn(async (_classId, id, photo) => ({ id, photo })),
  };
  let valid: Buffer;
  const path = '/classes/class/students/class:one/photo';
  beforeAll(async () => {
    valid = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#336699' },
    })
      .png()
      .toBuffer();
    const module = await Test.createTestingModule({
      controllers: [StudentsController],
      providers: [
        StudentsService,
        { provide: StudentsDatabase, useValue: database },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  beforeEach(() => database.setStudentPhoto.mockClear());
  afterAll(async () => app.close());
  it('accepts exactly 256KB, stores decoded bytes and deletes only the named student photo', async () => {
    const maximum = Buffer.alloc(studentPhotoMaxBytes);
    valid.copy(maximum);
    const result = await request(app.getHttpServer())
      .post(path)
      .attach('file', maximum, 'portrait.png')
      .expect(201);
    expect(result.body.photo).toMatch(/^data:image\/jpeg;base64,/);
    expect(database.setStudentPhoto).toHaveBeenCalledWith(
      'class',
      'class:one',
      result.body.photo,
    );
    await request(app.getHttpServer()).delete(path).expect(200);
    expect(database.setStudentPhoto).toHaveBeenLastCalledWith(
      'class',
      'class:one',
      null,
    );
  });
  it('rejects oversize, missing/wrong fields, multiple files and invalid image content before saving', async () => {
    await request(app.getHttpServer())
      .post(path)
      .attach('file', Buffer.alloc(studentPhotoMaxBytes + 1), 'portrait.png')
      .expect(413);
    await request(app.getHttpServer())
      .post(path)
      .send({ file: 'not binary' })
      .expect(400);
    await request(app.getHttpServer())
      .post(path)
      .attach('photo', valid, 'portrait.png')
      .expect(400);
    await request(app.getHttpServer())
      .post(path)
      .attach('file', valid, 'one.png')
      .attach('file', valid, 'two.png')
      .expect(400);
    await request(app.getHttpServer())
      .post(path)
      .attach('file', Buffer.from('invalid PNG'), 'portrait.png')
      .expect(400);
    expect(database.setStudentPhoto).not.toHaveBeenCalled();
  });
  it('rejects an invisible classroom or missing student for both upload and removal', async () => {
    for (const target of [
      '/classes/foreign/students/class:one/photo',
      '/classes/class/students/missing/photo',
    ]) {
      await request(app.getHttpServer())
        .post(target)
        .attach('file', valid, 'portrait.png')
        .expect(404);
      await request(app.getHttpServer()).delete(target).expect(404);
    }
    expect(database.setStudentPhoto).not.toHaveBeenCalled();
  });
});
