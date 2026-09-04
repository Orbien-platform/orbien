"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import api from "@/lib/api";

export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "audio/mpeg",
  "video/mp4",
  "image/jpeg",
  "image/png",
  "image/webp",
];
export const ACCEPTED_EXTENSIONS = ".pdf,.mp3,.mp4,.jpg,.jpeg,.png,.webp";
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function validateMediaFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) return "Arquivo muito grande. Máximo: 50MB";
  if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
    return "Formato não suportado. Use PDF, MP3, MP4 ou imagem.";
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1).replace(".", ",")} KB`;
  return `${(kb / 1024).toFixed(1).replace(".", ",")} MB`;
}

/**
 * O arquivo não passa pelo `/api-proxy` — vai direto para a API.
 *
 * Desde que a sessão virou cookie `HttpOnly`, o `/api-proxy` é uma função da
 * Vercel, e função da Vercel tem teto de 4,5 MB de corpo de requisição. O
 * produto aceita 50 MB. Streamar o corpo economiza memória e não levanta o
 * teto: acima dele a plataforma devolve 413 antes de a requisição chegar ao
 * backend, e só em produção — `next dev` não impõe limite nenhum, então o
 * defeito não aparece no desenvolvimento.
 *
 * Mandar direto exige um `Authorization` que esta função consiga montar, e o
 * access token está fora do alcance dela, por desenho. Daí os dois passos: o
 * primeiro pede um **ticket** pelo proxy (corpo minúsculo, cookie faz o
 * trabalho); o segundo sobe o arquivo com o ticket no cabeçalho.
 *
 * O ticket dura 5 minutos, não carrega papel nenhum, vale só para este post e
 * é recusado em qualquer outra rota da API — ele fica legível para qualquer
 * script da página, então precisa não servir para mais nada.
 */
export async function uploadPostMedia(
  postId: string,
  file: File,
  onProgress: (percent: number) => void
): Promise<{ media_url: string }> {
  const { data } = await api.post<{ upload_token: string }>(
    `/content/posts/${postId}/upload-ticket`
  );

  const apiUrl = process.env.NEXT_PUBLIC_API_UPLOAD_URL;
  if (!apiUrl) {
    throw new Error(
      "NEXT_PUBLIC_API_UPLOAD_URL não está definida — sem ela não há para onde mandar o arquivo."
    );
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${apiUrl}/content/posts/${postId}/upload`);
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
    const formData = new FormData();
    formData.append("file", file);
    xhr.send(formData);
  });
}

export interface FileUploadState {
  selectedFile: File | null;
  isDragging: boolean;
  isUploading: boolean;
  uploadProgress: number;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  clearFile: () => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  openPicker: () => void;
  upload: (postId: string) => Promise<{ media_url: string }>;
  reset: () => void;
}

// `onError` is called with the validation message whenever a dropped/picked
// file fails the size or mimetype check, so callers can surface it (toast, etc).
export function useFileUpload(onError: (message: string) => void): FileUploadState {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function selectFile(file: File) {
    const err = validateMediaFile(file);
    if (err) { onError(err); return; }
    setSelectedFile(file);
  }

  function clearFile() {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  function onDragLeave() {
    setIsDragging(false);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) selectFile(file);
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) selectFile(file);
  }

  function openPicker() {
    fileInputRef.current?.click();
  }

  async function upload(postId: string): Promise<{ media_url: string }> {
    if (!selectedFile) throw new Error("no_file_selected");
    setIsUploading(true);
    setUploadProgress(0);
    try {
      return await uploadPostMedia(postId, selectedFile, setUploadProgress);
    } finally {
      setIsUploading(false);
    }
  }

  function reset() {
    setSelectedFile(null);
    setIsDragging(false);
    setIsUploading(false);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return {
    selectedFile,
    isDragging,
    isUploading,
    uploadProgress,
    fileInputRef,
    clearFile,
    onDragOver,
    onDragLeave,
    onDrop,
    onInputChange,
    openPicker,
    upload,
    reset,
  };
}
