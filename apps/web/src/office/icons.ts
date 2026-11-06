// Os mesmos ícones da UI (lucide) viram texturas da cena: SVG branco, colorido com tint em cada uso.
import type Phaser from 'phaser';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ICONS, type IconName } from '../components/icons';

export const iconKey = (name: IconName) => `icon-${name}`;

export function loadIcons(scene: Phaser.Scene, names: Iterable<IconName>) {
  for (const name of new Set(names)) {
    const svg = renderToStaticMarkup(createElement(ICONS[name], { color: '#ffffff', size: 48, strokeWidth: 2.25 }));
    scene.load.svg(iconKey(name), `data:image/svg+xml;base64,${btoa(svg)}`, { width: 48, height: 48 });
  }
}
