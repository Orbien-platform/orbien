import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { UpdateTransactionStatusDto } from './dto/update-transaction-status.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';
import { RecurringRuleService, RecurringScope } from './recurring-rules/recurring-rule.service';

const READ_ROLES = ['admin_congregation', 'treasurer', 'tenant_admin'];
const WRITE_ROLES = ['admin_congregation', 'treasurer', 'secretary', 'tenant_admin'];
const STATUS_ROLES = ['treasurer', 'admin_congregation', 'tenant_admin'];

@Controller('financial/transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class TransactionsController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly recurringRuleService: RecurringRuleService,
  ) {}

  @Post()
  @Roles(...WRITE_ROLES)
  create(@Body() dto: CreateTransactionDto, @CurrentUser() user: JwtPayload) {
    return this.transactionsService.create(dto, user);
  }

  @Get()
  @Roles(...READ_ROLES)
  findAll(@Query() query: ListTransactionsQueryDto, @CurrentUser() user: JwtPayload) {
    return this.transactionsService.findAll(query, user);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.transactionsService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(...READ_ROLES)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransactionDto,
    @Query('scope') scope: RecurringScope | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    if (scope) return this.recurringRuleService.updateTransaction(id, dto, scope, user);
    return this.transactionsService.update(id, dto, user);
  }

  @Patch(':id/status')
  @Roles(...STATUS_ROLES)
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransactionStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.transactionsService.updateStatus(id, dto, user);
  }

  @Delete(':id')
  @Roles('admin_congregation', 'tenant_admin')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('scope') scope: RecurringScope | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    if (scope) return this.recurringRuleService.deleteTransaction(id, scope, user);
    return this.transactionsService.remove(id, user);
  }
}
