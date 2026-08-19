/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 *  其他任何个人、公司不得使用、复制、传播、修改或商业使用。
 * **********************************************************************************************
 * @Date: 2026-04-18 23:59:45
 * @LastEditors: flicoH
 * @LastEditTime: 2026-04-19 00:01:31
 */
/** 登录用户的最小资料结构，供认证 store、cookie 和页面展示共用。 */
export interface User {
  id: string;
  username?: string;
  name: string;
  email: string;
  avatar?: string;
}
