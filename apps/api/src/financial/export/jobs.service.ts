import { Injectable, NotFoundException } from '@nestjs/common';
import { ExportJob, ExportJobType, JobStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tenantId: string,
    congregationId: string,
    type: ExportJobType,
    periodStart: Date,
    periodEnd: Date,
    createdBy: string,
  ): Promise<ExportJob> {
    return this.prisma.client.exportJob.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        type,
        status: JobStatus.pending,
        period_start: periodStart,
        period_end: periodEnd,
        created_by: createdBy,
      },
    });
  }

  async findOne(
    tenantId: string,
    congregationId: string,
    id: string,
  ): Promise<ExportJob> {
    const job = await this.prisma.client.exportJob.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
    });
    if (!job) throw new NotFoundException('Job de exportação não encontrado');
    return job;
  }

  /** Called from background — uses prisma.system (BYPASSRLS). */
  async markProcessing(jobId: string): Promise<void> {
    await this.prisma.system.exportJob.update({
      where: { id: jobId },
      data: { status: JobStatus.processing },
    });
  }

  async markDone(jobId: string, fileUrl: string): Promise<void> {
    await this.prisma.system.exportJob.update({
      where: { id: jobId },
      data: { status: JobStatus.done, file_url: fileUrl },
    });
  }

  async markError(jobId: string, errorMessage: string): Promise<void> {
    await this.prisma.system.exportJob.update({
      where: { id: jobId },
      data: { status: JobStatus.error, error_message: errorMessage },
    });
  }
}
