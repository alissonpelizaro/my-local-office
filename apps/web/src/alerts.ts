// Aviso no navegador de outro aparelho (rede, túnel): som e notificação da página. No app desktop e no próprio
// computador do escritório quem avisa é o sistema (main.rs e notify.ts do server), então aqui não repete.
declare global {
  interface Window {
    mloApp?: boolean; // definido pelo app desktop (main.rs) antes da página carregar
  }
}
export const inApp = Boolean(window.mloApp);
export const webAlerts = !inApp && !['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);

let audio: AudioContext | undefined;

// Dois tons curtos, sem arquivo de áudio.
export function chime() {
  try {
    audio ??= new AudioContext();
    const t0 = audio.currentTime;
    [880, 1320].forEach((f, i) => {
      const o = audio!.createOscillator();
      const g = audio!.createGain();
      const at = t0 + i * 0.13;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
      o.connect(g).connect(audio!.destination);
      o.start(at);
      o.stop(at + 0.4);
    });
  } catch {}
}

export function webAlert(title: string, body: string, sound: boolean) {
  if (!webAlerts) return;
  if (sound) chime();
  // Notification só existe em contexto seguro (túnel https); na rede local em http fica o som.
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification(title, { body, tag: 'my-local-office' });
}

export async function testWebAlert(sound: boolean) {
  if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
  if (sound) chime();
}
