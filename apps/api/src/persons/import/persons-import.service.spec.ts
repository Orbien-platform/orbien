import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import { PersonsImportService } from './persons-import.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ImportConfirmDto } from '../dto/import-confirm.dto';

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['secretary'],
  plan: 'starter',
};

function fileOf(content: string, name = 'pessoas.csv'): Express.Multer.File {
  return {
    originalname: name,
    buffer: Buffer.from(content, 'utf-8'),
    size: Buffer.byteLength(content, 'utf-8'),
    mimetype: 'text/csv',
  } as Express.Multer.File;
}

function serviceWith() {
  const personClient = {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn(async ({ data }: { data: { full_name: string } }) => ({
      id: `person-${data.full_name}`,
    })),
  };
  const consentRecordClient = { create: jest.fn().mockResolvedValue({}) };
  const auditLogClient = { create: jest.fn().mockResolvedValue({}) };
  const importJobClient = {
    create: jest.fn().mockResolvedValue({ id: 'job-1' }),
    findFirst: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  };

  const client = {
    person: personClient,
    consentRecord: consentRecordClient,
    auditLog: auditLogClient,
    importJob: importJobClient,
  };
  const system = {
    person: personClient,
    consentRecord: consentRecordClient,
    importJob: { ...importJobClient, update: jest.fn().mockResolvedValue({}) },
  };

  const prisma = { client, system } as unknown as PrismaService;
  const storage = {
    upload: jest.fn().mockResolvedValue('https://cdn.test/file'),
    downloadBuffer: jest.fn(),
  } as unknown as jest.Mocked<StorageService>;

  return { service: new PersonsImportService(prisma, storage), storage, client, system };
}

const VALID_CSV = [
  'nome,telefone,email,sexo,nascimento,classificação',
  'Ana Silva,(11) 98765-4321,ana@test.com,F,15/01/1990,membro',
].join('\n');

const MAPPING: ImportConfirmDto['mapping'] = {
  nome: 'nome',
  telefone: 'telefone',
  email: 'email',
  sexo: 'sexo',
  birth_date: 'nascimento',
  classificação: 'classificação',
};

describe('PersonsImportService', () => {
  describe('preview', () => {
    it('rejeita extensão não suportada', async () => {
      const { service } = serviceWith();
      await expect(service.preview(fileOf(VALID_CSV, 'pessoas.pdf'), 'tenant-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejeita arquivo maior que 10 MB', async () => {
      const { service } = serviceWith();
      const file = fileOf(VALID_CSV);
      Object.assign(file, { size: 11 * 1024 * 1024 });
      await expect(service.preview(file, 'tenant-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita arquivo vazio (só cabeçalho, sem linhas)', async () => {
      const { service } = serviceWith();
      const emptyCsv = 'nome,telefone,email,sexo,nascimento,classificação\n';
      await expect(service.preview(fileOf(emptyCsv), 'tenant-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lê colunas, sugere mapeamento e sobe o arquivo temporário', async () => {
      const { service, storage } = serviceWith();

      const result = await service.preview(fileOf(VALID_CSV), 'tenant-1');

      expect(result.total_rows).toBe(1);
      expect(result.detected_columns).toEqual([
        'nome',
        'telefone',
        'email',
        'sexo',
        'nascimento',
        'classificação',
      ]);
      expect(result.suggested_mapping).toEqual({
        nome: 'nome',
        telefone: 'telefone',
        email: 'email',
        sexo: 'sexo',
        birth_date: 'nascimento',
        classificação: 'classificação',
      });
      expect(result.preview_rows).toHaveLength(1);
      expect(result.file_id).toMatch(/\.csv$/);
      expect(storage.upload).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.stringContaining('imports/temp/tenant-1/'),
        'text/csv',
      );
    });

    it('normaliza cabeçalho com acentuação/encoding (Classificação → classificação)', async () => {
      const { service } = serviceWith();
      const csv = ['Nome,Telefone,E-mail,Gênero,Data Nascimento,Classificação', 'Bia,11999998888,,F,,'].join(
        '\n',
      );

      const result = await service.preview(fileOf(csv), 'tenant-1');

      expect(result.suggested_mapping).toEqual(
        expect.objectContaining({
          nome: 'Nome',
          telefone: 'Telefone',
          email: 'E-mail',
          sexo: 'Gênero',
          classificação: 'Classificação',
        }),
      );
    });
  });

  describe('confirm', () => {
    it('rejeita file_id com extensão inválida', async () => {
      const { service } = serviceWith();
      await expect(
        service.confirm({ file_id: 'arquivo.exe', mapping: MAPPING }, user),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lança NotFoundException quando o arquivo temporário não existe/expirou', async () => {
      const { service, storage } = serviceWith();
      storage.downloadBuffer.mockRejectedValue(new Error('not found'));

      await expect(
        service.confirm({ file_id: 'arquivo.csv', mapping: MAPPING }, user),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejeita arquivo sem linhas de dados', async () => {
      const { service, storage } = serviceWith();
      storage.downloadBuffer.mockResolvedValue(
        Buffer.from('nome,telefone,email,sexo,nascimento,classificação\n', 'utf-8'),
      );

      await expect(
        service.confirm({ file_id: 'arquivo.csv', mapping: MAPPING }, user),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('importa pessoa válida de forma síncrona (≤500 linhas) e grava consentimento', async () => {
      const { service, storage, client } = serviceWith();
      storage.downloadBuffer.mockResolvedValue(Buffer.from(VALID_CSV, 'utf-8'));

      const result = await service.confirm({ file_id: 'arquivo.csv', mapping: MAPPING }, user);

      expect(result).toEqual({ imported: 1, skipped: 0, errors: [] });
      expect(client.person.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: 'tenant-1',
          congregation_id: 'cong-1',
          full_name: 'Ana Silva',
          phone: '+5511987654321',
          email: 'ana@test.com',
          gender: 'female',
          classification: 'member',
        }),
        select: { id: true },
      });
      expect(client.consentRecord.create).toHaveBeenCalled();
    });

    it('reporta linha com coluna de nome faltando', async () => {
      const { service, storage } = serviceWith();
      const csv = ['nome,telefone', ',11999998888'].join('\n');
      storage.downloadBuffer.mockResolvedValue(Buffer.from(csv, 'utf-8'));

      const result = await service.confirm(
        { file_id: 'arquivo.csv', mapping: { nome: 'nome', telefone: 'telefone' } },
        user,
      );

      expect(result.imported).toBe(0);
      expect(result.errors).toEqual([{ row: 2, reason: 'missing_name' }]);
    });

    it('reporta linha sem telefone e sem email (telefone inválido/ausente)', async () => {
      const { service, storage } = serviceWith();
      const csv = ['nome,telefone', 'Sem Contato,'].join('\n');
      storage.downloadBuffer.mockResolvedValue(Buffer.from(csv, 'utf-8'));

      const result = await service.confirm(
        { file_id: 'arquivo.csv', mapping: { nome: 'nome', telefone: 'telefone' } },
        user,
      );

      expect(result.errors).toEqual([{ row: 2, reason: 'missing_phone_and_email' }]);
    });

    it('pula linha duplicada (telefone já cadastrado no tenant)', async () => {
      const { service, storage, client } = serviceWith();
      client.person.findFirst.mockResolvedValue({ id: 'existing' });
      storage.downloadBuffer.mockResolvedValue(Buffer.from(VALID_CSV, 'utf-8'));

      const result = await service.confirm({ file_id: 'arquivo.csv', mapping: MAPPING }, user);

      expect(result).toEqual({ imported: 0, skipped: 1, errors: [] });
      expect(client.person.create).not.toHaveBeenCalled();
    });

    it('registra erro da linha sem interromper as demais quando a criação falha', async () => {
      const { service, storage, client } = serviceWith();
      const csv = [
        'nome,telefone',
        'Falha Aqui,11911112222',
        'Sucesso Aqui,11933334444',
      ].join('\n');
      storage.downloadBuffer.mockResolvedValue(Buffer.from(csv, 'utf-8'));
      client.person.create
        .mockRejectedValueOnce(new Error('violação de constraint'))
        .mockResolvedValueOnce({ id: 'ok' });

      const result = await service.confirm(
        { file_id: 'arquivo.csv', mapping: { nome: 'nome', telefone: 'telefone' } },
        user,
      );

      expect(result.imported).toBe(1);
      expect(result.errors).toEqual([{ row: 2, reason: 'violação de constraint' }]);
    });

    it('aceita data no formato BR (DD/MM/YYYY)', async () => {
      const { service, storage, client } = serviceWith();
      storage.downloadBuffer.mockResolvedValue(Buffer.from(VALID_CSV, 'utf-8'));

      await service.confirm({ file_id: 'arquivo.csv', mapping: MAPPING }, user);

      const call = client.person.create.mock.calls[0][0] as { data: { birth_date?: Date } };
      expect(call.data.birth_date).toBeInstanceOf(Date);
      expect(call.data.birth_date!.getUTCFullYear()).toBe(1990);
    });

    it('classificação desconhecida cai no default visitor', async () => {
      const { service, storage, client } = serviceWith();
      const csv = ['nome,telefone,classificação', 'Ana,11999998888,????'].join('\n');
      storage.downloadBuffer.mockResolvedValue(Buffer.from(csv, 'utf-8'));

      await service.confirm(
        { file_id: 'arquivo.csv', mapping: { nome: 'nome', telefone: 'telefone', classificação: 'classificação' } },
        user,
      );

      const call = client.person.create.mock.calls[0][0] as { data: { classification?: string } };
      expect(call.data.classification).toBe('visitor');
    });

    it('processa arquivo grande (>500 linhas) de forma assíncrona, criando um job', async () => {
      const { service, storage, client, system } = serviceWith();
      const rows = ['nome,telefone'];
      for (let i = 0; i < 501; i++) rows.push(`Pessoa ${i},1199999${String(i).padStart(4, '0')}`);
      storage.downloadBuffer.mockResolvedValue(Buffer.from(rows.join('\n'), 'utf-8'));

      const result = await service.confirm(
        { file_id: 'arquivo.csv', mapping: { nome: 'nome', telefone: 'telefone' } },
        user,
      );

      expect(result).toEqual({ job_id: 'job-1', status: 'pending' });
      expect(client.importJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: 'tenant-1',
          congregation_id: 'cong-1',
          type: 'persons',
          status: JobStatus.pending,
          total_rows: 501,
          created_by: 'user-1',
        }),
      });

      // Deixa o `setImmediate` do worker em background rodar.
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      expect(system.importJob.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: { status: JobStatus.processing },
      });
      expect(system.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-1' },
          data: expect.objectContaining({ status: JobStatus.done, imported: 501 }),
        }),
      );
    });
  });

  describe('findJob', () => {
    it('lança NotFoundException quando o job não existe no tenant/congregação', async () => {
      const { service, client } = serviceWith();
      client.importJob.findFirst.mockResolvedValue(null);

      await expect(service.findJob('tenant-1', 'cong-1', 'job-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('retorna o job quando encontrado', async () => {
      const { service, client } = serviceWith();
      client.importJob.findFirst.mockResolvedValue({ id: 'job-1', status: JobStatus.done });

      const result = await service.findJob('tenant-1', 'cong-1', 'job-1');

      expect(client.importJob.findFirst).toHaveBeenCalledWith({
        where: { id: 'job-1', tenant_id: 'tenant-1', congregation_id: 'cong-1' },
      });
      expect(result).toEqual({ id: 'job-1', status: JobStatus.done });
    });
  });
});
