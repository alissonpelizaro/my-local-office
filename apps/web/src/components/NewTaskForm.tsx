import { useState } from 'react';
import { act, api, useOffice } from '../store';
import type { Task } from '../types';
import { Button, Input, Select, Textarea } from './ui';

export function NewTaskForm({ employeeId, onCreated }: { employeeId?: number; onCreated?: (t: Task) => void }) {
  const employees = useOffice((s) => s.state.employees);
  const [target, setTarget] = useState<number | ''>(employeeId ?? '');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const to = employeeId ?? target;

  return (
    <form
      className="grid gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!to || !title.trim()) return;
        const t = await act(() => api<Task>('POST', '/api/tasks', { employeeId: to, title, body }));
        if (t) {
          setTitle('');
          setBody('');
          onCreated?.(t);
        }
      }}
    >
      {employeeId == null && (
        <Select value={target} onChange={(e) => setTarget(e.target.value ? Number(e.target.value) : '')} required>
          <option value="">Para quem?</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </Select>
      )}
      <Input placeholder="O que fazer" value={title} onChange={(e) => setTitle(e.target.value)} required />
      <Textarea rows={3} placeholder="Detalhes, contexto, critério de pronto" value={body} onChange={(e) => setBody(e.target.value)} />
      <Button variant="primary" disabled={!to || !title.trim()}>
        Delegar task
      </Button>
    </form>
  );
}
