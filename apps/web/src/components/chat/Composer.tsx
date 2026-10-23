import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { formatBytes } from '../../lib/format'
import { Button, cx } from '../ui'

const MAX_FILES = 5
const ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.pdf,.txt,.csv,.docx,.xlsx,.zip'

interface Props {
  /** When set, the composer is disabled and shows this reason. */
  disabledReason?: string | null
  onSend(content: string, files: File[]): Promise<void>
  onTyping(): void
  onStopTyping(): void
}

function FilePreview({ file, onRemove }: { file: File; onRemove(): void }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!file.type.startsWith('image/')) return
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  return (
    <div className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 text-xs">
      {url ? (
        <img src={url} alt="" className="h-7 w-7 rounded-full object-cover" />
      ) : (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-paper-2 font-mono text-[9px] uppercase">{file.name.split('.').pop()}</span>
      )}
      <span className="max-w-32 truncate">{file.name}</span>
      <span className="font-mono text-[10px] text-mute">{formatBytes(file.size)}</span>
      <button onClick={onRemove} className="text-mute hover:text-danger" aria-label={`Remove ${file.name}`}>
        ✕
      </button>
    </div>
  )
}

export function Composer({ disabledReason, onSend, onTyping, onStopTyping }: Props) {
  const [content, setContent] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  // The textarea stays enabled while sending, so focus (and the phone keyboard) is kept;
  // a ref guards against a second Enter before the first send finishes.
  const sendingRef = useRef(false)
  const blocked = Boolean(disabledReason)
  const disabled = blocked || sending

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    const text = content.trim()
    if ((!text && files.length === 0) || blocked || sendingRef.current) return
    sendingRef.current = true
    setSending(true)
    setError(null)
    try {
      await onSend(text, files)
      setContent('')
      setFiles([])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void submit()
    }
  }

  return (
    <form onSubmit={submit} className="border-t border-line bg-paper px-4 pb-4 pt-3 sm:px-8">
      {disabledReason && <p className="annot mb-2 text-center">{disabledReason}</p>}
      {error && (
        <p className="mb-2 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((file, i) => (
            <FilePreview key={`${file.name}-${i}`} file={file} onRemove={() => setFiles((prev) => prev.filter((_, j) => j !== i))} />
          ))}
        </div>
      )}
      <div
        className={cx(
          'flex items-end gap-2 rounded-[22px] border bg-surface p-1.5 pl-2 transition-[border-color,box-shadow]',
          blocked ? 'border-line' : 'border-line-strong focus-within:border-ink focus-within:shadow-[0_0_0_4px_var(--color-plum-100)]',
        )}
      >
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? [])
            setFiles((prev) => [...prev, ...picked].slice(0, MAX_FILES))
            e.target.value = ''
          }}
        />
        <button
          type="button"
          disabled={disabled || files.length >= MAX_FILES}
          onClick={() => fileInput.current?.click()}
          aria-label="Attach files"
          title="Attach files (images, PDF, text, Office, zip)"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg text-graphite transition-colors hover:bg-paper-2 hover:text-ink disabled:text-line-strong"
        >
          +
        </button>
        <textarea
          rows={1}
          value={content}
          placeholder={disabledReason ? '' : 'Type a message…'}
          title="Enter to send, Shift+Enter for a new line"
          disabled={blocked}
          aria-label="Message"
          maxLength={5000}
          onChange={(e) => {
            setContent(e.target.value)
            if (e.target.value) onTyping()
            else onStopTyping()
          }}
          onBlur={onStopTyping}
          onKeyDown={onKeyDown}
          className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-2 text-[15px] text-ink outline-none placeholder:text-mute disabled:cursor-not-allowed"
        />
        <Button type="submit" disabled={disabled || (!content.trim() && files.length === 0)} className="shrink-0">
          {sending ? 'Sending…' : 'Send'}
          <span className="font-mono text-[11px] opacity-60">↵</span>
        </Button>
      </div>
    </form>
  )
}
