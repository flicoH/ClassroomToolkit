export interface Teacher {
  id: string;
  username: string;
  name: string;
  email: string;
  avatar: string;
  passwordHash: string;
  passwordSalt: string;
  status: 'active' | 'locked';
  lockedAt?: string | null;
  createdAt: string;
}

export interface TeacherSession {
  id: string;
  teacherId: string;
  token: string;
  createdAt: string;
  expiresAt: string;
}

export interface TeacherProfile {
  id: string;
  username: string;
  name: string;
  email: string;
  avatar: string;
  status: 'active' | 'locked';
}
