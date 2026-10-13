export interface Teacher {
  id: string;
  username: string;
  name: string;
  email: string;
  avatar: string;
  sessionVersion?: number;
  parentAccountId?: string | null;
  status?: 'active' | 'locked' | 'deleted';
  passwordHash: string;
  passwordSalt: string;
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
  accountType?: 'main' | 'sub';
  ownerAccountId?: string;
  capabilities?: { accountManagement: boolean; reportConfiguration: boolean };
  id: string;
  username: string;
  name: string;
  email: string;
  avatar: string;
}
