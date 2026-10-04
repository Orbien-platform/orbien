import { IsIn, IsNumber, Max, Min } from 'class-validator';
import {
  DONOR_RECURRING_CONSENT_VERSION,
  DONOR_SUBSCRIPTION_MAX_AMOUNT,
  DONOR_SUBSCRIPTION_MIN_AMOUNT,
} from '../donor-pix-subscriptions.constants';

/**
 * Corpo de `POST /me/pix-subscriptions`. **Não tem `donor_person_id`, de
 * propósito**: o doador é sempre a pessoa da conta do token, resolvida no
 * banco. Com `forbidNonWhitelisted` (main.ts), mandar o campo é 400 — não é
 * ignorado em silêncio.
 */
export class CreateMyPixSubscriptionDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(DONOR_SUBSCRIPTION_MIN_AMOUNT)
  @Max(DONOR_SUBSCRIPTION_MAX_AMOUNT)
  amount!: number;

  /** O texto que a tela mostrou e a pessoa aceitou. Versão velha é 400. */
  @IsIn([DONOR_RECURRING_CONSENT_VERSION])
  consent_version!: string;
}
