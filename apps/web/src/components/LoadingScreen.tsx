import { refresh, useOffice } from '../store';
import { Icon } from './icons';
import { Button } from './ui';

// Tela única enquanto o estado carrega; só revela a UI (escritório e o resto) com tudo pronto.
export function LoadingScreen() {
  const failed = useOffice((s) => s.loadFailed);
  return (
    <div className="grid h-full animate-fade-in place-items-center bg-zinc-50 dark:bg-zinc-950">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className={`grid h-14 w-14 place-items-center rounded-2xl bg-blue-600 text-white shadow-sm shadow-blue-600/25 ${failed ? '' : 'animate-pulse'}`}>
          <Icon name={failed ? 'server' : 'building'} className="h-7 w-7" />
        </span>
        <div>
          <div className="text-base font-semibold">My Local Office</div>
          <div className="mt-1 flex items-center justify-center gap-1.5 text-sm text-zinc-500">
            {failed ? 'Sem conexão com o servidor' : <Loading />}
          </div>
        </div>
        {failed && (
          <Button variant="secondary" size="sm" icon="refresh" onClick={() => void refresh()}>
            Tentar de novo
          </Button>
        )}
      </div>
    </div>
  );
}

// Três pontos que pulsam em sequência: "Carregando…".
function Loading() {
  return (
    <span className="flex items-center gap-1.5">
      Carregando
      <span className="inline-flex gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 dark:bg-zinc-500" style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </span>
    </span>
  );
}
