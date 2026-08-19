import { Gender } from './students.types';

export class CreateClassroomDto {
  name!: string;
  groups?: string[];
}

export class CreateStudentDto {
  name!: string;
  studentNo?: string;
  gender?: Gender;
  group?: string;
}

export class UpdateStudentDto {
  name?: string;
  studentNo?: string;
  gender?: Gender;
  group?: string;
}

export class ImportStudentsDto {
  text!: string;
}

export class CreateGroupDto {
  name!: string;
}
