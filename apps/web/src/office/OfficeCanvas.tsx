import Phaser from 'phaser';
import { useEffect, useRef } from 'react';
import { marker, onOfficeEvent, selectEmployee, setOfficeReady, useOffice } from '../store';
import { OfficeScene } from './OfficeScene';

// Controles que a UI React usa sobre a cena.
export const officeView = { fit: () => {} };

export function OfficeCanvas({ onBoss }: { onBoss: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const bossRef = useRef(onBoss);
  bossRef.current = onBoss;

  useEffect(() => {
    const scene = new OfficeScene();
    scene.onSelect = (id) => selectEmployee(id);
    scene.onBoss = () => bossRef.current();
    // Canvas montado com replay já em curso (escritório estava recolhido): o marcador de início já passou.
    // Cena montada: libera a tela de carregamento depois de dois quadros (o primeiro já desenhado).
    scene.onReady = () => {
      const r = useOffice.getState().replay;
      if (r) scene.handle(marker('replay.start', r.taskId), true);
      requestAnimationFrame(() => requestAnimationFrame(setOfficeReady));
    };
    // Rede de segurança: sem WebGL/canvas a cena pode nunca ficar pronta, e o app não pode ficar preso no loading.
    const fallback = setTimeout(setOfficeReady, 10_000);
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current!,
      banner: false,
      antialias: true,
      scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
      scene,
    });
    let asleep = false;
    const push = (s = useOffice.getState()) => {
      scene.setDark(s.dark);
      scene.setData(s.state, s.selectedEmployeeId, s.lang);
      // Fora da aba Escritório a cena dorme (sem gastar CPU) e não perde estado.
      if (asleep === (s.tab === 'office')) {
        asleep = !asleep;
        if (asleep) game.loop.sleep();
        else game.loop.wake();
      }
    };
    push();
    const unsubscribe = useOffice.subscribe((s) => push(s));
    const off = onOfficeEvent((e, replay) => scene.handle(e, replay));
    officeView.fit = () => scene.fitView(true);
    // Faixas que aparecem e somem (sem conexão, atualizando) mudam a altura do contêiner sem resize da janela.
    const ro = new ResizeObserver(() => game.scale.refresh());
    ro.observe(host.current!);
    return () => {
      ro.disconnect();
      clearTimeout(fallback);
      unsubscribe();
      off();
      officeView.fit = () => {};
      game.destroy(true);
    };
  }, []);

  return <div ref={host} className="absolute inset-0" />;
}
