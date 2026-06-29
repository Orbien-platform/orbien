import { IsHexColor, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateGroupTypeDto {
  @IsString() @IsNotEmpty() name!: string;

  @IsOptional() @IsHexColor() color?: string;
}
