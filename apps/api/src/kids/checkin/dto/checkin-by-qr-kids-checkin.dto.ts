import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** Check-in pela leitura do QR emitido pelo app do responsável (R3-1). */
export class CheckinByQrKidsCheckinDto {
  // Sem validar o formato: QR de formato errado é a mesma recusa 403 de
  // QR expirado, usado ou forjado — não 400.
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  qr!: string;

  @IsOptional()
  @IsBoolean()
  confirm_out_of_range?: boolean;
}
