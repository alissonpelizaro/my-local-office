import { refresh, useOffice } from '../store';
import { Icon } from './icons';
import { Button, Spinner } from './ui';

// Tela única enquanto o estado do escritório carrega; revela a UI só com tudo pronto.
export function LoadingScreen() {
  const failed = useOffice((s) => s.loadFailed);
  return (
    <div className="grid h-full animate-fade-in place-items-center bg-zinc-50 dark:bg-zinc-950">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-600 text-white shadow-sm shadow-blue-600/25">
          <Icon name="building" className="h-7 w-7" />
        </span>
        <div>
          <div className="text-base font-semibold">My Local Office</div>
          <div className="mt-1 flex items-center justify-center gap-1.5 text-sm text-zinc-500">
            <Spinner className="h-3.5 w-3.5" /> {failed ? 'Sem conexão com o servidor' : 'Carregando o escritório…'}
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
