import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
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

  // --- Evento (PROD-16) ---
  //
  // Campos opcionais aqui, e não um DTO separado por tipo: `type` é um enum de
  // oito valores num modelo só, e quebrar o corpo por valor de enum obrigaria
  // a mesma escolha nos outros sete. Quem cobra a coerência entre `type` e
  // estes campos é o `PostsService` — ver `assertEventFields`.
  //
  // `registration_limit` tem `Min(1)`: zero não é "evento sem vaga", é erro de
  // digitação; quem não quer inscrição deixa `registration_enabled` falso.

  @IsOptional() @Type(() => Date) event_starts_at?: Date;

  @IsOptional() @Type(() => Date) event_ends_at?: Date;

  @IsOptional() @IsString() @MaxLength(300) event_location?: string;

  @IsOptional() @IsBoolean() registration_enabled?: boolean;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) registration_limit?: number;

  @IsOptional() @Type(() => Date) registration_deadline?: Date;
}
