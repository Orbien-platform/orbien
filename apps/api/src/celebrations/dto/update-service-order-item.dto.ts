import { PartialType } from '@nestjs/mapped-types';
import { CreateServiceOrderItemDto } from './create-service-order-item.dto';

export class UpdateServiceOrderItemDto extends PartialType(CreateServiceOrderItemDto) {}
