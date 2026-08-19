export class RegisterTeacherDto {
  username!: string;
  password!: string;
  name?: string;
  email?: string;
  avatar?: string;
}

export class LoginTeacherDto {
  username!: string;
  password!: string;
}

export class LogoutTeacherDto {
  token!: string;
}
