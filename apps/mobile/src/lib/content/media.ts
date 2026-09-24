// A URL de mídia do post aponta para uma imagem? Mesma regra de
// `apps/web/src/lib/media.ts` (sem importar de lá — os deploys são
// independentes): extensão do caminho, ignorando query e fragmento. O upload
// grava a chave com o nome original do arquivo, e o modo "link" guarda o que
// o organizador colou — PDF, MP3, MP4 e link de vídeo não são capa.
export function isImageUrl(url?: string | null): boolean {
  if (!url) return false;
  const path = url.split(/[?#]/)[0] ?? "";
  return /\.(jpe?g|png|webp|gif)$/i.test(path);
}
