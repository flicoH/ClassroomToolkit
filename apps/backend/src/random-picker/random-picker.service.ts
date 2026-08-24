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

  findClasses() {
    return this.studentsService.findClassrooms();
  }

  async findHistories() {
    const histories = await this.database.findHistories();
    return histories.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

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
