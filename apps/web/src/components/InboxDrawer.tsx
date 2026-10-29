import { setInbox, useOffice } from '../store';
import { ApprovalCard } from './ApprovalCard';
import { Icon } from './icons';
import { Button, Empty, Modal } from './ui';

// Gaveta lateral com todos os pedidos aguardando o chefe, de qualquer funcionário.
export function InboxDrawer() {
  const open = useOffice((s) => s.inbox);
  const approvals = useOffice((s) => s.state.approvals);

  return (
    <Modal open={open} onClose={() => setInbox(false)} kind="drawer">
      <div className="flex h-full flex-col bg-white shadow-2xl dark:bg-zinc-950">
        <header className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <Icon name="bell" className="h-4.5 w-4.5" />
          <h2 className="font-semibold">Pedidos</h2>
          {approvals.length > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">{approvals.length}</span>}
          <Button variant="ghost" size="icon" icon="x" className="ml-auto" onClick={() => setInbox(false)} aria-label="Fechar" />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {approvals.length === 0 ? (
            <Empty icon="✅" title="Nada aguardando">Quando um funcionário precisar de permissão, resposta ou aprovar uma delegação, aparece aqui.</Empty>
          ) : (
            <div className="grid gap-3">
              {approvals.map((a) => (
                <div key={a.id} className="animate-rise">
                  <ApprovalCard approval={a} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
