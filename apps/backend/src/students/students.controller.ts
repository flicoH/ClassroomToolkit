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

  @Get()
  findClassrooms() {
    return this.studentsService.findClassrooms();
  }

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

  @Post()
  createClassroom(@Body() dto: CreateClassroomDto) {
    return this.studentsService.createClassroom(dto);
  }

  @Patch(':classroomId')
  updateClassroom(
    @Param('classroomId') classroomId: string,
    @Body() dto: UpdateClassroomDto,
  ) {
    return this.studentsService.updateClassroom(classroomId, dto);
  }

  @Post(':classroomId/students')
  addStudent(
    @Param('classroomId') classroomId: string,
    @Body() dto: CreateStudentDto,
  ) {
    return this.studentsService.addStudent(classroomId, dto);
  }

  @Patch(':classroomId/students/:studentId')
  updateStudent(
    @Param('classroomId') classroomId: string,
    @Param('studentId') studentId: string,
    @Body() dto: UpdateStudentDto,
  ) {
    return this.studentsService.updateStudent(classroomId, studentId, dto);
  }

  @Delete(':classroomId/students/:studentId')
  deleteStudent(
    @Param('classroomId') classroomId: string,
    @Param('studentId') studentId: string,
  ) {
    return this.studentsService.deleteStudent(classroomId, studentId);
  }

  @Post(':classroomId/students/import')
  importStudents(
    @Param('classroomId') classroomId: string,
    @Body() dto: ImportStudentsDto,
  ) {
    return this.studentsService.importStudents(classroomId, dto);
  }

  @Post(':classroomId/groups')
  addGroup(
    @Param('classroomId') classroomId: string,
    @Body() dto: CreateGroupDto,
  ) {
    return this.studentsService.addGroup(classroomId, dto);
  }

  @Patch(':classroomId/students/:studentId/group')
  updateStudentGroup(
    @Param('classroomId') classroomId: string,
    @Param('studentId') studentId: string,
    @Body() dto: UpdateStudentGroupDto,
  ) {
    return this.studentsService.updateStudentGroup(classroomId, studentId, dto);
  }

  @Delete(':classroomId/groups/:groupName')
  deleteGroup(
    @Param('classroomId') classroomId: string,
    @Param('groupName') groupName: string,
  ) {
    return this.studentsService.deleteGroup(classroomId, groupName);
  }
}
