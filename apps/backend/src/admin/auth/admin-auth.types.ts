export interface AdminProfile {
  id: string;
  username: string;
}
/** 仅供后端验证使用，不直接返回给客户端。 */
export interface AdminAccount extends AdminProfile {
  passwordHash: string;
  salt: string;
}
export interface AdminLoginResult {
  token: string;
  profile: AdminProfile;
}
