"use client";

import { FileAudio, FileImage, FileText, FileVideo, UploadCloud, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ACCEPTED_EXTENSIONS, formatFileSize, type FileUploadState } from "@/hooks/useFileUpload";
import { cn } from "@/lib/utils";

export function iconForFile(name: string, colorClassName = "text-stone") {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const cls = cn("flex-shrink-0", colorClassName);
  if (ext === "pdf") return <FileText size={16} strokeWidth={1.5} className={cls} />;
  if (ext === "mp3") return <FileAudio size={16} strokeWidth={1.5} className={cls} />;
  if (ext === "mp4") return <FileVideo size={16} strokeWidth={1.5} className={cls} />;
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) return <FileImage size={16} strokeWidth={1.5} className={cls} />;
  return <FileText size={16} strokeWidth={1.5} className={cls} />;
}

interface MediaUploadFieldProps {
  mode: "link" | "upload";
  onModeChange: (mode: "link" | "upload") => void;
  linkValue: string;
  onLinkChange: (value: string) => void;
  upload: FileUploadState;
  disabled?: boolean;
  /** An existing uploaded file the post already has, shown until the user picks a replacement. */
  currentFile?: { name: string } | null;
  label?: string;
}

export function MediaUploadField({
  mode,
  onModeChange,
  linkValue,
  onLinkChange,
  upload,
  disabled = false,
  currentFile = null,
  label = "Mídia",
}: MediaUploadFieldProps) {
  const {
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
  } = upload;

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm font-medium text-ink dark:text-white">
        {label} <span className="text-xs font-normal text-stone">(opcional)</span>
      </Label>

      <div className="flex gap-1 rounded-[8px] bg-[var(--surface-subtle)] p-1">
        <button
          type="button"
          onClick={() => onModeChange("link")}
          disabled={disabled}
          className={cn(
            "flex-1 rounded-[6px] px-2 py-1.5 text-xs font-medium transition-colors",
            mode === "link"
              ? "bg-[var(--surface-base)] text-ink shadow-sm dark:text-white"
              : "text-stone hover:text-ink dark:hover:text-white"
          )}
        >
          Link externo
        </button>
        <button
          type="button"
          onClick={() => onModeChange("upload")}
          disabled={disabled}
          className={cn(
            "flex-1 rounded-[6px] px-2 py-1.5 text-xs font-medium transition-colors",
            mode === "upload"
              ? "bg-[var(--surface-base)] text-ink shadow-sm dark:text-white"
              : "text-stone hover:text-ink dark:hover:text-white"
          )}
        >
          Upload de arquivo
        </button>
      </div>

      {mode === "link" ? (
        <Input
          type="url"
          placeholder="https://…"
          value={linkValue}
          onChange={(e) => onLinkChange(e.target.value)}
          disabled={disabled}
          className="rounded-[8px]"
        />
      ) : (
        <div className="flex flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            onChange={onInputChange}
            disabled={disabled}
            className="hidden"
          />

          {selectedFile ? (
            <>
              <div className="flex items-center justify-between gap-2 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-subtle)] px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  {iconForFile(selectedFile.name)}
                  <span className="truncate text-sm text-ink dark:text-white">
                    {selectedFile.name}{" "}
                    <span className="text-stone">· {formatFileSize(selectedFile.size)}</span>
                  </span>
                </div>
                {!disabled && (
                  <button
                    type="button"
                    onClick={clearFile}
                    className="flex-shrink-0 text-stone hover:text-crimson"
                    aria-label="Remover arquivo"
                  >
                    <X size={14} strokeWidth={1.5} />
                  </button>
                )}
              </div>
              {currentFile && (
                <p className="text-xs text-stone">O arquivo anterior será removido ao salvar.</p>
              )}
            </>
          ) : currentFile ? (
            <div className="flex flex-col gap-2 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-subtle)] px-3 py-2">
              <p className="text-xs font-medium uppercase tracking-wide text-stone">Mídia atual</p>
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {iconForFile(currentFile.name)}
                  <span className="truncate text-sm text-ink dark:text-white">{currentFile.name}</span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={openPicker}
                  disabled={disabled}
                  className="flex-shrink-0 rounded-[6px]"
                >
                  Substituir arquivo
                </Button>
              </div>
            </div>
          ) : (
            <div
              onDragOver={disabled ? undefined : onDragOver}
              onDragLeave={onDragLeave}
              onDrop={disabled ? undefined : onDrop}
              onClick={() => { if (!disabled) openPicker(); }}
              className={cn(
                "flex flex-col items-center justify-center gap-1.5 rounded-[8px] border-2 border-dashed px-4 py-6 text-center transition-colors",
                disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                isDragging
                  ? "border-navy bg-navy-dim"
                  : "border-[var(--border-default)] hover:border-navy/40"
              )}
            >
              <UploadCloud size={20} strokeWidth={1.5} className="text-stone" />
              <p className="text-sm text-stone">
                Arraste um arquivo aqui ou <span className="font-medium text-navy">selecione</span>
              </p>
              <p className="text-xs text-stone">PDF, MP3, MP4, JPG, PNG ou WEBP · máx. 50MB</p>
            </div>
          )}

          {isUploading && (
            <div className="flex flex-col gap-1">
              <Progress value={uploadProgress} />
              <p className="text-xs text-stone">Enviando arquivo… {uploadProgress}%</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
