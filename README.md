# My Local Office

Escritório virtual local: um agente Claude Code por repositório, agrupados em departamentos. Os agentes se consultam, delegam tasks entre si e pedem permissão ao chefe (você) pela UI. Você assiste tudo num escritório isométrico. Plano completo e fases em [PLAN.md](PLAN.md).

## Rodando

Pré-requisitos: Node 22.18+ (`.tool-versions`), pnpm, Claude Code logado (`claude auth status`).

```bash
pnpm install
pnpm build        # gera apps/web/dist
pnpm start        # http://127.0.0.1:4410 (server + UI)
```

Sempre ligado (sobe no login, reinicia se cair): `pnpm install-service`. Para remover: `pnpm uninstall-service`. Os logs ficam em `data/office.log`.

Desenvolvimento: `pnpm dev` sobe o server com `--watch` e o Vite em http://127.0.0.1:5173 (com proxy para `/api`). Cada restart do server pelo watch derruba as execuções em andamento.

Primeiro uso: **Configuração → Importar repositórios** aponta para `~/webprojects`, sugere o departamento de cada repo e contrata os escolhidos. Cada contratado faz um onboarding rápido que escreve a própria ficha.

O console antigo (F0) continua em `/console`.

| Variável | Padrão | |
|---|---|---|
| `OFFICE_PORT` | `4410` | |
| `OFFICE_DATA` | `./data` | SQLite e chaves, pasta `0700`, fora do git |
| `OFFICE_MAX_CONCURRENT` | `3` | valor inicial; depois é editável na UI |
| `OFFICE_DELEGATION_APPROVAL` | `1` | valor inicial; depois é editável na UI |
| `OFFICE_CLAUDE_BIN` | `claude` | |
| `OFFICE_HOST` | `127.0.0.1` | `0.0.0.0` abre para a rede local; exige `OFFICE_TOKEN` |
| `OFFICE_TOKEN` | | 16+ caracteres. Em outro dispositivo, abra `http://<ip>:4410/?token=<token>` uma vez (vira cookie). Localhost não pede token |

Acesso pela rede: `OFFICE_HOST=0.0.0.0 OFFICE_TOKEN=$(openssl rand -hex 16) pnpm install-service`. Quem tem o token roda agentes na sua máquina: só em rede confiável.

```bash
pnpm test         # política de permissões e ponte OpenAI
pnpm typecheck
```

## Como funciona

- **Funcionário**: um repo git. Cada task é um processo `claude -p` (stream-json) com `cwd` no repo. Herda `~/.claude/CLAUDE.md`, o `CLAUDE.md` do repo, as skills e as allowlists do settings.
- **MCP `office`** (`/mcp`, autenticado por token de execução):
  - `directory`
  - `ask_colleague`: consulta read-only no repo do colega
  - `delegate_task`: precisa de aprovação
  - `ask_boss`
  - `approve`: permission prompt tool
- **Permissões**: o que o settings não libera vira um "!" sobre o funcionário e um pedido na UI. Ações externas (`git push`, `gh pr review/merge`, docker…) sempre perguntam.
- **Provedores**: cada funcionário usa a assinatura nativa ou um provedor remoto.
  - Anthropic-compatível: direto. Prefira este formato quando o provedor oferecer (LiteLLM, Ollama), porque a ponte OpenAI perde o prompt caching.
  - OpenAI-compatível: via ponte em `/bridge/:id`.
  - Ollama local: botão **Ollama local** em Provedores. O Claude Code precisa de uns 64K de contexto, então suba o Ollama com `OLLAMA_CONTEXT_LENGTH=65536` e use o mesmo valor em "Janela de contexto". Execuções locais custam $0 na aba Custos.
  - O cadastro sugere os modelos que o provedor anuncia em `/models`.
- **Consumo de tokens**:
  - Conversas são compactadas pelo Claude Code ao passar de **Compactar conversa acima de** (200K por padrão, via `CLAUDE_CODE_AUTO_COMPACT_WINDOW`). Com provedor, vale a menor entre essa e a janela do provedor. A compactação aparece no chat.
  - Consultas entre colegas usam o **Modelo das consultas** (sonnet), não o do colega, com esforço `low`.
  - **Conectores e MCPs** (por funcionário, desligado por padrão): os conectores do claude.ai (Slack, Drive, Jira…) e os MCPs do usuário e do repo somam ~50K tokens de tools a cada chamada. Desligado, o processo sobe com `--strict-mcp-config` e só enxerga o MCP `office`. Consultas e onboarding nunca carregam.
  - **Esforço** (`--effort` low…max): padrão do escritório e por funcionário. Vazio deixa o Claude Code decidir. Onboarding não usa.
- **Conversas**: clicar num funcionário abre um chat.
  - Cada mensagem é um turno que retoma a mesma sessão do Claude (`--resume`), na mesma pasta onde a conversa começou. Se o worktree tiver sido descartado, é recriado no mesmo caminho.
  - Durante um turno, a mensagem entra na hora (stdin).
  - A aba Sessões lista as conversas do escritório e as sessões do Claude Code abertas fora dele (terminal, VS Code) no repo. Essas são retomadas com `--fork-session`, então a original não muda.
- **Tarefas agendadas e recorrentes**: em **Nova tarefa** (botão no topo ou tecla `N`), escolha Agora, Agendar ou Repetir (ex.: a cada 15 min, a partir de agora).
  - Cada execução da série, ao entrar na fila, já deixa a próxima agendada no mesmo ritmo. Por isso a série sobrevive a um restart; horários perdidos são pulados, não acumulados.
  - Se a execução anterior ainda estiver na fila, o horário é pulado.
  - A série inteira fica numa conversa só, com sessão nova a cada execução. Para encerrar, cancele a agendada ("Encerrar série").
  - Só notifica no macOS quando uma execução falha.
  - **Pré-checagem** (opcional): comando de shell que roda no repo antes de cada execução. Sem saída, a execução termina como "nada a fazer" sem chamar o agente; com saída, ela é anexada ao prompt. Saída com código ≠ 0 conta como falha. Bom para polling (PRs, filas, alertas): só gasta tokens quando há o que fazer.
- **Atalhos**: `N` nova tarefa (para o funcionário aberto, se houver), `⌘K` busca funcionários, tarefas e ações, `Esc` fecha o painel.
- **Instruções**: o Claude Code carrega o `~/.claude/CLAUDE.md` e o `CLAUDE.md` do repo sozinho. O `AGENTS.md` da raiz do repo vai no system prompt (tasks e consultas), a menos que o `CLAUDE.md` já importe com `@AGENTS.md`.
- **Modelos**: a lista mostra os aliases (opus/sonnet/haiku, que acompanham a versão mais nova) com a versão real de hoje e as versões fixas. A versão vem do `init` do CLI, com o processo encerrado antes da chamada à API.
- **Worktrees**: por funcionário, as tasks rodam na cópia principal ou sempre num worktree isolado (`data/worktrees/`). Com `max_parallel` > 1, as extras rodam em worktrees. Worktree sem mudanças é descartado sozinho; com trabalho, aparece na task para você revisar e remover.
- **Custos**: cada execução (task, consulta, onboarding) é gravada em `usage`. A aba Custos mostra por dia, departamento e funcionário. Na assinatura é o equivalente em preço de API.
- **Notificações**: pedidos de permissão/pergunta/delegação e fim de task viram notificação do macOS (configurável).
- **Fichas**: refeitas sozinhas (haiku) quando o repo anda N commits desde o onboarding. Fichas editadas à mão não são tocadas.
- **Eventos**: tudo vai para a tabela `events` e é transmitido por SSE (`/api/events`). O escritório anima ao vivo e o replay de qualquer task reusa a mesma timeline.

| Pasta | |
|---|---|
| `apps/server/src` | `runner.ts` (CLI), `mcp.ts`, `office.ts` (tasks, aprovações, consultas), `policy.ts`, `importer.ts`, `bridge.js` |
| `apps/web/src` | `store.ts` (estado + SSE + replay), `components/` (painéis), `office/` (planta isométrica e cena Phaser) |
