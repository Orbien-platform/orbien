import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateTransactionDto } from './create-transaction.dto';

// `status` fica de fora: depois do cadastro, o pago/não pago muda por
// `PATCH :id/status`, que tem a própria lista de papéis e a trava de
// lançamento confirmado.
export class UpdateTransactionDto extends PartialType(
  OmitType(CreateTransactionDto, ['status'] as const),
) {}
