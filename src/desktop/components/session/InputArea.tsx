import React, { useRef, useState, useCallback } from 'react'
import { Send, Square, Paperclip, Mic } from 'lucide-react'

interface Props {
  onSend: (message: string) => void
  onInterrupt: () => void
  disabled: boolean
  projectId: string
}

export function InputArea({ onSend, onInterrupt, disabled, projectId }: Props) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const msg = value.trim()
    if (!msg || disabled) return
    onSend(msg)
    setValue('')
    // Textarea yüksekliğini sıfırla
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [value, disabled, onSend])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value)
    // Auto-resize
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  return (
    <div className="flex-shrink-0 border-t border-border bg-bg-secondary px-4 py-3">
      <div className="flex items-end gap-3">
        {/* Left actions */}
        <div className="flex items-center gap-1 pb-1">
          <button
            className="p-1.5 text-text-muted hover:text-text-secondary transition-colors rounded"
            title="Dosya ekle"
            onClick={async () => {
              // File attach — ileride implement edilecek
            }}
          >
            <Paperclip size={15} />
          </button>
        </div>

        {/* Textarea */}
        <div className="flex-1 flex items-end gap-2 bg-bg-tertiary border border-border rounded-xl px-3 py-2 focus-within:border-accent/60 transition-colors">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={disabled ? 'Agent çalışıyor...' : 'Mesaj yazın... (Enter gönder, Shift+Enter yeni satır)'}
            rows={1}
            className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted resize-none outline-none max-h-[200px] overflow-y-auto selectable disabled:opacity-60"
            style={{ minHeight: '24px' }}
          />
        </div>

        {/* Send / Stop button */}
        <div className="flex-shrink-0 pb-1">
          {disabled ? (
            <button
              onClick={onInterrupt}
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-error/20 text-error hover:bg-error/30 transition-colors"
              title="Durdur (Esc)"
            >
              <Square size={14} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!value.trim()}
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent-hover transition-colors"
              title="Gönder (Enter)"
            >
              <Send size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Status hint */}
      {disabled && (
        <p className="text-2xs text-text-muted mt-1.5 ml-10">
          Agent çalışıyor — durdurmak için ■ butonuna basın
        </p>
      )}
    </div>
  )
}
