/** 管理员登录请求；具体校验与密码验证由 Service 完成。 */
export class LoginAdminDto {
  username!: string;
  password!: string;
}
