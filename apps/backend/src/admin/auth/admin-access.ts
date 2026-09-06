import { SetMetadata } from '@nestjs/common';
export const ADMIN_ACCESS = 'adminAccess';
/** 路由身份域标记：教师守卫跳过此域，管理员守卫负责实际鉴权，并非开放访问。 */
export const AdminAccess = () => SetMetadata(ADMIN_ACCESS, true);
