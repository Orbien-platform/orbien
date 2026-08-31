"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import api from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

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

export function uploadPostMedia(
  postId: string,
  file: File,
  onProgress: (percent: number) => void
): Promise<{ media_url: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${api.defaults.baseURL}/content/posts/${postId}/upload`);
    const token = getAccessToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
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
