# My Local Office — Plano

Escritório virtual local: cada repo tem um agente (funcionário) especializado, agrupados em departamentos (projetos). Os agentes conversam entre si quando precisam de contexto de outro repo. Você assiste tudo numa visão "God mode" no estilo simulação de escritório, delega tasks e aprova ou nega permissões pela UI. Um departamento de Comunicação monitora Slack e e-mail e propõe encaminhar solicitações ao funcionário certo.

## Decisões

| Tema | Decisão |
|---|---|
| Runner | **Claude Code CLI headless** (`claude -p`, stream-json). Usa o login da assinatura Claude, como você faria no terminal. |
| Provedor | Por funcionário: **nativo** (assinatura Anthropic) ou **remoto customizado**. Remoto pode ser Anthropic-compatível ou OpenAI-compatível (ex. `dta-proxy`), com base URL, chave e modelos configuráveis. |
| Comunicação | Agente roda **via Claude Code CLI**. Gmail (Google Workspace, API com escopo read-only) e Slack (app próprio, user token) entram como tools **somente leitura do MCP `office`**. Os conectores claude.ai **não carregam em `claude -p`** (validado no F0), por isso o acesso fica com o server. |
| Monnif | `monnif` e `monnif-assistente` = **um** funcionário (`~/webprojects/monnif`). Tasks paralelas usam worktree. |

## Conceitos

| Office | Sistema |
|---|---|
| Departamento | Projeto (LYNN, Monnif) ou função (Comunicação) |
| Funcionário | Agente ligado a 1 repo (`cwd`), 1 processo `claude -p` por task |
| Ficha | Resumo do repo (propósito, stack, `git remote`, integrações), gerado no onboarding. Usado para roteamento |
| Sala do Chefe | Você: delega, aprova, responde perguntas |

## Arquitetura

```
┌──────────────────── Browser (localhost) ────────────────────┐
│ Office View (Phaser)        │ Painéis (React): Config,      │
│ salas = departamentos       │ Tasks, Aprovações, Chat/Log   │
└──────────────▲──────────────┴───────────────┬───────────────┘
               │ SSE (eventos)                │ REST (comandos)
┌──────────────┴──────────────────────────────▼───────────────┐
│                Office Server (Node 22, local)               │
│  Registry · Task Queue · Orchestrator · Approval Broker      │
│  Event Bus → SQLite (estado + timeline)                     │
│  /mcp  MCP "office" (HTTP): approve, directory,             │
│        ask_colleague, delegate_task, ask_boss               │
│  /bridge/:provider  ponte Anthropic ↔ OpenAI                │
└──────┬───────────────┬───────────────┬──────────────────────┘
       │ claude -p     │ claude -p     │ claude -p (tools inbox_* read-only)
  ┌────▼─────┐    ┌────▼─────┐    ┌────▼──────────┐     ┌──────────────────┐
  │ dta-base │ …  │ monnif   │    │ Comunicação   │ ◀── │ Ingest no server │
  │ cwd=repo │    │ cwd=repo │    │ (triagem)     │     │ Gmail API, Slack │
  └──────────┘    └──────────┘    └───────────────┘     └──────────────────┘
```

### Runner (Claude Code CLI)

Cada task sobe um processo, com `cwd` = repo do funcionário:

```
claude -p --input-format stream-json --output-format stream-json --verbose \
  --mcp-config '{"mcpServers":{"office":{"type":"http","url":"http://127.0.0.1:<port>/mcp","headers":{"Authorization":"Bearer <run-token>"}}}}' \
  --permission-prompt-tool mcp__office__approve \
  --append-system-prompt "<persona + regras do office>" \
  [--model sonnet] [--resume <session>]
```

- O agente herda o `~/.claude/CLAUDE.md` (regras de git, sem co-author), o `CLAUDE.md`/`.claude/SERVICE.md` do repo, as skills e as allowlists de `.claude/settings.local.json`. Ou seja, trabalha igual a você no repo.
- O **run token** identifica funcionário, task e profundidade da consulta em cada chamada ao MCP. Também impede que outro processo local use o MCP.
- O stdout (stream-json) vira eventos: `init` → session id, `tool_use` → atividade (lendo, digitando, rodando…), `result` → custo e resultado.
- O stdin aberto permite mandar mensagem para o funcionário no meio da task ("tocar no ombro").
- **Lazy**: funcionário ocioso não tem processo nem custo. Há um limite global de execuções simultâneas.
- **Área de trabalho**: cada funcionário tem `isolation` (cópia principal ou sempre worktree) e `max_parallel`.
  - Task que não cabe na cópia principal roda num `git worktree` com HEAD destacado, em `data/worktrees/`.
  - Worktree limpo é descartado ao fim da task; com trabalho, fica até o chefe remover. A remoção é sem `--force`.
  - Continuação de task volta para a mesma pasta, porque a sessão do Claude é guardada por pasta.

### Provedores

| Tipo | Env do processo `claude` |
|---|---|
| Nativo | Remove `ANTHROPIC_*` herdado → usa o login claude.ai. Modelo via `--model` (opus/sonnet/haiku). |
| Remoto Anthropic-compatível | `ANTHROPIC_BASE_URL=<base sem /v1>`, `ANTHROPIC_AUTH_TOKEN=<chave>`, aliases opus/sonnet/haiku → modelo do provedor |
| Remoto OpenAI-compatível | `ANTHROPIC_BASE_URL=http://127.0.0.1:<port>/bridge/<id>`. A ponte traduz Messages ↔ Chat Completions com streaming e tools (portada do `local-llm-hub/lib/bridge.js`). |

Ex.: `dta-proxy` (LiteLLM) como OpenAI-compatível em `https://proxy.lynn.totvs.ai/v1`. O LiteLLM também expõe `/v1/messages`, então pode ser cadastrado como Anthropic-compatível, sem ponte.

Provedores são cadastrados no painel. A chave fica em `data/` (pasta `0700`, fora do git) e nunca volta para a UI. Cada funcionário escolhe nativo ou um provedor.

### Protocolo entre agentes (MCP `office`)

| Tool | Semântica |
|---|---|
| `directory()` | Lista departamentos, funcionários e fichas. Base para o agente saber a quem perguntar. |
| `ask_colleague(to, question)` | Síncrona. Sobe uma **consulta read-only** no repo do destino (`--tools Read,Grep,Glob`) com a persona dele e devolve a resposta. Não interrompe a task em andamento do colega. Tem limite de saltos (2), detecção de ciclo e timeout. |
| `delegate_task(to, title, description)` | Assíncrona. Cria uma task para outro funcionário, que precisa da sua aprovação (configurável). |
| `ask_boss(question, options?)` | Bloqueia o agente até você responder pela UI. |
| `approve` | Permission prompt tool, interno (ver Permissões). |

A consulta é read-only de propósito: pergunta nunca vira alteração cruzada. Mudança em outro repo só acontece via `delegate_task`, e o dono do repo executa.
Exemplo: o funcionário do `ai-flow` altera uma feature, consulta o do `dta-agent-engine` ("isso já existe no origin/main?") e, se existir, delega o port.

### Permissões

Fluxo: regras do settings (allow/deny) decidem primeiro. O que sobra chega em `mcp__office__approve` → Approval Broker. A política do funcionário decide ou pergunta. Quando pergunta: evento `approval.requested` → balão "!" + item na inbox → você escolhe **Permitir / Negar (com motivo) / Sempre permitir** → a tool devolve `{"behavior":"allow"|"deny"}` e o agente segue.

| Nível | Ações |
|---|---|
| Auto | O que o settings do repo/usuário já permite. Regras "sempre permitir" salvas no funcionário. Edit/Write no próprio repo quando `auto_edit` está ligado. |
| Perguntar | O resto |
| Sempre perguntar (não aceita "sempre permitir") | Ações externas: `git push`, `gh pr review/merge/comment/create`, docker/kubectl/gcloud, envio de Slack/e-mail |
| Negar | Qualquer tool em consulta (`ask_colleague`) e onboarding, que são read-only |

### Departamento de Comunicação

1. **Ingest**: o server busca o que é novo desde o último checkpoint e guarda em `inbox_items`. Fontes: Gmail API `history.list`/`messages.get` com OAuth desktop e escopo `gmail.readonly`, e Slack Web API (`search.messages`, `conversations.history`) com user token de um app próprio. Cobre DMs, menções, canais escolhidos e uma query do Gmail. Os tokens ficam em `data/`.
   A cada lote, o server roda `claude -p` (agente Comunicação, `--tools ""`) só com tools read-only do MCP `office` (`inbox_list`, `inbox_get`, `directory`) e `--json-schema` para saída estruturada.
2. **Triagem**, na mesma execução: é uma solicitação para mim? Tipo (review de PR, bug, dúvida, pedido de info, FYI), urgência e prazo.
3. **Roteamento** no server, determinístico primeiro: URL de PR/issue é casada com o `git remote` dos funcionários, e nome de serviço citado com as fichas. Se nada casar, o LLM decide usando o `directory`.
4. **Proposta**: card na inbox, e o mensageiro leva um envelope até a Sala do Chefe:
   "Fulano pediu review do PR #123 (totvs-ai/dta-base). Enviar ao funcionário dta-base?" **[Enviar] [Editar] [Ignorar] [Eu respondo]**
5. **Pós-task**: rascunho de resposta, sempre com aprovação. Pede escopos de escrita separados (`gmail.compose`, `chat:write`) e só depois de o fluxo de leitura estar validado.

**Segurança**: conteúdo de Slack/e-mail é dado não confiável (risco de prompt injection). A execução da Comunicação não tem Bash/Edit/Write nem tools de envio e roda fora dos repos. A task gerada leva a mensagem original citada como dado, nunca como instrução.

### Office View

- Phaser 3 em isométrico. As salas são geradas a partir da config, e o grid de mesas cresce com o nº de funcionários (LYNN ~15).
- Arte procedural (Graphics: piso, paredes cortadas, mesas, monitores, bonecos), sem assets externos. Dá para trocar por sprites depois.
- Balões mostram o texto truncado. Resumo por Haiku fica para a F5.
- Interações: clicar no funcionário abre o painel (task atual, log ao vivo, chat, delegar). Arrastar uma task até um funcionário delega. Clicar no "!" abre a aprovação.
- Timeline: replay dos eventos de qualquer task.

| Evento | Animação |
|---|---|
| Ocioso | Café, sofá, anda pela sala |
| Read/Grep/Glob | Lendo na mesa ou na estante |
| Edit/Write | Digitando |
| Bash | Olhando o monitor, ícone de engrenagem |
| `ask_colleague` | Caminha até a mesa do colega (atravessa o corredor se for de outro depto), balão com a pergunta, colega responde com balão |
| `delegate_task` | Entrega um papel ao colega |
| Aprovação pendente | Para, balão "!" vermelho |
| `ask_boss` | Balão "?" |
| Task concluída | ✓ verde, comemora |
| Erro | Nuvem cinza |
| Proposta da Comunicação | Mensageiro leva envelope até a Sala do Chefe |

### Painel de Configuração

- **Departamentos**: CRUD com nome, cor e tipo (repo / comunicação).
- **Novo funcionário**: escolher a pasta → validar git → ler `git remote` → **onboarding**: execução read-only (haiku) lê README/CLAUDE.md/SERVICE.md e escreve a ficha (editável). O funcionário aparece na sala pronto para receber tasks.
- **Importar em lote**: apontar para `~/webprojects`, listar repos e agrupar pela org do remote (`totvs-ai/*` → LYNN, `alissonpelizaro/monnif*` → Monnif). Remotes repetidos viram um funcionário só.
- **Por funcionário**: nome, provedor (nativo/remoto), modelo, `auto_edit`, regras "sempre permitir".
- **Provedores**: nome, formato (anthropic/openai), base URL, chave, modelo e modelo leve.
- **Comunicação**: fontes (canais Slack, query Gmail), intervalo.
- **Global**: máximo de execuções simultâneas, se delegação agente→agente exige aprovação.

## Modelo de dados (SQLite, `node:sqlite`)

- `departments` (id, name, color, kind)
- `providers` (id, name, format, base_url, api_key, model, small_model)
- `employees` (id, department_id, name, repo_path, git_remote, profile, provider_id, model, auto_edit, allow_rules)
- `tasks` (id, employee_id, origin: user|agent|comms, from_employee_id, title, body, status: pending_approval|queued|running|done|failed|cancelled, result, cost_usd, session_id)
- `approvals` (id, employee_id, task_id, kind: tool|delegation|question, payload, status, answer)
- `inbox_items` (F4) (id, source, external_id, author, text, url, classification, approval_id)
- `events` (id, ts, type, employee_id, task_id, data): append-only, alimenta UI e replay

## Stack

Monorepo pnpm, mesmo padrão do Monnif:

- `apps/server`: Node 22 rodando TS direto (type stripping), sem framework: `node:http`, `node:sqlite`, SSE, MCP HTTP mínimo (JSON-RPC), ponte do local-llm-hub.
- `apps/web`: Vite + React 19 + Phaser 3.90 + Tailwind 4 + Zustand. Componentes próprios pequenos, sem shadcn. Os tipos da API ficam espelhados em `src/types.ts`, sem pacote compartilhado.

Server só escuta em `127.0.0.1` e valida `Host`/`Origin`, porque ele executa agentes na sua máquina e precisa barrar DNS rebinding e CSRF. Para ficar sempre ligado (necessário para a Comunicação), usar um LaunchAgent, como no local-llm-hub.

## Fases

| Fase | Entrega | Status |
|---|---|---|
| **F0 Spike + base** | Server, SQLite, eventos SSE, runner CLI, MCP `office` (approve, directory, ask_colleague, delegate_task, ask_boss), provedores + ponte, onboarding de ficha, console web mínimo. | ✅ validado com assinatura nativa: onboarding, `ask_colleague` ai-flow → dta-agent-engine, `ask_boss`, permissão allow/deny segurada 2,5 min. Falta testar provedor remoto. |
| **F1 Core** | Mensagem no meio da task, retomar sessão (follow-up com `--resume`), importação em lote, settings globais na UI, testes. | ✅ Importação sugere departamento pela org do remote e junta clones do mesmo remote. Política de permissão com testes. |
| **F2 UI funcional** | `apps/web`: config, board de tasks, inbox de aprovações, chat/log por funcionário. | ✅ |
| **F3 Office View** | Mapa, salas dinâmicas, avatares, animações, balões, replay. | ✅ Validado com replay das tasks reais do F0: visita + balões entre colegas, "!" e pilha na mesa do chefe. |
| **F4 Comunicação** | Ingest (Gmail API + app Slack), triagem, roteamento, propostas, rascunho de resposta. | adiada |
| **F5 Polimento** | Worktree por task, custo por funcionário/depto, notificações macOS, LaunchAgent, fichas auto-atualizadas, shutdown limpo. | ✅ Validado no sandbox: 2 tasks em paralelo (repo + worktree), follow-up retomando sessão no worktree, worktree limpo descartado, remoção recusada com arquivo não commitado, filhos `claude` encerrados com o server. LaunchAgent escrito, não instalado. |

### Depois do F5

- **Conversas por funcionário** (chat no painel) com sessões salvas e retomáveis, incluindo sessões do Claude Code abertas fora do escritório (cópia via `--fork-session`). Configuração do funcionário no próprio painel.
- **AGENTS.md** injetado no system prompt. O Claude Code não o lê sozinho (validado); `CLAUDE.md` global e do repo já eram carregados.
- **Seletor de modelo** com a versão real de cada alias.
- **Salas de descompressão**: Copa, Sala de Jogos, Jardim e Biblioteca, definidas em `office/rooms.ts`. Ociosos reservam um lugar livre; dois no ping-pong jogam. Decoração com hora do dia nas janelas, relógio real e ambiente animado.

## Riscos em aberto

1. **Timeout do permission prompt**: validado com 2,5 min (`MCP_TOOL_TIMEOUT` = 24h). Esperas de horas ainda não foram testadas.
2. **Credenciais da Comunicação**: OAuth do Google Workspace e app Slack (user token) a configurar na F4.
3. **Modelos remotos fracos em tools**: Claude Code exige tool use sólido. `gpt-4o-mini` pode falhar em tasks longas, e o painel deve avisar.
4. **Custo/limites da assinatura**: vários agentes simultâneos consomem o limite rápido. Limite global de concorrência, haiku para onboarding/consultas simples, custo exibido por task.
5. **Loops entre agentes**: limite de saltos, detecção de ciclo e delegação com aprovação.
