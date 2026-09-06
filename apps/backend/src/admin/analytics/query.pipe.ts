import { AdminQueryDto } from '../admin.dto';
import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
@Injectable()
export class AdminQueryPipe implements PipeTransform {
  /** 拒绝重复参数产生的数组、嵌套对象及过长输入，确保查询层拿到单个字符串。 */
  transform(value: unknown): AdminQueryDto {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new BadRequestException('无效的查询参数');
    for (const entry of Object.values(value))
      if (typeof entry !== 'string' || entry.length > 200)
        throw new BadRequestException(
          '查询参数必须是长度不超过 200 的单个字符串',
        );
    return value as AdminQueryDto;
  }
}
