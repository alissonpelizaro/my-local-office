import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { initials, STATUS, WORKING } from '../format';
import type { Activity, TaskStatus } from '../types';
import { Icon, type IconName } from './icons';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ---------- botões ----------

const BUTTON = {
  primary: 'bg-blue-600 text-white shadow-sm shadow-blue-600/25 hover:bg-blue-500 dark:shadow-none',
  secondary:
    'border border-zinc-200 bg-white text-zinc-800 shadow-xs hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700/80 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-600 dark:hover:bg-zinc-800',
  ghost: 'text-zinc-600 hover:bg-zinc-900/5 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/8 dark:hover:text-zinc-100',
  danger: 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/60',
  solidDanger: 'bg-red-600 text-white shadow-sm shadow-red-600/25 hover:bg-red-500',
};
const SIZE = { sm: 'h-7 gap-1 px-2.5 text-xs', md: 'h-9 gap-1.5 px-3.5 text-sm', icon: 'h-8 w-8', iconSm: 'h-7 w-7' };

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON; size?: keyof typeof SIZE; icon?: IconName; busy?: boolean };

export function Button({ variant = 'secondary', size = 'md', icon, busy, className, children, disabled, ...p }: ButtonProps) {
  return (
    <button
      disabled={disabled || busy}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap transition duration-150 select-none active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
        BUTTON[variant],
        SIZE[size],
        className,
      )}
      {...p}
    >
      {busy ? <Spinner className="h-3.5 w-3.5" /> : icon && <Icon name={icon} className={size === 'sm' || size === 'iconSm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />}
      {children}
    </button>
  );
}

// Ação destrutiva em dois cliques: o primeiro arma, o segundo confirma (desarma sozinho).
export function ConfirmButton({ confirm, onConfirm, children, ...p }: Omit<ButtonProps, 'onClick'> & { confirm: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Button {...p} variant={armed ? 'solidDanger' : 'danger'} onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))} onBlur={() => setArmed(false)}>
      <span key={String(armed)} className="animate-fade-in">
        {armed ? confirm : children}
      </span>
    </Button>
  );
}

export const Kbd = ({ children, className }: { children: ReactNode; className?: string }) => (
  <kbd
    className={cx(
      'inline-flex h-5 min-w-5 items-center justify-center rounded border border-current/20 px-1 font-sans text-[10px] font-medium opacity-70',
      className,
    )}
  >
    {children}
  </kbd>
);

// ---------- campos ----------

const FIELD =
  'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-xs outline-none transition placeholder:text-zinc-400 hover:border-zinc-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 disabled:opacity-60 dark:border-zinc-700/80 dark:bg-zinc-900 dark:placeholder:text-zinc-500 dark:hover:border-zinc-600';

export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input className={cx(FIELD, className)} {...p} />;
export const Textarea = ({ className, ref, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: React.Ref<HTMLTextAreaElement> }) => (
  <textarea ref={ref} className={cx(FIELD, 'resize-none', className)} {...p} />
);
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select className={cx(FIELD, 'cursor-pointer pr-8', className)} {...p} />;

// group: o conteúdo são botões (chips, segmentado). Num <label>, clicar no rótulo acionaria o primeiro deles.
export function Field({ label, children, hint, className, group }: { label: string; children: ReactNode; hint?: ReactNode; className?: string; group?: boolean }) {
  const Tag = group ? 'div' : 'label';
  return (
    <Tag className={cx('grid content-start gap-1.5 text-sm', className)}>
      <span className="font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      {children}
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </Tag>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-50',
        checked ? 'bg-blue-600' : 'bg-zinc-300 dark:bg-zinc-700',
      )}
    >
      <span
        className={cx(
          'h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-300 ease-[var(--ease-spring)]',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

// Número com − e +; digitar confirma ao sair do campo.
export function Stepper({ value, onChange, min = 0, max = 999, step = 1 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = (v: number) => {
    const n = Math.min(max, Math.max(min, Number.isFinite(v) ? Math.round(v) : value));
    setDraft(String(n));
    if (n !== value) onChange(n);
  };
  return (
    <div className="inline-flex h-9 items-center rounded-lg border border-zinc-200 bg-white shadow-xs dark:border-zinc-700/80 dark:bg-zinc-900">
      <button type="button" aria-label="Diminuir" disabled={value <= min} onClick={() => commit(value - step)} className="grid h-full w-8 place-items-center text-zinc-500 transition hover:text-zinc-900 active:scale-90 disabled:opacity-30 dark:hover:text-zinc-100">
        <Icon name="minus" className="h-3.5 w-3.5" />
      </button>
      <input
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
        onBlur={() => commit(Number(draft))}
        onKeyDown={(e) => e.key === 'Enter' && commit(Number(draft))}
        className="w-10 bg-transparent text-center text-sm font-medium tabular-nums outline-none"
      />
      <button type="button" aria-label="Aumentar" disabled={value >= max} onClick={() => commit(value + step)} className="grid h-full w-8 place-items-center text-zinc-500 transition hover:text-zinc-900 active:scale-90 disabled:opacity-30 dark:hover:text-zinc-100">
        <Icon name="plus" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// Abas/escolha única com indicador que desliza até a opção ativa.
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  className,
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; icon?: IconName; count?: number; title?: string }[];
  className?: string;
  size?: 'sm' | 'md';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ x: number; w: number } | null>(null);
  // Sem dependências: rótulos e contadores mudam a largura; só atualiza quando mexeu de fato.
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (el && (el.offsetLeft !== box?.x || el.offsetWidth !== box?.w)) setBox({ x: el.offsetLeft, w: el.offsetWidth });
  });
  useEffect(() => {
    const ro = new ResizeObserver(() => setBox(null));
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} role="tablist" className={cx('relative inline-flex items-center rounded-xl bg-zinc-900/[0.06] p-1 dark:bg-white/[0.06]', className)}>
      {box && (
        <span
          aria-hidden
          className="absolute top-1 bottom-1 left-0 rounded-lg bg-white shadow-sm ring-1 ring-zinc-900/5 transition-[transform,width] duration-300 ease-[var(--ease-out-expo)] dark:bg-zinc-700/90 dark:ring-white/5"
          style={{ transform: `translateX(${box.x}px)`, width: box.w }}
        />
      )}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cx(
              'relative z-10 inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors duration-200',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm',
              on ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200',
            )}
          >
            {o.icon && <Icon name={o.icon} className="h-4 w-4" />}
            {o.label}
            {o.count ? (
              <span
                key={o.count}
                className={cx('animate-pop rounded-full px-1.5 text-[10px] leading-4 tabular-nums', on ? 'bg-blue-600 text-white' : 'bg-zinc-900/10 dark:bg-white/10')}
              >
                {o.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// ---------- superfícies ----------

export function Card({ title, actions, children, className, description }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; description?: ReactNode }) {
  return (
    <section className={cx('rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60', className)}>
      {(title || actions) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-zinc-500">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function SettingRow({ title, description, children }: { title: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3.5 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1 basis-60">
        <div className="text-sm font-medium">{title}</div>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const TONES = {
  default: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  red: 'bg-red-100 text-red-700 dark:bg-red-950/70 dark:text-red-300',
  green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300',
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-950/70 dark:text-violet-300',
};
export type Tone = keyof typeof TONES;

export function Chip({ children, tone = 'default', className, icon }: { children: ReactNode; tone?: Tone; className?: string; icon?: IconName }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', TONES[tone], className)}>
      {icon && <Icon name={icon} className="h-3 w-3" />}
      {children}
    </span>
  );
}

export const Dot = ({ color, className }: { color: string; className?: string }) => (
  <span className={cx('inline-block h-2.5 w-2.5 shrink-0 rounded-full', className)} style={{ background: color }} />
);

// Ponto de status; trabalhando/esperando ganham uma onda pulsando.
export function Pulse({ tone, className }: { tone: 'blue' | 'amber' | 'green' | 'zinc' | 'violet' | 'red'; className?: string }) {
  const bg = { blue: 'bg-blue-500', amber: 'bg-amber-500', green: 'bg-emerald-500', zinc: 'bg-zinc-400', violet: 'bg-violet-500', red: 'bg-red-500' }[tone];
  return (
    <span className={cx('relative inline-flex h-2 w-2 shrink-0', className)}>
      {tone !== 'zinc' && <span className={cx('absolute inset-0 animate-ping-soft rounded-full', bg)} />}
      <span className={cx('relative inline-flex h-2 w-2 rounded-full', bg)} />
    </span>
  );
}

export const activityTone = (a: Activity) => (a === 'waiting' ? 'amber' : a === 'onboarding' ? 'violet' : WORKING.has(a) ? 'blue' : 'zinc');

export function Avatar({ name, color, size = 'md', activity }: { name: string; color: string; size?: 'xs' | 'sm' | 'md' | 'lg'; activity?: Activity }) {
  const s = { xs: 'h-5 w-5 text-[9px]', sm: 'h-7 w-7 text-[10px]', md: 'h-9 w-9 text-xs', lg: 'h-11 w-11 text-sm' }[size];
  return (
    <span className="relative inline-flex shrink-0">
      <span
        className={cx('inline-grid place-items-center rounded-full font-semibold text-white shadow-sm ring-2 ring-white dark:ring-zinc-900', s)}
        style={{ background: `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 60%, black))` }}
      >
        {initials(name)}
      </span>
      {activity && activity !== 'idle' && size !== 'xs' && <Pulse tone={activityTone(activity)} className="absolute -right-0.5 -bottom-0.5 ring-2 ring-white dark:ring-zinc-900 rounded-full" />}
    </span>
  );
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx('shrink-0 animate-spin', className)} fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

const STATUS_ICON: Record<TaskStatus, { icon?: IconName; className: string }> = {
  running: { className: 'text-blue-600 dark:text-blue-400' },
  pending_approval: { icon: 'lock', className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  queued: { icon: 'clock', className: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400' },
  scheduled: { icon: 'calendar', className: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300' },
  paused: { icon: 'pause', className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  done: { icon: 'check', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  failed: { icon: 'x', className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
  cancelled: { icon: 'minus', className: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400' },
};

export function StatusIcon({ status, repeat }: { status: TaskStatus; repeat?: boolean }) {
  const s = STATUS_ICON[status];
  const icon = repeat && status === 'scheduled' ? 'repeat' : s.icon;
  return (
    <span title={STATUS[status].label} className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-full', s.className)}>
      {icon ? <Icon name={icon} className="h-4 w-4" /> : <Spinner className="h-5 w-5" />}
    </span>
  );
}

export function Empty({ icon, title, children, action }: { icon?: string; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  if (!title && !icon) return <p className="py-2 text-sm text-zinc-500">{children}</p>;
  return (
    <div className="grid animate-fade-in justify-items-center gap-2 px-4 py-10 text-center">
      {icon && <div className="mb-1 grid h-12 w-12 place-items-center rounded-2xl bg-zinc-900/5 text-2xl dark:bg-white/5">{icon}</div>}
      {title && <div className="text-sm font-semibold">{title}</div>}
      {children && <p className="max-w-xs text-sm text-zinc-500">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cx('relative overflow-hidden rounded-lg bg-zinc-200/70 dark:bg-zinc-800/70', className)}>
    <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/50 to-transparent dark:via-white/5" />
  </div>
);

// "Salvo ✓" que aparece e some sozinho a cada salvamento.
export const Saved = ({ at }: { at: number }) =>
  at ? (
    <span key={at} className="inline-flex animate-flash items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
      <Icon name="check" className="h-3.5 w-3.5" /> Salvo
    </span>
  ) : null;

// ---------- diálogos (dialog nativo: foco preso, Esc e camada de topo de graça) ----------

export function Modal({ open, onClose, children, className, kind = 'modal' }: { open: boolean; onClose: () => void; children: ReactNode; className?: string; kind?: 'modal' | 'top' | 'drawer' }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open) {
      d.removeAttribute('data-closing');
      if (!d.open) d.showModal();
      return;
    }
    if (!d.open) return setMounted(false);
    // Fecha depois da animação de saída (com rede de segurança se ela não rodar).
    d.setAttribute('data-closing', '');
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      d.close();
      setMounted(false);
    };
    const onEnd = (e: AnimationEvent) => e.target === d && finish();
    d.addEventListener('animationend', onEnd);
    const t = setTimeout(finish, 400);
    return () => {
      d.removeEventListener('animationend', onEnd);
      clearTimeout(t);
    };
  }, [open, mounted]);

  if (!mounted) return null;
  return (
    <dialog
      ref={ref}
      className={cx(kind === 'drawer' ? 'drawer' : kind === 'top' ? 'modal top' : 'modal', className)}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // Clique no fundo (fora do conteúdo) fecha.
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      {children}
    </dialog>
  );
}

export function useNow(ms = 30_000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
