import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Revogação de consentimento pelo titular (Art. 18, IX — mapeamento §4.5). */
export class RevokeConsentDto {
  /** Versão do termo, ex.: `visitor_consent_v1`. Revoga todo aceite ativo
   * dessa versão. */
  @IsString()
  @IsNotEmpty({ message: 'Informe a versão do termo' })
  @MaxLength(100)
  version!: string;
}
