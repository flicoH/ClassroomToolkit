import { BadRequestException } from '@nestjs/common';
import { TeacherAuthService } from './teacher-auth.service';
import { Teacher, TeacherSession } from './teacher-auth.types';

describe('TeacherAuthService', () => {
  it('registers a teacher and creates a session token', async () => {
    const teachers = new Map<string, Teacher>();
    const sessions: TeacherSession[] = [];
    const database = {
      findTeacherByUsername: jest
        .fn()
        .mockImplementation(async (username) => teachers.get(username)),
      saveTeacher: jest.fn().mockImplementation(async (teacher) => {
        teachers.set(teacher.username, teacher);
        return teacher;
      }),
      saveSession: jest.fn().mockImplementation(async (session) => {
        sessions.push(session);
        return session;
      }),
    };
    const service = new TeacherAuthService(database as never);

    const result = await service.register({
      username: 'teacher1',
      password: 'secret1',
      name: '王老师',
      email: 'teacher1@example.com',
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^teacher-/),
        username: 'teacher1',
        name: '王老师',
        email: 'teacher1@example.com',
        token: expect.any(String),
      }),
    );
    expect(database.saveTeacher).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'teacher1',
        passwordHash: expect.any(String),
        passwordSalt: expect.any(String),
      }),
    );
    expect(sessions).toHaveLength(1);
  });

  it('rejects duplicated teacher usernames', async () => {
    const database = {
      findTeacherByUsername: jest
        .fn()
        .mockResolvedValue({ id: 'teacher-1', username: 'teacher1' }),
    };
    const service = new TeacherAuthService(database as never);

    await expect(
      service.register({ username: 'teacher1', password: 'secret1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
