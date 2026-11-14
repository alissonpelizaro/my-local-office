// App desktop: janela nativa para o server Node embutido (resources/app, mesmo layout do pacote headless).
// Se já houver um office na porta (serviço do código-fonte, outra instância), só abre a janela nele.
// Fechar a janela recolhe para a bandeja (o office segue rodando); "Desligar" no menu do ícone encerra tudo.
use std::{
    env, fs,
    io::{BufRead, BufReader, Read, Write},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::mpsc,
    thread,
    time::Duration,
};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::NewWindowResponse,
    AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder, Wry,
};
use tauri_plugin_notification::NotificationExt;

const ENV_START: &str = "__MLO_ENV_START__";
const ENV_END: &str = "__MLO_ENV_END__";
// O server sai com este código quando o "Desligar escritório" da Configuração pede: o app fecha junto.
const QUIT_CODE: i32 = 75;

fn main() {
    let home = env::var_os("MLO_HOME").map(PathBuf::from).unwrap_or_else(|| Path::new(&env::var_os("HOME").unwrap_or_default()).join(".my-local-office"));
    let data = home.join("data");
    let _ = fs::create_dir_all(&data);
    // O install.sh encerra o app por este pid para trocar a versão.
    let _ = fs::write(data.join("app.pid"), std::process::id().to_string());

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| show(app)))
        .plugin(tauri_plugin_notification::init())
        .setup(move |app| {
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("My Local Office")
                .inner_size(1440.0, 900.0)
                .min_inner_size(900.0, 600.0)
                .zoom_hotkeys_enabled(true)
                // A página sabe que está no app: quem avisa é a notificação nativa, não o som da página.
                .initialization_script("window.mloApp = true;")
                .on_new_window(|url, _| {
                    open_external(&url);
                    NewWindowResponse::Deny
                })
                .build()?;
            let tray = tray(app.handle())?;
            let resources = app.path().resource_dir()?.join("app");
            let handle = app.handle().clone();
            thread::spawn(move || {
                let envs = login_env();
                let port = envs.iter().find(|(k, _)| k == "OFFICE_PORT").and_then(|(_, v)| v.parse().ok()).unwrap_or(4410);
                if !up(port) {
                    let h = handle.clone();
                    thread::spawn(move || supervise(h, resources, home, envs, port));
                }
                for _ in 0..120 {
                    if up(port) {
                        let _ = window.navigate(Url::parse(&format!("http://127.0.0.1:{port}/")).unwrap());
                        thread::spawn(move || listen(handle, tray, port));
                        return;
                    }
                    thread::sleep(Duration::from_millis(500));
                }
                let _ = window.eval("document.body.dataset.failed = ''");
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to start My Local Office");

    app.run(|_app, _event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = _event {
            show(_app);
        }
    });
}

fn show(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

// Ícone na bandeja (barra de menus no macOS): abrir a janela ou desligar o escritório.
struct Tray {
    open: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

fn tray(app: &AppHandle) -> tauri::Result<Tray> {
    let (open_label, quit_label) = labels("en");
    let open = MenuItem::with_id(app, "open", open_label, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", quit_label, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &PredefinedMenuItem::separator(app)?, &quit])?;
    TrayIconBuilder::with_id("main")
        .icon(Image::from_bytes(include_bytes!("../icons/32x32.png"))?)
        .tooltip("My Local Office")
        .menu(&menu)
        .on_menu_event(|app, e| match e.id.as_ref() {
            "open" => show(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|icon, e| {
            if let TrayIconEvent::DoubleClick { button: MouseButton::Left, .. } | TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                if !cfg!(target_os = "macos") {
                    show(icon.app_handle());
                }
            }
        })
        .build(app)?;
    Ok(Tray { open, quit })
}

fn labels(lang: &str) -> (&'static str, &'static str) {
    match lang {
        "pt" => ("Abrir o escritório", "Desligar"),
        "es" => ("Abrir la oficina", "Apagar"),
        _ => ("Open the office", "Shut down"),
    }
}

// Notificações do escritório (/api/notifications): nativas, com o ícone do app e som. Enquanto o app escuta, o server
// não manda as dele. Traz também o idioma (rótulos da bandeja) e os pedidos pendentes (badge e dica do ícone).
fn listen(app: AppHandle, tray: Tray, port: u16) {
    loop {
        if let Ok(mut s) = TcpStream::connect(SocketAddr::from(([127, 0, 0, 1], port))) {
            let req = format!("GET /api/notifications HTTP/1.0\r\nHost: 127.0.0.1:{port}\r\nAccept: text/event-stream\r\n\r\n");
            if s.write_all(req.as_bytes()).is_ok() {
                for line in BufReader::new(s).lines() {
                    let Ok(line) = line else { break };
                    let Some(v) = line.strip_prefix("data: ").and_then(|d| serde_json::from_str::<serde_json::Value>(d).ok()) else { continue };
                    if let Some(lang) = v["lang"].as_str() {
                        let (open, quit) = labels(lang);
                        let _ = tray.open.set_text(open);
                        let _ = tray.quit.set_text(quit);
                    }
                    if let Some(n) = v["pending"].as_i64() {
                        if let Some(icon) = app.tray_by_id("main") {
                            let _ = icon.set_tooltip(Some(if n > 0 { format!("My Local Office ({n})") } else { "My Local Office".into() }));
                        }
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.set_badge_count(if n > 0 { Some(n) } else { None });
                        }
                    }
                    if let Some(title) = v["title"].as_str() {
                        let mut b = app.notification().builder().title(title).body(v["body"].as_str().unwrap_or(""));
                        if v["sound"].as_bool().unwrap_or(true) {
                            b = b.sound(if cfg!(target_os = "macos") { "Glass" } else { "message-new-instant" });
                        }
                        let _ = b.show();
                    }
                }
            }
        }
        thread::sleep(Duration::from_secs(3));
    }
}

fn up(port: u16) -> bool {
    TcpStream::connect_timeout(&SocketAddr::from(([127, 0, 0, 1], port)), Duration::from_millis(300)).is_ok()
}

fn open_external(url: &Url) {
    if matches!(url.scheme(), "http" | "https" | "mailto") {
        let _ = Command::new(if cfg!(target_os = "macos") { "open" } else { "xdg-open" }).arg(url.as_str()).spawn();
    }
}

// Sobe o server e o sobe de novo se cair. Ele sai sozinho quando o app fecha: o stdin dele é um pipe deste
// processo, e o EOF (app encerrado, morto ou atualizando) dispara o mesmo desligamento do SIGTERM.
fn supervise(app: AppHandle, app_dir: PathBuf, home: PathBuf, envs: Vec<(String, String)>, port: u16) {
    // Só o app instalado (.app ou AppImage) se atualiza sozinho: o install.sh troca este caminho.
    let app_path = if cfg!(target_os = "macos") {
        env::current_exe().ok().and_then(|e| e.ancestors().nth(3).map(Path::to_path_buf)).filter(|p| p.extension().is_some_and(|x| x == "app")).map(PathBuf::into_os_string)
    } else {
        env::var_os("APPIMAGE")
    };
    loop {
        let log = fs::OpenOptions::new().create(true).append(true).open(home.join("data/office.log"));
        let mut cmd = Command::new(app_dir.join("node/bin/node"));
        cmd.args(["--disable-warning=ExperimentalWarning", "apps/server/src/main.ts"])
            .current_dir(&app_dir)
            .envs(envs.iter().map(|(k, v)| (k, v)))
            .env("OFFICE_DATA", home.join("data"))
            .env("MLO_APP", "1")
            .stdin(Stdio::piped());
        if let Ok(log) = log {
            if let Ok(out) = log.try_clone() {
                cmd.stdout(out);
            }
            cmd.stderr(log);
        }
        if let Some(p) = &app_path {
            cmd.env("MLO_HOME", &home).env("MLO_APP_PATH", p);
        }
        match cmd.spawn() {
            Ok(mut child) => {
                let _stdin = child.stdin.take(); // wait() fecharia o stdin
                if child.wait().ok().and_then(|s| s.code()) == Some(QUIT_CODE) {
                    app.exit(0);
                    return;
                }
            }
            Err(e) => eprintln!("my-local-office: cannot start the server: {e}"),
        }
        thread::sleep(Duration::from_secs(3));
        if up(port) {
            return; // outro office tomou a porta
        }
    }
}

// App aberto pelo Finder/menu não herda o ambiente do terminal (PATH com claude, git, gh; tokens; OFFICE_*):
// pega o do shell de login do usuário, como o serviço fazia ao gravar o PATH no plist.
fn login_env() -> Vec<(String, String)> {
    let shell = env::var("SHELL").unwrap_or_else(|_| if cfg!(target_os = "macos") { "/bin/zsh" } else { "/bin/bash" }.into());
    let script = format!("printf '{ENV_START}'; env -0; printf '{ENV_END}'");
    let Ok(mut child) = Command::new(shell).args(["-ilc", &script]).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn() else {
        return vec![];
    };
    let mut out = child.stdout.take().unwrap();
    let (tx, rx) = mpsc::channel();
    // Lê até o marcador final, não até o EOF: algo iniciado pelo rc do shell pode segurar o stdout aberto.
    thread::spawn(move || {
        let (mut buf, mut chunk) = (Vec::new(), [0u8; 8192]);
        while let Ok(n) = out.read(&mut chunk) {
            buf.extend_from_slice(&chunk[..n]);
            if n == 0 || String::from_utf8_lossy(&buf).contains(ENV_END) {
                break;
            }
        }
        let _ = tx.send(buf);
    });
    let buf = rx.recv_timeout(Duration::from_secs(10)).unwrap_or_default();
    let _ = child.kill();
    let _ = child.wait();
    parse_env(&String::from_utf8_lossy(&buf))
}

// O que vem entre os marcadores é o `env -0`; antes deles, o que o rc do shell imprimir.
fn parse_env(text: &str) -> Vec<(String, String)> {
    let Some(body) = text.split(ENV_START).nth(1).and_then(|s| s.split(ENV_END).next()) else {
        return vec![];
    };
    body.split('\0')
        .filter_map(|kv| kv.split_once('='))
        .filter(|(k, _)| !k.is_empty() && !matches!(*k, "PWD" | "OLDPWD" | "SHLVL" | "_"))
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect()
}

#[test]
fn parses_the_login_shell_env() {
    let out = format!("Welcome!\n{ENV_START}PATH=/a:/b\0PWD=/\0MULTI=x=1\nline2\0{ENV_END}");
    assert_eq!(parse_env(&out), vec![("PATH".into(), "/a:/b".into()), ("MULTI".into(), "x=1\nline2".into())]);
    assert!(parse_env("no markers").is_empty());
}
