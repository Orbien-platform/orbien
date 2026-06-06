import { Controller } from '@nestjs/common';
import { TransactionsService } from './transactions.service';

@Controller('financial/transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}
}
