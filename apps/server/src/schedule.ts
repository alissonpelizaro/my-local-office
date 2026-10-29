// Próximo horário de uma série depois de `now`, no ritmo contado a partir da âncora.
// Horários que passaram (server desligado, execução longa) são pulados, não acumulados.
export function nextRun(anchorMs: number, everyMin: number, nowMs: number) {
  const step = everyMin * 60_000;
  return anchorMs + Math.max(1, Math.floor((nowMs - anchorMs) / step) + 1) * step;
}
