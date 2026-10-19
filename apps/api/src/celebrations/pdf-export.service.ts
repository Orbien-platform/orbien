import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfmakeLib = require('pdfmake') as {
  virtualfs: { writeFileSync: (name: string, content: Buffer) => void };
  fonts: Record<string, unknown>;
  setLocalAccessPolicy: (cb: () => boolean) => void;
  setUrlAccessPolicy: (cb: () => boolean) => void;
  createPdf: (def: object, opts: object) => { getBuffer: () => Promise<Buffer> };
};

// One-time initialisation — load Roboto from the bundled VFS
// eslint-disable-next-line @typescript-eslint/no-require-imports
const vfsFonts = require('pdfmake/build/vfs_fonts') as Record<string, string>;
Object.entries(vfsFonts).forEach(([name, b64]) =>
  pdfmakeLib.virtualfs.writeFileSync(name, Buffer.from(b64, 'base64')),
);
pdfmakeLib.fonts = {
  Roboto: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-MediumItalic.ttf',
  },
};
pdfmakeLib.setLocalAccessPolicy(() => false);
pdfmakeLib.setUrlAccessPolicy(() => false);

const DEFAULT_COLOR = '#1E3A7B';
const PDF_TTL_SECONDS = 86_400; // 24 h

export interface PdfResult {
  pdf_url: string;
  expires_at: string;
}

const PHASE_LABELS: Record<string, string> = {
  before: 'Antes do culto',
  during: 'Culto',
  after: 'Depois do culto',
};

@Injectable()
export class PdfExportService {
  private readonly logger = new Logger(PdfExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async generateServiceOrderPdf(
    tenantId: string,
    congregationId: string,
    serviceOrderId: string,
  ): Promise<PdfResult> {
    // ── 1. Fetch all data ───────────────────────────────────────────────────
    const order = await this.prisma.client.serviceOrder.findFirst({
      where: { id: serviceOrderId, tenant_id: tenantId, congregation_id: congregationId },
      include: {
        celebrationInstance: {
          include: {
            celebration: { select: { name: true, start_time: true } },
          },
        },
        items: {
          orderBy: [{ phase: 'asc' }, { sequence: 'asc' }],
          include: {
            person: { select: { full_name: true } },
            ministry: { select: { id: true, name: true } },
            setlist: { include: { songs: { orderBy: { sequence: 'asc' } } } },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Ordem de culto não encontrada');

    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: tenantId },
      include: { brandingConfig: { select: { primary_color: true, logo_url: true, app_name: true } } },
    });

    // Volunteers for ministry-type items
    const ministryIds = [
      ...new Set(
        order.items.filter((i) => i.ministry_id).map((i) => i.ministry_id!),
      ),
    ];
    const volunteersByMinistry: Record<string, string[]> = {};
    if (ministryIds.length) {
      // CelebrationSchedule is 1:1 per CelebrationInstance since Bloco 1 — a
      // snapshot of who was scheduled for this specific date, not the
      // celebration's standing roster.
      const assignments = await this.prisma.client.celebrationAssignment.findMany({
        where: {
          tenant_id: tenantId,
          status: 'confirmed',
          celebrationMinistry: {
            ministry_id: { in: ministryIds },
            schedule: { celebration_instance_id: order.celebrationInstance.id },
          },
        },
        include: {
          volunteerProfile: { include: { person: { select: { full_name: true } } } },
          celebrationMinistry: { select: { ministry_id: true } },
        },
      });

      for (const a of assignments) {
        const mid = a.celebrationMinistry.ministry_id;
        if (!volunteersByMinistry[mid]) volunteersByMinistry[mid] = [];
        volunteersByMinistry[mid].push(a.volunteerProfile.person.full_name);
      }
    }

    // ── 2. Derive display values ────────────────────────────────────────────
    const branding = tenant?.brandingConfig;
    const primaryColor = branding?.primary_color ?? DEFAULT_COLOR;
    const churchName = branding?.app_name ?? tenant?.name ?? 'Igreja';
    const celebration = order.celebrationInstance.celebration;
    const schedDate = order.celebrationInstance.scheduled_date;

    const dateLabel = schedDate.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });

    const logoBase64 = await this.fetchLogoBase64(branding?.logo_url ?? null);

    // ── 3. Build PDF document definition ────────────────────────────────────
    const tableBody: object[][] = [
      [
        { text: 'Horário', style: 'th', alignment: 'center' },
        { text: '#', style: 'th', alignment: 'center' },
        { text: 'Etapa', style: 'th' },
        { text: 'Duração', style: 'th', alignment: 'center' },
        { text: 'Responsável', style: 'th' },
      ],
    ];

    const setlistBlocks: object[] = [];

    let currentPhase: string | null = null;
    for (const item of order.items) {
      // Faixa de título quando muda o momento: antes, durante, depois do culto.
      if (item.phase !== currentPhase) {
        currentPhase = item.phase;
        tableBody.push([
          { text: PHASE_LABELS[item.phase], style: 'th', colSpan: 5, alignment: 'left' },
          {},
          {},
          {},
          {},
        ]);
      }
      const clockTime = this.addMinutes(celebration.start_time, item.start_offset_minutes);
      const duration = item.duration_minutes > 0 ? `${item.duration_minutes} min` : '—';
      const responsible = this.formatResponsible(item, volunteersByMinistry);
      const label = item.entry_kind === 'logistics' ? `${item.name} (equipe)` : item.name;

      tableBody.push([
        { text: clockTime, alignment: 'center' },
        { text: String(item.sequence), alignment: 'center' },
        { text: label },
        { text: duration, alignment: 'center' },
        { text: responsible },
      ]);

      // Setlist sub-block
      if (item.setlist?.songs?.length) {
        setlistBlocks.push(
          { text: `\nSetlist — ${item.name}`, style: 'setlistTitle' },
          {
            ol: item.setlist.songs.map((s) => {
              const meta: string[] = [];
              if (s.key) meta.push(`Tom: ${s.key}`);
              if (s.bpm) meta.push(`BPM: ${s.bpm}`);
              const suffix = meta.length ? ` (${meta.join(' · ')})` : '';
              const version = s.version_label ? ` — ${s.version_label}` : '';
              return { text: `${s.title}${version}${suffix}` };
            }),
            margin: [20, 0, 0, 0] as [number, number, number, number],
          },
        );
      }
    }

    // Logo e nome da igreja ficam no cabeçalho da página (canto superior
    // esquerdo, em todas as páginas); o corpo começa pela celebração.
    const headerStack: object[] = [
      { text: celebration.name, style: 'celebrationName' },
      { text: `${dateLabel} · ${celebration.start_time}`, style: 'dateLabel' },
      { text: order.title, style: 'orderTitle' },
    ];

    const docDefinition = {
      pageSize: 'A4',
      pageMargins: [40, 90, 40, 60] as [number, number, number, number],
      header: () => ({
        margin: [40, 14, 40, 0],
        stack: [
          {
            columns: [
              ...(logoBase64
                ? [{ image: logoBase64, fit: [44, 30], width: 'auto', margin: [0, 0, 8, 0] }]
                : []),
              { text: churchName, style: 'churchName', width: '*', margin: [0, logoBase64 ? 7 : 0, 0, 0] },
            ],
          },
          {
            canvas: [{ type: 'rect', x: 0, y: 0, w: 515, h: 6, color: primaryColor }],
            margin: [0, 6, 0, 0],
          },
        ],
      }),
      footer: (currentPage: number, pageCount: number) => ({
        margin: [40, 0, 40, 20],
        columns: [
          { text: `Gerado por Orbien · ${new Date().toLocaleString('pt-BR')}`, style: 'footer' },
          { text: `${currentPage}/${pageCount}`, style: 'footer', alignment: 'right' },
        ],
      }),
      content: [
        { stack: headerStack, margin: [0, 0, 0, 16] },
        {
          table: {
            headerRows: 1,
            widths: [50, 20, '*', 50, '*'],
            body: tableBody,
          },
          layout: 'lightHorizontalLines',
        },
        ...setlistBlocks,
      ],
      styles: {
        churchName: { fontSize: 13, bold: true, color: '#222222' },
        celebrationName: { fontSize: 20, bold: true, color: primaryColor },
        dateLabel: { fontSize: 11, color: '#444444', margin: [0, 2, 0, 0] },
        orderTitle: { fontSize: 13, italics: true, color: '#333333', margin: [0, 4, 0, 0] },
        th: { bold: true, fillColor: '#F0F4FF', fontSize: 10 },
        setlistTitle: { fontSize: 12, bold: true, color: primaryColor, margin: [0, 12, 0, 4] },
        footer: { fontSize: 8, color: '#999999' },
      },
      defaultStyle: { font: 'Roboto', fontSize: 10 },
    };

    // ── 4. Generate PDF buffer ───────────────────────────────────────────────
    const pdfDoc = pdfmakeLib.createPdf(docDefinition, {});
    const buffer = await pdfDoc.getBuffer();

    // ── 5. Upload to R2 ──────────────────────────────────────────────────────
    const key = `tenants/${tenantId}/oc/${serviceOrderId}.pdf`;
    await this.storage.upload(buffer, key, 'application/pdf');
    this.logger.log(`PDF uploaded: ${key} (${buffer.length} bytes)`);

    // ── 6. Presigned GET URL (24 h) ──────────────────────────────────────────
    const pdfUrl = await this.storage.getPresignedGetUrl(key, PDF_TTL_SECONDS);
    const expiresAt = new Date(Date.now() + PDF_TTL_SECONDS * 1000).toISOString();

    return { pdf_url: pdfUrl, expires_at: expiresAt };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private formatResponsible(
    item: {
      responsible_type: string;
      person: { full_name: string } | null;
      ministry: { id: string; name: string } | null;
      responsible_label: string | null;
    },
    volunteersByMinistry: Record<string, string[]>,
  ): string {
    if (item.responsible_type === 'person') {
      return item.person?.full_name ?? '—';
    }
    if (item.responsible_type === 'ministry') {
      const minName = item.ministry?.name ?? '—';
      const volunteers = item.ministry ? (volunteersByMinistry[item.ministry.id] ?? []) : [];
      if (volunteers.length) return `${minName}\n${volunteers.join(', ')}`;
      return minName;
    }
    return item.responsible_label ?? '—';
  }

  /** "09:00" + 25 min → "09:25" */
  private addMinutes(timeStr: string, minutes: number): string {
    const [h, m] = timeStr.split(':').map(Number);
    const total = (h ?? 0) * 60 + (m ?? 0) + minutes;
    // Módulo positivo: etapa antes do culto tem offset negativo, e o culto
    // pode começar logo depois da meia-noite.
    const wrapped = ((total % 1440) + 1440) % 1440;
    const nh = Math.floor(wrapped / 60);
    const nm = wrapped % 60;
    return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
  }

  private async fetchLogoBase64(logoUrl: string | null): Promise<string | null> {
    if (!logoUrl) return null;
    try {
      const res = await fetch(logoUrl, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      const mime = res.headers.get('content-type') ?? 'image/png';
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
  }
}
