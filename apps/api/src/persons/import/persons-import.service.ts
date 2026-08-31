import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Gender, ImportJob, JobStatus, PersonClassification, Prisma } from '@prisma/client';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { parse as csvParse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ImportConfirmDto } from '../dto/import-confirm.dto';
import { ImportPreviewDto, SuggestedMapping } from '../dto/import-preview.dto';

const ALLOWED_EXTENSIONS = new Set(['.csv', '.xlsx', '.xls']);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const SYNC_ROW_LIMIT = 500;
const PREVIEW_ROWS = 5;

// Canonical field names for suggested mapping
const COLUMN_ALIASES: Record<string, keyof SuggestedMapping> = {
  nome: 'nome', name: 'nome', full_name: 'nome', 'nome completo': 'nome',
  telefone: 'telefone', phone: 'telefone', celular: 'telefone',
  whatsapp: 'telefone', fone: 'telefone', 'tel': 'telefone',
  email: 'email', 'e-mail': 'email', 'e_mail': 'email',
  sexo: 'sexo', genero: 'sexo', gênero: 'sexo', gender: 'sexo',
  nascimento: 'birth_date', data_nascimento: 'birth_date',
  birth_date: 'birth_date', dt_nasc: 'birth_date', 'data nascimento': 'birth_date',
  classificação: 'classificação', classificacao: 'classificação',
  status: 'classificação', tipo: 'classificação', classification: 'classificação',
};

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

@Injectable()
export class PersonsImportService {
  private readonly logger = new Logger(PersonsImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ── Preview ───────────────────────────────────────────────────────────────

  async preview(
    file: Express.Multer.File,
    tenantId: string,
  ): Promise<ImportPreviewDto> {
    const ext = path.extname(file.originalname).toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new BadRequestException('Formato inválido. Use .csv, .xlsx ou .xls');
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('Arquivo muito grande. Limite: 10 MB');
    }

    const rows = this.parseBuffer(file.buffer, ext);
    if (rows.length === 0) throw new BadRequestException('Arquivo vazio ou sem dados válidos');

    const detectedColumns = Object.keys(rows[0]);
    const suggestedMapping = this.buildSuggestedMapping(detectedColumns);
    const previewRows = rows.slice(0, PREVIEW_ROWS);
    const totalRows = rows.length;

    // Upload temp file to R2
    const fileId = `${randomUUID()}${ext}`;
    const key = `imports/temp/${tenantId}/${fileId}`;
    await this.storage.upload(file.buffer, key, file.mimetype);

    return { file_id: fileId, total_rows: totalRows, preview_rows: previewRows, detected_columns: detectedColumns, suggested_mapping: suggestedMapping };
  }

  // ── Confirm ───────────────────────────────────────────────────────────────

  async confirm(
    dto: ImportConfirmDto,
    user: JwtPayload,
  ): Promise<ImportResult | { job_id: string; status: string }> {
    const ext = path.extname(dto.file_id).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) throw new BadRequestException('file_id inválido');

    const key = `imports/temp/${user.tenant_id}/${dto.file_id}`;
    let fileBuffer: Buffer;
    try {
      fileBuffer = await this.storage.downloadBuffer(key);
    } catch {
      throw new NotFoundException('Arquivo de importação não encontrado ou expirado');
    }

    const rows = this.parseBuffer(fileBuffer, ext);
    if (rows.length === 0) throw new BadRequestException('Arquivo sem dados');

    if (rows.length <= SYNC_ROW_LIMIT) {
      return this.processRows(rows, dto.mapping, user.tenant_id, user.congregation_id, user.sub, this.prisma.client);
    }

    // Async path
    const job = await this.prisma.client.importJob.create({
      data: {
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
        type: 'persons',
        status: JobStatus.pending,
        total_rows: rows.length,
        created_by: user.sub,
      },
    });

    setImmediate(() => {
      this.runJobBackground(job.id, rows, dto.mapping, user.tenant_id, user.congregation_id, user.sub).catch(
        (err: Error) => this.logger.error(`Import job ${job.id} failed: ${err.message}`),
      );
    });

    return { job_id: job.id, status: 'pending' };
  }

  // ── Job polling ───────────────────────────────────────────────────────────

  async findJob(tenantId: string, congregationId: string, id: string): Promise<ImportJob> {
    const job = await this.prisma.client.importJob.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
    });
    if (!job) throw new NotFoundException('Job de importação não encontrado');
    return job;
  }

  // ── Background worker ─────────────────────────────────────────────────────

  private async runJobBackground(
    jobId: string,
    rows: Record<string, string>[],
    mapping: ImportConfirmDto['mapping'],
    tenantId: string,
    congregationId: string,
    userId: string,
  ): Promise<void> {
    await this.prisma.system.importJob.update({
      where: { id: jobId },
      data: { status: JobStatus.processing },
    });
    try {
      const result = await this.processRows(rows, mapping, tenantId, congregationId, userId, this.prisma.system);
      await this.prisma.system.importJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.done,
          imported: result.imported,
          skipped: result.skipped,
          errors: result.errors as unknown as Prisma.InputJsonValue,
          total_rows: rows.length,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.prisma.system.importJob.update({
        where: { id: jobId },
        data: { status: JobStatus.error, errors: [{ row: 0, reason: msg }] as unknown as Prisma.InputJsonValue },
      });
      throw err;
    }
  }

  // ── Row processor ─────────────────────────────────────────────────────────

  private async processRows(
    rows: Record<string, string>[],
    mapping: ImportConfirmDto['mapping'],
    tenantId: string,
    congregationId: string,
    userId: string,
    db: typeof this.prisma.client,
  ): Promise<ImportResult> {
    let imported = 0;
    let skipped = 0;
    const errors: { row: number; reason: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // 1-indexed, header = row 1
      const row = rows[i];

      const fullName = mapping.nome ? (row[mapping.nome] ?? '').trim() : '';
      const rawPhone = mapping.telefone ? (row[mapping.telefone] ?? '').trim() : '';
      const email = mapping.email ? (row[mapping.email] ?? '').trim() || undefined : undefined;
      const rawSexo = mapping.sexo ? (row[mapping.sexo] ?? '').trim() : '';
      const rawBirth = mapping.birth_date ? (row[mapping.birth_date] ?? '').trim() : '';
      const rawClass = mapping.classificação ? (row[mapping.classificação] ?? '').trim() : '';

      if (!fullName) {
        errors.push({ row: rowNum, reason: 'missing_name' });
        continue;
      }

      const phone = rawPhone ? this.normalizePhone(rawPhone) : undefined;

      if (!phone && !email) {
        errors.push({ row: rowNum, reason: 'missing_phone_and_email' });
        continue;
      }

      // Deduplication by phone
      if (phone) {
        const existing = await db.person.findFirst({
          where: { tenant_id: tenantId, phone },
          select: { id: true },
        });
        if (existing) {
          skipped++;
          continue;
        }
      }

      const gender = this.mapGender(rawSexo);
      const birth_date = rawBirth ? this.parseDate(rawBirth) : undefined;
      const classification = this.mapClassification(rawClass);

      try {
        const person = await db.person.create({
          data: {
            tenant_id: tenantId,
            congregation_id: congregationId,
            full_name: fullName,
            phone,
            email,
            gender,
            birth_date,
            classification,
          },
          select: { id: true },
        });

        await db.consentRecord.create({
          data: {
            tenant_id: tenantId,
            congregation_id: congregationId,
            person_id: person.id,
            version: 'import-v1',
            origin: 'import',
            consented_at: new Date(),
          },
        });

        imported++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ row: rowNum, reason: msg.slice(0, 120) });
      }
    }

    // Fire-and-forget audit log
    this.prisma.client.auditLog
      .create({
        data: {
          tenant_id: tenantId,
          congregation_id: congregationId,
          actor_user_id: userId,
          entity: 'person',
          action: 'persons.batch_import',
          after: { count: imported } as unknown as Prisma.InputJsonValue,
        },
      })
      .catch(() => void 0);

    return { imported, skipped, errors };
  }

  // ── File parsers ──────────────────────────────────────────────────────────

  private parseBuffer(buffer: Buffer, ext: string): Record<string, string>[] {
    if (ext === '.csv') {
      return csvParse(buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      }) as Record<string, string>[];
    }

    // XLSX / XLS
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    return raw.map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [String(k), String(v ?? '')])),
    );
  }

  // ── Mapping helpers ───────────────────────────────────────────────────────

  private buildSuggestedMapping(columns: string[]): SuggestedMapping {
    const mapping: SuggestedMapping = {};
    for (const col of columns) {
      const normalized = this.normalizeStr(col);
      const canonical = COLUMN_ALIASES[normalized];
      if (canonical && !mapping[canonical]) {
        mapping[canonical] = col;
      }
    }
    return mapping;
  }

  private normalizeStr(s: string): string {
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim();
  }

  // ── Data helpers ──────────────────────────────────────────────────────────

  private normalizePhone(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 12) return `+${digits}`;
    return `+55${digits}`;
  }

  private mapGender(raw: string): Gender | undefined {
    switch (this.normalizeStr(raw)) {
      case 'm': case 'masculino': case 'male': case 'homem': return Gender.male;
      case 'f': case 'feminino': case 'female': case 'mulher': return Gender.female;
      case 'outro': case 'other': return Gender.other;
      default: return undefined;
    }
  }

  private mapClassification(raw: string): PersonClassification {
    switch (this.normalizeStr(raw)) {
      case 'membro': case 'member': return PersonClassification.member;
      case 'frequentador': case 'attendee': return PersonClassification.attendee;
      default: return PersonClassification.visitor;
    }
  }

  private parseDate(raw: string): Date | undefined {
    // Accept ISO (2026-01-15), BR (15/01/2026), or numeric Excel dates
    if (!raw) return undefined;
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
    // Try BR format DD/MM/YYYY
    const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      const [, dd, mm, yyyy] = match;
      return new Date(`${yyyy}-${mm!.padStart(2, '0')}-${dd!.padStart(2, '0')}`);
    }
    return undefined;
  }
}
