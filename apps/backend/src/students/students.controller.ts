import { TrackFeature } from '../analytics/track-feature';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CreateClassroomDto,
  CreateGroupDto,
  CreateStudentDto,
  ImportStudentsDto,
  UpdateClassroomDto,
  UpdateStudentGroupDto,
  UpdateStudentDto,
} from './students.dto';
import { StudentsService } from './students.service';

@Controller('classes')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  /** 获取当前教师的全部班级列表。 */
  @Get()
  findClassrooms() {
    return this.studentsService.findClassrooms();
  }

  /** 获取单个班级，并按分组、关键词和排序条件过滤学生。 */
  @Get(':classroomId')
  findClassroom(
    @Param('classroomId') classroomId: string,
    @Query('group') group?: string,
    @Query('query') query?: string,
    @Query('sort') sort?: string,
  ) {
    return this.studentsService.findClassroom(classroomId, {
      group,
      query,
      sort,
    });
  }

  /** 创建新班级，并记录学生管理功能使用。 */
  @Post()
  @TrackFeature('students', 'classroom')
  createClassroom(@Body() dto: CreateClassroomDto) {
    return this.studentsService.createClassroom(dto);
  }

  /** 更新班级基础信息。 */
  @Patch(':classroomId')
  updateClassroom(
    @Param('classroomId') classroomId: string,
    @Body() dto: UpdateClassroomDto,
  ) {
    return this.studentsService.updateClassroom(classroomId, dto);
  }

  /** 批量导入学生文本数据，并返回成功和跳过明细。 */
  @Post(':classroomId/students/import')
  @TrackFeature('students', 'import')
  importStudents(
    @Param('classroomId') classroomId: string,
    @Body() dto: ImportStudentsDto,
  ) {
    return this.studentsService.importStudents(classroomId, dto);
  }

  /** 向指定班级新增学生。 */
  @Post(':classroomId/students')
  @TrackFeature('students', 'create')
  addStudent(
    @Param('classroomId') classroomId: string,
    @Body() dto: CreateStudentDto,
  ) {
    return this.studentsService.addStudent(classroomId, dto);
  }

  /** 更新学生所在分组。 */
  @Patch(':classroomId/students/:studentId/group')
  @TrackFeature('students', 'group')
  updateStudentGroup(
    @Param('classroomId') classroomId: string,
    @Param('studentId') studentId: string,
    @Body() dto: UpdateStudentGroupDto,
  ) {
    return this.studentsService.updateStudentGroup(classroomId, studentId, dto);
  }

  /** 通过路径参数删除分组，并清空学生上的对应分组。 */
  @Delete(':classroomId/groups/:groupName')
  deleteGroup(
    @Param('classroomId') classroomId: string,
    @Param('groupName') groupName: string,
  ) {
    return this.studentsService.deleteGroup(classroomId, groupName);
  }

  /** 兼容查询参数传入分组名的删除方式。 */
  @Delete(':classroomId/groups')
  deleteGroupByName(
    @Param('classroomId') classroomId: string,
    @Query('name') groupName = '',
  ) {
    return this.studentsService.deleteGroup(classroomId, groupName);
  }

  /** 添加班级分组。 */
  @Post(':classroomId/groups')
  addGroup(
    @Param('classroomId') classroomId: string,
    @Body() dto: CreateGroupDto,
  ) {
    return this.studentsService.addGroup(classroomId, dto);
  }

  /** 更新学生姓名、学号、性别等基础信息。 */
  @Patch(':classroomId/students/:studentId')
  @TrackFeature('students', 'update')
  updateStudent(
    @Param('classroomId') classroomId: string,
    @Param('studentId') studentId: string,
    @Body() dto: UpdateStudentDto,
  ) {
    return this.studentsService.updateStudent(classroomId, studentId, dto);
  }

  /** 删除指定学生。 */
  @Delete(':classroomId/students/:studentId')
  deleteStudent(
    @Param('classroomId') classroomId: string,
    @Param('studentId') studentId: string,
  ) {
    return this.studentsService.deleteStudent(classroomId, studentId);
  }
}
