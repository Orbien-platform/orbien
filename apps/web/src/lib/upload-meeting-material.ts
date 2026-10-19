import api from "@/lib/api";
import { MAX_FILE_SIZE } from "@/hooks/useFileUpload";

export const MATERIAL_FILE_ACCEPT = ".pdf,.doc,.docx";

const MATERIAL_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export function validateMaterialFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) return "Arquivo muito grande. Máximo: 50MB";
  if (!MATERIAL_MIME_TYPES.includes(file.type)) return "Envie um arquivo PDF ou Word (.doc, .docx).";
  return null;
}

export interface UploadedMeetingMaterial {
  id: string;
  material_id: string;
  visibility: "all" | "leaders_only";
  release_at: string | null;
  material: { id: string; title: string; source_type?: string };
}

/**
 * Mesmo desenho de `uploadPostMedia` (ver `useFileUpload.ts`): o arquivo não
 * passa pelo `/api-proxy`, que na Vercel tem teto de 4,5 MB de corpo. O ticket
 * sai pelo proxy (o cookie `HttpOnly` faz o trabalho), vale 5 minutos e só para
 * esta reunião; o arquivo sobe direto na API com ele.
 */
export async function uploadMeetingMaterial(
  meetingId: string,
  input: { file: File; title: string; visibility: "all" | "leaders_only"; releaseAt?: string },
  onProgress: (percent: number) => void
): Promise<UploadedMeetingMaterial> {
  const { data } = await api.post<{ upload_token: string }>(
    `/small-groups/meetings/${meetingId}/materials/upload-ticket`
  );

  const apiUrl = process.env.NEXT_PUBLIC_API_UPLOAD_URL;
  if (!apiUrl) {
    throw new Error(
      "NEXT_PUBLIC_API_UPLOAD_URL não está definida — sem ela não há para onde mandar o arquivo."
    );
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${apiUrl}/small-groups/meetings/${meetingId}/materials/upload`);
    xhr.setRequestHeader("Authorization", `Bearer ${data.upload_token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("invalid_response"));
        }
      } else {
        reject(new Error(`upload_failed_${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("network_error"));
    const form = new FormData();
    form.append("title", input.title);
    form.append("visibility", input.visibility);
    if (input.releaseAt) form.append("release_at", input.releaseAt);
    form.append("file", input.file);
    xhr.send(form);
  });
}
