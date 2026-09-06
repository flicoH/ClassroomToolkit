import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  /** 默认健康检查响应。 */
  getHello(): string {
    return 'Hello World!';
  }
}
