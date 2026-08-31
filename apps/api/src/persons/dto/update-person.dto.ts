import { PartialType } from '@nestjs/mapped-types';
import { IsDateString, IsOptional } from 'class-validator';
import { CreatePersonDto } from './create-person.dto';

export class UpdatePersonDto extends PartialType(CreatePersonDto) {
  // Override: membership_date is always optional on PATCH because it may already
  // exist in the DB. The @ValidateIf from CreatePersonDto would incorrectly reject
  // requests that include classification:'member' but omit the date.
  @IsOptional()
  @IsDateString({}, { message: 'Data de membresia inválida' })
  override membership_date?: string;
}
