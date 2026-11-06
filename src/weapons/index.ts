import type { GameContext } from './types';
import { WeaponBase, type WeaponId } from './WeaponBase';
import { SmartPistol } from './SmartPistol';
import { MantisBlade } from './MantisBlade';
import { HackDrone } from './HackDrone';
import { PlasmaGrenade } from './PlasmaGrenade';
import { Monowire } from './Monowire';
import { EmpField } from './EmpField';
import { Railgun } from './Railgun';
import { Shotgun } from './Shotgun';
import { Turret } from './Turret';
import { MicroMissile } from './MicroMissile';
import { ArcCoil } from './ArcCoil';
import { ProxMine } from './ProxMine';

export const WEAPON_IDS: WeaponId[] = ['smartPistol', 'mantisBlade', 'hackDrone', 'plasmaGrenade', 'monowire', 'empField', 'railgun', 'shotgun', 'turret', 'microMissile', 'arcCoil', 'proxMine'];

export function createWeapon(id: WeaponId, ctx: GameContext): WeaponBase {
  switch (id) {
    case 'smartPistol':
      return new SmartPistol(id, ctx);
    case 'mantisBlade':
      return new MantisBlade(id, ctx);
    case 'hackDrone':
      return new HackDrone(id, ctx);
    case 'plasmaGrenade':
      return new PlasmaGrenade(id, ctx);
    case 'monowire':
      return new Monowire(id, ctx);
    case 'empField':
      return new EmpField(id, ctx);
    case 'railgun':
      return new Railgun(id, ctx);
    case 'shotgun':
      return new Shotgun(id, ctx);
    case 'turret':
      return new Turret(id, ctx);
    case 'microMissile':
      return new MicroMissile(id, ctx);
    case 'arcCoil':
      return new ArcCoil(id, ctx);
    case 'proxMine':
      return new ProxMine(id, ctx);
  }
}

export { WeaponBase, type WeaponId };
export type { AbilityTier } from './WeaponBase';
