import { TacticalThreatType } from '../../utils/tacticalThreats';

interface ThreatInfo {
  icon: string;
  title: string;
  /** Badge classes (written out in full so Tailwind can detect them). */
  badgeClass: string;
}

const THREAT_INFO: Partial<Record<TacticalThreatType, ThreatInfo>> = {
  check: {
    icon: '⚡',
    title: 'Échec au Roi',
    badgeClass: 'bg-rose-600 text-white ring-1 ring-rose-400',
  },
  hanging: {
    icon: '🛡️',
    title: 'Pièce en prise',
    badgeClass: 'bg-rose-600 text-white ring-1 ring-rose-400',
  },
  pin: {
    icon: '🧷',
    title: 'Clouage tactique',
    badgeClass: 'bg-purple-600 text-white ring-1 ring-purple-400',
  },
  fork: {
    icon: '🔱',
    title: 'Fourchette (Attaque double)',
    badgeClass: 'bg-amber-500 text-slate-950 ring-1 ring-amber-300',
  },
};

// Every other type (attack, skewer…) is shown as a capture threat
const DEFAULT_THREAT_INFO: ThreatInfo = {
  icon: '⚔️',
  title: 'Menace de capture',
  badgeClass: 'bg-amber-600 text-white ring-1 ring-amber-400',
};

export const getThreatInfo = (type: TacticalThreatType): ThreatInfo => THREAT_INFO[type] ?? DEFAULT_THREAT_INFO;
