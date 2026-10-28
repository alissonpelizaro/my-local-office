import { Fragment, type ReactNode } from 'react';

// Markdown mínimo para respostas dos agentes: blocos de código, `inline`, **negrito** e listas como texto.
function inline(text: string): ReactNode[] {
  return text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g).map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
      return (
        <code key={i} className="rounded bg-zinc-200/70 px-1 py-px font-mono text-[0.85em] dark:bg-zinc-800">
          {part.slice(1, -1)}
        </code>
      );
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <b key={i}>{part.slice(2, -2)}</b>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="grid gap-2">
      {text.split(/```[\w-]*\n?/).map((chunk, i) =>
        i % 2 ? (
          <pre key={i} className="overflow-x-auto rounded-md bg-zinc-900 p-2 font-mono text-xs text-zinc-100">
            {chunk.replace(/\n$/, '')}
          </pre>
        ) : (
          chunk.trim() && (
            <p key={i} className="whitespace-pre-wrap [overflow-wrap:anywhere]">
              {inline(chunk.trim())}
            </p>
          )
        ),
      )}
    </div>
  );
}
