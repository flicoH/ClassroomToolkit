import { Injectable, NotFoundException } from '@nestjs/common';
import { createEntityId } from '../common/id';
import { PickStudentsDto } from './random-picker.dto';
import { RandomPickerDatabase } from './random-picker.database';
import { StudentsService } from '../students/students.service';

@Injectable()
export class RandomPickerService {
  constructor(
    private readonly database: RandomPickerDatabase,
    private readonly studentsService: StudentsService,
  ) {}

  /** 复用学生管理班级数据作为点名候选池。 */
  findClasses() {
    return this.studentsService.findClassrooms();
  }

  /** 查询点名历史，并按最新时间排序。 */
  async findHistories() {
    const histories = await this.database.findHistories();
    return histories.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** 按班级和抽取人数随机选出学生，并保存历史记录。 */
  async pick(dto: PickStudentsDto) {
    const classGroup = await this.studentsService.findClassroom(dto.classId);
    if (!classGroup) throw new NotFoundException('点名班级不存在');
    const selectedCount = Math.max(
      1,
      Math.min(dto.selectedCount, classGroup.students.length),
    );
    const students = this.shuffle(classGroup.students).slice(0, selectedCount);
    const history = {
      id: createEntityId('pick'),
      classId: dto.classId,
      className: classGroup.name,
      selectedCount,
      students,
      createdAt: new Date().toISOString(),
    };
    await this.database.saveHistory(history);
    return history;
  }

  /** Fisher-Yates 洗牌，保证随机结果均匀。 */
  private shuffle<T>(source: T[]) {
    const result = [...source];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [result[index], result[target]] = [result[target]!, result[index]!];
    }
    return result;
  }
}
