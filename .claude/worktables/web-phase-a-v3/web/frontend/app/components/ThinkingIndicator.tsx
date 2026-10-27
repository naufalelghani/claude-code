/**
 * ThinkingIndicator — Fase B
 *
 * Claude web-style animated dots indicator.
 * Shown during `thinking_started` → `thinking_stopped` SSE events.
 * Displays a progres indicator only — not raw reasoning text.
 */
'use client'

interface ThinkingIndicatorProps {
  thinking: boolean
}

export function ThinkingIndicator({ thinking }: ThinkingIndicatorProps) {
  if (!thinking) return null

  return (
    <div className="inline-flex items-center gap-1 px-2 py-1 text-xs text-claude-text-secondary">
      <span className="w-1.5 h-1.5 rounded-full bg-claude-accent animate-bounce [animation-delay:0ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-claude-accent animate-bounce [animation-delay:150ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-claude-accent animate-bounce [animation-delay:300ms]" />
    </div>
  )
}
