import api from "@/lib/api";

export interface StudyMaterialFields {
  title: string;
  audience: "all_networks" | "network" | "group";
  network_id?: string;
  target_group_ids?: string[];
  visibility: "all" | "leaders_only";
  /** ISO; ausente = publicar agora. */
  publish_at: string;
}

/**
 * Arquivo de material: mesmo desenho de `uploadPostMedia` (ver
 * `useFileUpload.ts`) — fora do `/api-proxy`, que na Vercel tem teto de 4,5 MB
 * de corpo. O ticket sai pelo proxy; o arquivo sobe direto na API. Como o
 * material ainda não existe, o ticket vem preso a um `upload_id` sorteado.
 */
export async function uploadStudyMaterial(
  file: File,
  fields: StudyMaterialFields,
  onProgress: (percent: number) => void
): Promise<{ id: string }> {
  const { data } = await api.post<{ upload_token: string; upload_id: string }>(
    "/study-materials/upload-ticket"
  );
  return sendStudyMaterial("POST", data, file, fields, onProgress);
}

/**
 * Troca o arquivo de um material que já existe (e os campos junto). O ticket é
 * preso ao `id` do material e só vale em `PATCH /study-materials/upload/:id`.
 * O servidor define o tipo (PDF ou Word) pelo arquivo novo.
 */
export async function replaceStudyMaterialFile(
  id: string,
  file: File,
  fields: StudyMaterialFields,
  onProgress: (percent: number) => void
): Promise<{ id: string }> {
  const { data } = await api.post<{ upload_token: string; upload_id: string }>(
    `/study-materials/${id}/upload-ticket`
  );
  return sendStudyMaterial("PATCH", data, file, fields, onProgress);
}

function sendStudyMaterial(
  method: "POST" | "PATCH",
  data: { upload_token: string; upload_id: string },
  file: File,
  fields: StudyMaterialFields,
  onProgress: (percent: number) => void
): Promise<{ id: string }> {
  const apiUrl = process.env.NEXT_PUBLIC_API_UPLOAD_URL;
  if (!apiUrl) {
    throw new Error(
      "NEXT_PUBLIC_API_UPLOAD_URL não está definida — sem ela não há para onde mandar o arquivo."
    );
  }

  const form = new FormData();
  form.append("title", fields.title);
  if (method === "POST") {
    form.append("source_type", file.name.toLowerCase().endsWith(".pdf") ? "pdf" : "doc");
  }
  form.append("audience", fields.audience);
  if (fields.network_id) form.append("network_id", fields.network_id);
  for (const id of fields.target_group_ids ?? []) form.append("target_group_ids", id);
  form.append("visibility", fields.visibility);
  form.append("publish_at", fields.publish_at);
  form.append("file", file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, `${apiUrl}/study-materials/upload/${data.upload_id}`);
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
    xhr.send(form);
  });
}
