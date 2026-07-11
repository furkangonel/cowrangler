/**
 * Code sekmesinin aktif çalışma dizini — birden çok IPC modülü paylaşır.
 *
 * Code projesinin DB kaydı yoktur; workdir'i yalnızca kullanıcı Code'da bir
 * klasör seçince (`agent:setCodeWorkdir`) bilinir. Hem agent.ipc (agent'ı bu
 * dizinde çalıştırır) hem fs.ipc (drag-drop dosyalarını buraya kopyalar) aynı
 * değeri görmeli — tek doğruluk kaynağı budur.
 *
 * Ana workspace (primary) bir kez seçilince değiştirilmez. Kullanıcı isterse
 * EK dizinler (extra) ekleyebilir; agent bu dizinlerde de mutlak yol ile
 * çalışabilir (file_tools absolute path kabul eder). Ana workspace değişince
 * ek dizinler sıfırlanır — her workspace kendi ek dizin setine sahiptir.
 */

let _codeWorkdir: string | undefined
let _codeExtraDirs: string[] = []

export function setCodeWorkdir(dir: string | undefined): void {
  if (dir !== _codeWorkdir) {
    // Ana workspace değişti → önceki ek dizinler artık geçersiz.
    _codeExtraDirs = []
  }
  _codeWorkdir = dir
}

export function getCodeWorkdir(): string | undefined {
  return _codeWorkdir
}

/** Ek çalışma dizinleri (ana workspace dışında, agent'ın erişebildiği). */
export function getCodeExtraDirs(): string[] {
  return _codeExtraDirs
}

export function addCodeExtraDir(dir: string): void {
  if (!dir) return
  if (dir === _codeWorkdir) return // ana workspace zaten erişilebilir
  if (!_codeExtraDirs.includes(dir)) _codeExtraDirs.push(dir)
}

export function removeCodeExtraDir(dir: string): void {
  _codeExtraDirs = _codeExtraDirs.filter((d) => d !== dir)
}
