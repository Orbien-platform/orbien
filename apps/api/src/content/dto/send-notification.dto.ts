import { IsArray, IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class SendNotificationDto {
  @IsString() @IsNotEmpty() title!: string;

  @IsString() @IsNotEmpty() body!: string;

  @IsArray() @IsUUID('4', { each: true }) segment_ids!: string[];
}
