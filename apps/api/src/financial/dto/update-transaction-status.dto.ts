import { IsIn } from 'class-validator';

export class UpdateTransactionStatusDto {
  @IsIn(['pending', 'paid'], { message: 'status deve ser pending ou paid' })
  status!: 'pending' | 'paid';
}
