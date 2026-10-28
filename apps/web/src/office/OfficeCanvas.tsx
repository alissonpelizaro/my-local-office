import Phaser from 'phaser';
import { useEffect, useRef } from 'react';
import { onOfficeEvent, selectEmployee, useOffice } from '../store';
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
      scene.setData(s.state, s.selectedEmployeeId);
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
    officeView.fit = () => scene.fitView();
    return () => {
      unsubscribe();
      off();
      game.destroy(true);
    };
  }, []);

  return <div ref={host} className="absolute inset-0" />;
}
