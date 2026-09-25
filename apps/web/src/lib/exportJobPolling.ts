import api from "@/lib/api";

export type ExportJobStatus = "pending" | "processing" | "done" | "error";

interface ExportJob {
  id: string;
  status: ExportJobStatus;
  error_message: string | null;
}

export type ExportJobResult =
  | { status: "done"; downloadUrl: string }
  | { status: "error"; errorMessage: string };

interface PollExportJobOptions {
  intervalMs?: number;
  signal?: AbortSignal;
}

/**
 * Espera um job assíncrono de exportação (`ExportJob`) terminar, com poll em
 * `GET /financial/export/jobs/:id`. Ao chegar em `done`, resolve a URL de
 * download via `GET /financial/export/jobs/:id/download` (presigned, expira
 * em 1h — ver `ExportController.downloadJob`).
 *
 * Cancelamento via `signal`: a Promise nunca resolve nem rejeita depois do
 * abort — quem chamou já parou de se importar com o resultado, e resolver
 * tardiamente arriscaria disparar um download depois do componente
 * desmontado.
 */
export function pollExportJob(
  jobId: string,
  opts: PollExportJobOptions = {}
): Promise<ExportJobResult> {
  const { intervalMs = 2000, signal } = opts;

  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    function stop() {
      if (timer !== null) clearTimeout(timer);
    }

    if (signal) {
      signal.addEventListener("abort", stop, { once: true });
    }

    async function tick() {
      if (signal?.aborted) return;
      try {
        const res = await api.get<ExportJob>(`/financial/export/jobs/${jobId}`);
        const job = res.data;

        if (signal?.aborted || settled) return;

        if (job.status === "pending" || job.status === "processing") {
          timer = setTimeout(tick, intervalMs);
          return;
        }

        if (job.status === "done") {
          const downloadRes = await api.get<{ download_url: string; expires_in: number }>(
            `/financial/export/jobs/${jobId}/download`
          );
          if (signal?.aborted || settled) return;
          settled = true;
          resolve({ status: "done", downloadUrl: downloadRes.data.download_url });
          return;
        }

        settled = true;
        resolve({ status: "error", errorMessage: job.error_message ?? "Erro ao gerar o arquivo." });
      } catch {
        if (signal?.aborted || settled) return;
        settled = true;
        resolve({ status: "error", errorMessage: "Erro ao consultar o status da exportação." });
      }
    }

    tick();
  });
}
