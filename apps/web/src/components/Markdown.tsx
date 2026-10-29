import { Fragment, type ReactNode } from 'react';

// Markdown mínimo para respostas dos agentes: código, títulos, listas, citações, tabelas (como texto alinhado),
// `inline`, **negrito** e links. Links só http(s): o texto vem dos agentes.
function inline(text: string): ReactNode[] {
  return text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s<>)]+)/g).map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
      return (
        <code key={i} className="rounded bg-zinc-900/[0.07] px-1 py-px font-mono text-[0.85em] dark:bg-white/10">
          {part.slice(1, -1)}
        </code>
      );
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <b key={i}>{part.slice(2, -2)}</b>;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/) ?? (/^https?:\/\//.test(part) ? [part, part, part] : null);
    if (link)
      return (
        <a key={i} href={link[2]} target="_blank" rel="noreferrer" className="text-blue-600 underline decoration-blue-600/30 underline-offset-2 hover:decoration-blue-600 dark:text-blue-400">
          {link[1]}
        </a>
      );
    return <Fragment key={i}>{part}</Fragment>;
  });
}

type Block = { kind: 'p' | 'h' | 'ul' | 'ol' | 'quote' | 'table' | 'hr' | 'gap'; lines: string[] };

// Linhas consecutivas do mesmo tipo viram um bloco; linha em branco (gap) só separa.
function blocks(text: string): Block[] {
  const out: Block[] = [];
  const push = (kind: Block['kind'], line = '') => {
    const last = out.at(-1);
    if (last?.kind === kind && !['h', 'hr', 'gap'].includes(kind)) last.lines.push(line);
    else out.push({ kind, lines: [line] });
  };
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    let m: RegExpMatchArray | null;
    if (!line.trim()) push('gap');
    else if ((m = line.match(/^#{1,6}\s+(.*)$/))) push('h', m[1]);
    else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) push('hr');
    else if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) push('ul', m[1]);
    else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) push('ol', m[1]);
    else if ((m = line.match(/^>\s?(.*)$/))) push('quote', m[1]);
    else if (/^\s*\|.*\|\s*$/.test(line)) push('table', line);
    else push('p', line);
  }
  return out.filter((b) => b.kind !== 'gap');
}

function Text({ text }: { text: string }) {
  return blocks(text).map((b, i) => {
    switch (b.kind) {
      case 'h':
        return (
          <p key={i} className="mt-1 font-semibold first:mt-0">
            {inline(b.lines[0])}
          </p>
        );
      case 'ul':
      case 'ol': {
        const List = b.kind;
        return (
          <List key={i} className={`grid gap-1 pl-5 ${b.kind === 'ul' ? 'list-disc' : 'list-decimal'} marker:text-zinc-400`}>
            {b.lines.map((l, j) => (
              <li key={j} className="[overflow-wrap:anywhere]">
                {inline(l)}
              </li>
            ))}
          </List>
        );
      }
      case 'quote':
        return (
          <blockquote key={i} className="border-l-2 border-zinc-300 pl-3 text-zinc-600 dark:border-zinc-600 dark:text-zinc-400">
            {b.lines.map((l, j) => (
              <p key={j}>{inline(l)}</p>
            ))}
          </blockquote>
        );
      case 'table':
        return (
          <pre key={i} className="overflow-x-auto rounded-lg bg-zinc-900/[0.04] p-2 font-mono text-xs dark:bg-white/5">
            {b.lines.filter((l) => !/^\s*\|[\s:|-]+\|\s*$/.test(l)).join('\n')}
          </pre>
        );
      case 'hr':
        return <hr key={i} className="border-zinc-200 dark:border-zinc-700" />;
      default:
        return (
          <p key={i} className="whitespace-pre-wrap [overflow-wrap:anywhere]">
            {inline(b.lines.join('\n'))}
          </p>
        );
    }
  });
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="grid gap-2">
      {text.split(/```[\w-]*\n?/).map((chunk, i) =>
        i % 2 ? (
          <pre key={i} className="overflow-x-auto rounded-lg bg-zinc-900 p-3 font-mono text-xs leading-relaxed text-zinc-100 dark:bg-black/50">
            {chunk.replace(/\n$/, '')}
          </pre>
        ) : (
          chunk.trim() && <Text key={i} text={chunk.trim()} />
        ),
      )}
    </div>
  );
}
