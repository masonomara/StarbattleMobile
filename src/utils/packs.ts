import type { PackFile } from '../types';

import introPack from '../../packs/intro.json';
import pack1star5x5 from '../../packs/1star-5x5.json';
import pack1star6x6 from '../../packs/1star-6x6.json';
import pack1star8x8 from '../../packs/1star-8x8.json';
import pack2star10x10 from '../../packs/2star-10x10.json';

const ALL_PACKS: PackFile[] = [
  introPack as PackFile,
  pack1star5x5 as PackFile,
  pack1star6x6 as PackFile,
  pack1star8x8 as PackFile,
  pack2star10x10 as PackFile,
];

export function getAllPacks(): PackFile[] {
  return ALL_PACKS;
}

export function getPackById(id: string): PackFile | undefined {
  return ALL_PACKS.find(pack => pack.id === id);
}
