/**
 * `archiver` é ESM-only; importar `ZipExportService` (mesmo só para tipar o
 * mock) alcança o `import { ZipArchive } from 'archiver'` no topo do arquivo
 * e quebra o require do Jest (projeto `unit`, CommonJS). Mesma solução de
 * `zip-export.service.spec.ts`.
 */
jest.mock('archiver', () => ({ ZipArchive: class {}, default: class {} }), { virtual: true });

import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { PdfExportService } from './pdf-export.service';
import { ZipExportService } from './zip-export.service';
import { SpedExportService } from './sped-export.service';
import { JobsService } from './jobs.service';
import { StorageService } from '../../storage/storage.service';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

const EXPORT_ROLES = ['tesoureiro', 'admin_congregation', 'tenant_admin'];

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['tesoureiro'],
  plan: 'starter',
};

function rolesFor(methodName: keyof ExportController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(ROLES_KEY, ExportController.prototype[methodName]);
}

function mockRes() {
  return { set: jest.fn() };
}

describe('ExportController', () => {
  let exportService: jest.Mocked<ExportService>;
  let pdfExportService: jest.Mocked<PdfExportService>;
  let zipExportService: jest.Mocked<ZipExportService>;
  let spedExportService: jest.Mocked<SpedExportService>;
  let jobsService: jest.Mocked<JobsService>;
  let storageService: jest.Mocked<StorageService>;
  let controller: ExportController;

  beforeEach(() => {
    exportService = { exportCsv: jest.fn(), exportOfx: jest.fn() } as unknown as jest.Mocked<ExportService>;
    pdfExportService = { exportPdf: jest.fn() } as unknown as jest.Mocked<PdfExportService>;
    zipExportService = { exportZip: jest.fn() } as unknown as jest.Mocked<ZipExportService>;
    spedExportService = { exportSped: jest.fn() } as unknown as jest.Mocked<SpedExportService>;
    jobsService = { findOne: jest.fn() } as unknown as jest.Mocked<JobsService>;
    storageService = { getPresignedGetUrl: jest.fn() } as unknown as jest.Mocked<StorageService>;

    controller = new ExportController(
      exportService,
      pdfExportService,
      zipExportService,
      spedExportService,
      jobsService,
      storageService,
    );
  });

  describe('exportCsv', () => {
    it('devolve StreamableFile quando o resultado é síncrono', async () => {
      exportService.exportCsv.mockResolvedValue({
        type: 'file',
        buffer: Buffer.from('csv'),
        filename: 'x.csv',
        mimeType: 'text/csv',
      });
      const res = mockRes();

      const result = await controller.exportCsv({} as never, user, res as never);

      expect(exportService.exportCsv).toHaveBeenCalledWith('tenant-1', 'cong-1', {}, 'user-1');
      expect(res.set).toHaveBeenCalledWith({
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="x.csv"',
      });
      expect((result as import("@nestjs/common").StreamableFile).getStream).toBeDefined();
    });

    it('devolve job_id/status quando o resultado é assíncrono', async () => {
      exportService.exportCsv.mockResolvedValue({ type: 'job', job_id: 'j1', status: 'pending' });
      const res = mockRes();

      const result = await controller.exportCsv({} as never, user, res as never);

      expect(result).toEqual({ job_id: 'j1', status: 'pending' });
      expect(res.set).not.toHaveBeenCalled();
    });

    it('exige papel de exportação financeira', () => {
      expect(rolesFor('exportCsv')).toEqual(EXPORT_ROLES);
    });
  });

  describe('exportOfx', () => {
    it('devolve StreamableFile quando o resultado é síncrono', async () => {
      exportService.exportOfx.mockResolvedValue({
        type: 'file',
        buffer: Buffer.from('ofx'),
        filename: 'x.ofx',
        mimeType: 'application/x-ofx',
      });
      const res = mockRes();

      const result = await controller.exportOfx({} as never, user, res as never);

      expect(res.set).toHaveBeenCalledWith({
        'Content-Type': 'application/x-ofx',
        'Content-Disposition': 'attachment; filename="x.ofx"',
      });
      expect((result as import("@nestjs/common").StreamableFile).getStream).toBeDefined();
    });

    it('devolve job_id/status quando o resultado é assíncrono', async () => {
      exportService.exportOfx.mockResolvedValue({ type: 'job', job_id: 'j2', status: 'pending' });
      const res = mockRes();

      const result = await controller.exportOfx({} as never, user, res as never);

      expect(result).toEqual({ job_id: 'j2', status: 'pending' });
    });

    it('exige papel de exportação financeira', () => {
      expect(rolesFor('exportOfx')).toEqual(EXPORT_ROLES);
    });
  });

  describe('exportPdf', () => {
    it('devolve StreamableFile quando o resultado é síncrono', async () => {
      pdfExportService.exportPdf.mockResolvedValue({
        type: 'file',
        buffer: Buffer.from('pdf'),
        filename: 'x.pdf',
        mimeType: 'application/pdf',
      });
      const res = mockRes();

      const result = await controller.exportPdf({} as never, user, res as never);

      expect(res.set).toHaveBeenCalledWith({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="x.pdf"',
      });
      expect((result as import("@nestjs/common").StreamableFile).getStream).toBeDefined();
    });

    it('devolve job_id/status quando o resultado é assíncrono', async () => {
      pdfExportService.exportPdf.mockResolvedValue({ type: 'job', job_id: 'j3', status: 'pending' });
      const res = mockRes();

      const result = await controller.exportPdf({} as never, user, res as never);

      expect(result).toEqual({ job_id: 'j3', status: 'pending' });
    });

    it('exige papel de exportação financeira', () => {
      expect(rolesFor('exportPdf')).toEqual(EXPORT_ROLES);
    });
  });

  it('exportZip delega ao service e exige papel de exportação financeira', async () => {
    zipExportService.exportZip.mockResolvedValue({ type: 'job', job_id: 'j4', status: 'pending' });

    const result = await controller.exportZip({} as never, user);

    expect(zipExportService.exportZip).toHaveBeenCalledWith('tenant-1', 'cong-1', {}, 'user-1');
    expect(result).toEqual({ job_id: 'j4', status: 'pending' });
    expect(rolesFor('exportZip')).toEqual(EXPORT_ROLES);
  });

  it('exportSped delega ao service e exige papel de exportação financeira', async () => {
    spedExportService.exportSped.mockResolvedValue({ type: 'job', job_id: 'j5', status: 'pending' });

    const result = await controller.exportSped({} as never, user);

    expect(spedExportService.exportSped).toHaveBeenCalledWith('tenant-1', 'cong-1', {}, 'user-1');
    expect(result).toEqual({ job_id: 'j5', status: 'pending' });
    expect(rolesFor('exportSped')).toEqual(EXPORT_ROLES);
  });

  it('findJob delega ao JobsService e exige papel de exportação financeira', async () => {
    jobsService.findOne.mockResolvedValue({ id: 'j1', status: 'done' } as never);

    const result = await controller.findJob('j1', user);

    expect(jobsService.findOne).toHaveBeenCalledWith('tenant-1', 'cong-1', 'j1');
    expect(result).toEqual({ id: 'j1', status: 'done' });
    expect(rolesFor('findJob')).toEqual(EXPORT_ROLES);
  });

  describe('downloadJob', () => {
    it('rejeita quando o job ainda não terminou', async () => {
      jobsService.findOne.mockResolvedValue({ id: 'j1', status: 'processing', type: 'csv' } as never);

      await expect(controller.downloadJob('j1', user)).rejects.toThrow(BadRequestException);
    });

    it.each([
      ['csv', 'csv'],
      ['ofx', 'ofx'],
      ['pdf', 'pdf'],
      ['zip', 'zip'],
      ['sped', 'txt'],
      ['dre', 'pdf'],
    ])('devolve a URL assinada com a extensão correta para %s', async (type, ext) => {
      jobsService.findOne.mockResolvedValue({ id: 'j1', status: 'done', type } as never);
      storageService.getPresignedGetUrl.mockResolvedValue('https://cdn/x');

      const result = await controller.downloadJob('j1', user);

      expect(storageService.getPresignedGetUrl).toHaveBeenCalledWith(
        `exports/tenant-1/j1.${ext}`,
        3600,
      );
      expect(result).toEqual({ download_url: 'https://cdn/x', expires_in: 3600 });
    });

    it('usa extensão .bin para um tipo de job desconhecido', async () => {
      jobsService.findOne.mockResolvedValue({ id: 'j1', status: 'done', type: 'inexistente' } as never);
      storageService.getPresignedGetUrl.mockResolvedValue('https://cdn/x');

      await controller.downloadJob('j1', user);

      expect(storageService.getPresignedGetUrl).toHaveBeenCalledWith('exports/tenant-1/j1.bin', 3600);
    });

    it('exige papel de exportação financeira', () => {
      expect(rolesFor('downloadJob')).toEqual(EXPORT_ROLES);
    });
  });
});
