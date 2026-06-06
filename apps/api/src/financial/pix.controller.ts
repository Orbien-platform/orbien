import { Controller } from '@nestjs/common';
import { PixService } from './pix.service';

@Controller('financial/pix')
export class PixController {
  constructor(private readonly pixService: PixService) {}
}
