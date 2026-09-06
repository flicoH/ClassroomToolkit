import { SetMetadata } from '@nestjs/common';
export const TRACK_FEATURE = 'trackFeature';
/** 给明确的成功操作挂载采集元数据；特殊模式用于排除计时轮询和合并便签自动保存。 */
export const TrackFeature = (
  feature: string,
  action: string,
  mode?: 'countdown' | 'note',
) => SetMetadata(TRACK_FEATURE, { feature, action, mode });
