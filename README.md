# My Local Office

A local, virtual office for your [Claude Code](https://docs.claude.com/claude-code) agents. Each employee is an agent that owns one of your repositories; employees are grouped in departments, consult each other, delegate work and ask you before anything risky. You watch it all happen in an isometric office and approve, answer or redirect from the UI.

![The office: employees at their desks, a permission request waiting on the boss's desk](docs/screenshots/office.png)

| Conversation with an employee | Tasks |
|---|---|
| ![Chat with the plan, the tools used and a permission request](docs/screenshots/conversation.png) | ![Active, planned and finished tasks](docs/screenshots/tasks.png) |

| First access | Team settings |
|---|---|
| ![Setup assistant](docs/screenshots/setup.png) | ![Departments and employees](docs/screenshots/settings.png) |

Everything runs on your machine: a small Node server, a SQLite file and one `claude -p` process per task, using your Claude subscription (or any provider you configure).

## Install

macOS and Linux, Intel and ARM. You only need [Claude Code](https://docs.claude.com/claude-code) installed and logged in (`claude auth status`); Node comes bundled.

```bash
curl -fsSL https://github.com/alissonpelizaro/my-local-office/releases/latest/download/install.sh | bash
```

It installs the **My Local Office** app and opens it: in `/Applications` on macOS (`~/Applications` if that is not writable), and on Linux as an AppImage in `~/.local/bin/my-local-office` with an entry in the app menu. A setup assistant walks you through the language, your departments and your first hires.

The app runs the office while it is open: on macOS closing the window keeps it running (reopen it from the Dock, quit with ⌘Q); on Linux closing the window quits it. Quitting stops running tasks. Your data lives in `~/.my-local-office/data`, logs in `~/.my-local-office/data/office.log`. The UI is also at **http://127.0.0.1:4410** in any browser while the app is open.

Prefer a manual download? The release has a `.dmg` (macOS) and an `.AppImage`/`.deb` (Linux). The app is not notarized by Apple: if macOS refuses to open a `.dmg` copy, allow it in **System Settings → Privacy & Security → Open Anyway** (the install command does not need this). Some Linux distributions need `libfuse2` for AppImages.

| Option | |
|---|---|
| `--version v1.2.0` | Install a specific release |
| `--file <package>` | Install a package you already downloaded (`.app.tar.gz`, `.AppImage` or the server `.tar.gz`) |
| `--server` | Headless background service instead of the app (servers, machines without a desktop; the default on Linux without a display) |
| `--no-start` | Do not open the app / start the service |

### Headless server

`install.sh --server` puts the server in `~/.my-local-office/app` and registers a background service (a LaunchAgent on macOS, a `systemd --user` unit on Linux) that starts on login and restarts if it crashes; open **http://127.0.0.1:4410**. Without the service (`--no-start`), start it with `~/.my-local-office/app/scripts/start.sh`. On Linux, run `loginctl enable-linger $USER` if the office should keep running without an open session.

### Updates

The office checks GitHub for a new release every few hours. When there is one, a badge shows up in the header and **Settings → About → Update now** downloads it, replaces the app (or the server folder) and opens it again; your data stays. Running tasks are interrupted. You can also update by running the install command again.

### Uninstall

```bash
curl -fsSL https://github.com/alissonpelizaro/my-local-office/releases/latest/download/uninstall.sh | bash               # keeps ~/.my-local-office/data
curl -fsSL https://github.com/alissonpelizaro/my-local-office/releases/latest/download/uninstall.sh | bash -s -- --purge  # removes everything
```

### Configuration

The app reads these from your login shell (`export` them in `~/.zshrc`, `~/.bashrc`…), along with the `PATH` where it finds `claude`, `git` and `gh`. The headless server takes them when you run the installer (they are written into the service).

| Variable | Default | |
|---|---|---|
| `OFFICE_PORT` | `4410` | |
| `OFFICE_HOST` | `127.0.0.1` | `0.0.0.0` opens it to your network and requires `OFFICE_TOKEN` |
| `OFFICE_TOKEN` | | 16+ characters. On another device, open `http://<ip>:4410/?token=<token>` once (it becomes a cookie). Localhost never asks |
| `MLO_HOME` | `~/.my-local-office` | Data folder (and the headless install) |
| `OFFICE_CLAUDE_BIN` | `claude` | |

Network access example: `OFFICE_HOST=0.0.0.0 OFFICE_TOKEN=$(openssl rand -hex 16)`. Whoever has the token runs agents on your machine: trusted networks only.

Tunnels (ngrok, cloudflared) pointing at `localhost:4410` follow the same rule: set `OFFICE_TOKEN` (keep `OFFICE_HOST` on loopback) and open `https://<tunnel>/?token=<token>` once. Without a token, only localhost is accepted.

## How it works

- **Departments** group employees by project, product or area. Each one is a room in the office.
- **Employees** own a git repository. Each task is a `claude -p` process (stream-json) running in the repo, so it inherits your `~/.claude/CLAUDE.md`, the repo's `CLAUDE.md`, skills and allowlists. On hire, a quick read-only onboarding writes the employee's profile, which colleagues use to know whom to ask.
- **Interns** are not tied to a repository. They work in their own folder (`data/workspaces/`) on research, writing, analysis and errands, and ask the owners when code is involved.
- **The `office` MCP** connects them:
  - `directory`: who takes care of what
  - `ask_colleague`: a read-only consultation in the colleague's repository
  - `delegate_task`: a task for another employee (needs your approval by default)
  - `ask_boss`: a question for you
  - `approve`: the permission prompt
- **Permissions**: by default agents run read and local commands (tests, builds, local git…) and edit their workspace without asking. External actions (`git push`, opening/merging PRs, publish, docker, sending messages…) always ask, and so do destructive ones (`git reset --hard`, `rm -r` outside temp folders, `kill`, SQL writes…) and edits outside the workspace, unless you "always allow" them for that employee. Requests show up in the UI (and as a "!" over the employee). Settings → Execution can make it ask for every non-read command instead.
- **Providers**: each employee (or a whole department, in one click) uses the Claude subscription or a remote provider. Anthropic-compatible providers are called directly; OpenAI-compatible ones go through a built-in bridge. A local Ollama works too (set its context to ~64K).
- **Conversations**: click an employee to chat. Each message continues the same Claude session; while a turn is running, your message goes in right away. Sessions you opened outside the office (terminal, IDE) can be continued as a copy.
- **Tasks** run now, at a set time or on repeat (e.g. every 15 min). A repeating task can have a pre-check command: no output means nothing to do and no tokens spent.
- **Worktrees**: per employee, tasks run in the main copy or always in an isolated `git worktree`; parallel tasks use worktrees automatically.
- **Costs** per day, department and employee (on a subscription it is the API-price equivalent, useful to compare usage).
- **Languages**: English, Portuguese and Spanish, chosen in Settings. Agents reply in the same language.
- **Shortcuts**: `N` new task, `⌘K` search employees, tasks and actions, `Esc` closes the panel.

## Development

Requires Node 22.18+ (see `.tool-versions`) and pnpm.

```bash
pnpm install
pnpm dev          # server with --watch + Vite on http://127.0.0.1:5173
pnpm build        # builds apps/web/dist
pnpm start        # server + UI on http://127.0.0.1:4410 (data in ./data)
pnpm test
pnpm typecheck
```

`pnpm install-service` registers a LaunchAgent that runs the source checkout (macOS); `pnpm uninstall-service` removes it.

The desktop app (`apps/desktop`, [Tauri](https://tauri.app)) also needs Rust (see `.tool-versions`) and, on Linux, the [Tauri prerequisites](https://tauri.app/start/prerequisites/). It wraps the same server: `pnpm desktop build` stages `apps/desktop/src-tauri/app` (server, built UI and Node) and builds the app for this machine; `pnpm desktop dev` runs it unbundled. When something already answers on the port (`pnpm start`, the service above), the app just opens a window on it.

| Folder | |
|---|---|
| `apps/server/src` | `runner.ts` (Claude Code CLI), `mcp.ts`, `office.ts` (tasks, approvals, consultations), `policy.ts`, `update.ts`, `bridge.js` |
| `apps/web/src` | `store.ts` (state, SSE, replay), `components/`, `office/` (isometric floor plan and Phaser scene), `i18n/` |
| `apps/desktop` | Tauri app: `src-tauri/src/main.rs` starts the bundled server and opens the window; `loading/` is shown while it starts |
| `scripts` | `install.sh`, `uninstall.sh`, `start.sh`, `stage-app.sh`, `build-release.sh` |

### Releases

PR titles follow [Conventional Commits](https://www.conventionalcommits.org). Release Drafter labels each PR and keeps a draft of the next version (`feat` → minor, `fix`/`chore`/`docs` → patch, `!` → major). Publishing the draft triggers the release workflow, which builds the desktop app per platform (`.app.tar.gz`/`.dmg`, `.AppImage`/`.deb`) and the headless packages, all with Node bundled, attaches them, `install.sh` and `uninstall.sh` to the release and checks that the release installs and starts on macOS (app) and Linux (headless).
