/**
 * Code sekmesinin aktif çalışma dizini — birden çok IPC modülü paylaşır.
 *
 * Code projesinin DB kaydı yoktur; workdir'i yalnızca kullanıcı Code'da bir
 * klasör seçince (`agent:setCodeWorkdir`) bilinir. Hem agent.ipc (agent'ı bu
 * dizinde çalıştırır) hem fs.ipc (drag-drop dosyalarını buraya kopyalar) aynı
 * değeri görmeli — tek doğruluk kaynağı budur.
 */

let _codeWorkdir: string | undefined

export function setCodeWorkdir(dir: string | undefined): void {
  _codeWorkdir = dir
}

export function getCodeWorkdir(): string | undefined {
  return _codeWorkdir
}
