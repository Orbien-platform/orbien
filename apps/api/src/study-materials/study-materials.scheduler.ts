import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StudyMaterialsService } from './study-materials.service';

@Injectable()
export class StudyMaterialsScheduler {
  private readonly logger = new Logger(StudyMaterialsScheduler.name);

  constructor(private readonly service: StudyMaterialsService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async publishPending() {
    this.logger.debug('Checking pending study materials...');
    await this.service.publishPending();
  }
}
