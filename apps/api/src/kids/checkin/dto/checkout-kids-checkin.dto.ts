import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CheckoutKidsCheckinDto {
  // Sem validar o formato de propósito: código errado, seja qual for o jeito
  // de errar, é a mesma recusa 403 (e o mesmo aviso ao líder) — não 400.
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  code!: string;

  // Quem retira: um KidsGuardian com can_pickup (por id) ou, para terceiro
  // cadastrado, pelo nome. Pelo menos um dos dois.
  @IsOptional()
  @IsUUID()
  picked_up_by_person_id?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  picked_up_by_name?: string;
}
