import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CheckoutKidsCheckinDto {
  // Sem validar o formato de propósito: código errado, seja qual for o jeito
  // de errar, é a mesma recusa 403 (e o mesmo aviso ao líder) — não 400.
  // O código digitado OU o QR lido (R3-1): um dos dois, nunca os dois (400 no
  // service). O QR é só outro portador do mesmo código.
  @ValidateIf((o: CheckoutKidsCheckinDto) => o.qr === undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  code?: string;

  // QR da tela do código do responsável (`GET /kids/children/:id/checkin`).
  // Forjado, de outro check-in ou adulterado = mesma recusa de código errado.
  @ValidateIf((o: CheckoutKidsCheckinDto) => o.code === undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  qr?: string;

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
