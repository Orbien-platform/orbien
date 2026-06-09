import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ContentPostType } from '@prisma/client';

export class CreatePostDto {
  @IsEnum(ContentPostType) type!: ContentPostType;

  @IsString() @IsNotEmpty() title!: string;

  @IsOptional() @IsString() body?: string;

  @IsOptional() @IsString() media_url?: string;

  @IsOptional() @Type(() => Date) publish_at?: Date;

  @IsOptional() @IsBoolean() is_draft?: boolean = true;

  @IsOptional() @IsArray() @IsUUID('4', { each: true }) segment_ids?: string[];
}
