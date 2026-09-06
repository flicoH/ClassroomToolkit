/** 客户端仅允许上报功能打开；Service 校验白名单，教师 ID 从登录上下文取得。 */
export class RecordFeatureOpenDto {
  feature!: string;
  kind!: string;
  eventId!: string;
}
