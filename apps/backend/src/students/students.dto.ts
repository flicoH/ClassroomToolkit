import { Gender } from './students.types';

export class CreateClassroomDto {
  name!: string;
  groups?: string[];
}

export class UpdateClassroomDto {
  name?: string;
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

export class UpdateStudentGroupDto {
  group?: string | null;
}

export class ImportStudentsDto {
  text!: string;
}

export class CreateGroupDto {
  name!: string;
}
