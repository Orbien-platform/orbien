import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class ListKidsRoomsQueryDto {
  // Tela de gestão pede as desativadas para poder reativá-las.
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  include_inactive?: boolean;
}
