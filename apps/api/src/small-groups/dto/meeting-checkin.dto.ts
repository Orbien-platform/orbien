import { IsNotEmpty, IsString } from 'class-validator';

export class MeetingCheckinDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}
