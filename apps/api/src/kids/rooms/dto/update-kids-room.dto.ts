import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';
import { CreateKidsRoomDto } from './create-kids-room.dto';

export class UpdateKidsRoomDto extends PartialType(OmitType(CreateKidsRoomDto, ['capacity'] as const)) {
  // Reativar uma turma desativada.
  @IsOptional() @IsBoolean() is_active?: boolean;

  // `null` remove o limite de capacidade; o decorator herdado só aceita número.
  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  capacity?: number | null;
}
