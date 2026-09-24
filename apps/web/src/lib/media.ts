/**
 * A URL aponta para uma imagem? Decide pela extensão do caminho, que é o que
 * se tem: o upload grava a chave com o nome original do arquivo
 * (`PostsService.uploadMedia`), e o modo "link" guarda o que o organizador
 * colou. Query string e fragmento não contam (`foto.jpg?v=2` é imagem).
 */
export function isImageUrl(url?: string | null): boolean {
  if (!url) return false;
  const path = url.split(/[?#]/)[0] ?? "";
  return /\.(jpe?g|png|webp|gif)$/i.test(path);
}
