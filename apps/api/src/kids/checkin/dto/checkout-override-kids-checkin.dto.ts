import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CheckoutOverrideKidsCheckinDto {
  // Retirada por exceção (AC 8): o motivo é obrigatório e fica gravado.
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  picked_up_by_name!: string;
}
