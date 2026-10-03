import React from 'react';
import { AlertTriangle, CheckCircle2, Lightbulb } from 'lucide-react';
import { formatPlayedDate } from '../../services/gameImport';
import { toFrenchSan } from '../../utils/chessNotation';
import { FAULT_KINDS, FAULT_KIND_TEXT as KIND_TEXT, type FaultKind } from '../../utils/faultKinds';
import { faultThemeCounts, themeLabel } from '../../utils/puzzleThemes';
import type { GamePhase } from '../../utils/phaseStats';
import {
  MIN_BUCKET_MOVES,
  MIN_TREND_GAMES,
  weakestPhase,
  type Bucket,
  type GameBucket,
  type Profile,
  type TimeControlClass,
} from '../../utils/weaknessProfile';
import { TrendChart } from './TrendChart';

/** Games under which the figures are only a first idea. */
export const FEW_GAMES = 5;

const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const signed = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1, signDisplay: 'exceptZero' });

const PHASES: Array<{ id: GamePhase; label: string; range: string }> = [
  { id: 'opening', label: 'Ouverture', range: 'pièces à développer' },
  { id: 'middlegame', label: 'Milieu de jeu', range: 'pièces en jeu' },
  { id: 'endgame', label: 'Finale', range: 'peu de pièces' },
];

const SPEED_LABELS: Record<TimeControlClass, string> = {
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapide',
  classical: 'Classique',
  daily: 'Par correspondance',
};

/** "+0,5", "−1,2", or "stable" for a change that would show as 0. */
const faultsChange = (change: number) => (Math.abs(change) < 0.05 ? 'stable' : signed.format(change));

const accuracyText = (accuracy: number | null) => (accuracy === null ? '—' : `${whole.format(accuracy)} %`);

function Section({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-bold text-slate-100">{title}</h3>
        {note && <p className="text-[11px] text-slate-400 mt-0.5">{note}</p>}
      </div>
      {children}
    </section>
  );
}

interface BarRowProps {
  label: string;
  /** What the bar measures (0-100), nothing for no bar. */
  value: number | null;
  valueText: string;
  detail?: string;
  /** Few moves behind it: the figure is only a hint. */
  isThin?: boolean;
  isWeak?: boolean;
  badge?: string;
}

function BarRow({ label, value, valueText, detail, isThin = false, isWeak = false, badge }: BarRowProps) {
  const color = isWeak ? 'bg-amber-500' : isThin ? 'bg-slate-600' : 'bg-indigo-500';
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium text-slate-200 flex items-center gap-2 min-w-0">
          <span className="truncate">{label}</span>
          {badge && (
            <span className="shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
              {badge}
            </span>
          )}
        </span>
        <span className="font-mono font-bold text-slate-100 shrink-0">{valueText}</span>
      </div>
      {value !== null && (
        <div aria-hidden="true" className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
          <div className={`${color} h-full rounded-full`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
        </div>
      )}
      {detail && <p className="text-[11px] text-slate-400">{detail}</p>}
    </li>
  );
}

/** What a kind of fault is, and for the tactical ones the themes met most (fork 5, pin 3…). */
function kindDetail(kind: FaultKind, themes: Profile['kinds']['themes']): string {
  const top = faultThemeCounts(kind, themes).slice(0, 3);
  if (top.length === 0) return KIND_TEXT[kind].hint;
  return `${KIND_TEXT[kind].hint} Surtout : ${top.map(([theme, count]) => `${themeLabel(theme).toLowerCase()} (${count})`).join(', ')}.`;
}

const movesDetail = (bucket: Bucket) =>
  bucket.moves === 0
    ? 'Aucun coup.'
    : `${whole.format(bucket.moves)} coups · ${decimal.format(bucket.faultsPer100)} erreurs pour 100 coups${
        bucket.moves < MIN_BUCKET_MOVES ? ' · peu de coups, à prendre avec prudence' : ''
      }`;

const gamesDetail = (bucket: GameBucket) => {
  const score = bucket.score === null ? '' : ` · score ${whole.format(bucket.score * 100)} %`;
  const games = `${bucket.games} partie${bucket.games > 1 ? 's' : ''}`;
  return `${games}${score} · ${movesDetail(bucket)}`;
};

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="text-lg font-bold text-slate-100 font-mono">{value}</p>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

/** The whole profile, from a computed `Profile` (no loading here). */
export const ProfileView: React.FC<{ profile: Profile }> = ({ profile }) => {
  const {
    overview,
    phases,
    kinds,
    worst,
    colors,
    time,
    opponents,
    timeControls,
    trend,
    trendChange,
    insights,
    strengths,
  } = profile;
  const weakest = weakestPhase(profile);
  const speeds = (Object.keys(timeControls) as TimeControlClass[]).filter((k) => timeControls[k]);
  const hasOpponentData = opponents.stronger.games + opponents.similar.games + opponents.weaker.games > 0;
  const hasTimeData = time.pressure.moves + time.comfortable.moves > 0;
  const hasSpeedData = time.instant.moves + time.thoughtful.moves > 0;

  return (
    <div className="flex flex-col gap-6">
      {profile.counted < FEW_GAMES && (
        <p
          role="note"
          className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-950/30 border border-amber-900/50 text-amber-200 text-xs"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
          <span>
            Seulement {profile.counted} partie{profile.counted > 1 ? 's' : ''} : les chiffres ci-dessous ne sont
            qu&apos;un premier aperçu. Analysez-en davantage pour qu&apos;ils deviennent fiables.
          </span>
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Tile label="Parties comptées" value={String(profile.counted)} />
        <Tile label="Précision moyenne" value={`${decimal.format(overview.accuracy)} %`} />
        <Tile
          label="Résultats"
          value={`${overview.wins}-${overview.draws}-${overview.losses}`}
          hint="victoires-nulles-défaites"
        />
        <Tile label="Erreurs par partie" value={decimal.format(overview.faultsPerGame)} />
      </div>

      <Section title="À retenir">
        {insights.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {insights.map((insight) => (
              <li
                key={insight.id}
                className="flex items-start gap-2.5 p-3 rounded-xl bg-indigo-950/40 border border-indigo-900/50 text-sm text-slate-100"
              >
                <Lightbulb className="w-4 h-4 text-indigo-300 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{insight.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-400">
            Aucun écart marqué pour le moment : pas de phase, de couleur ni de type d&apos;erreur qui ressorte
            nettement.
          </p>
        )}
      </Section>

      <Section title="Vos points forts">
        {strengths.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {strengths.map((strength) => (
              <li
                key={strength.id}
                className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-950/30 border border-emerald-900/50 text-sm text-slate-100"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{strength.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-400">
            Aucun point fort net pour le moment : il faut plus de coups pour qu&apos;un écart positif ressorte.
          </p>
        )}
      </Section>

      <Section
        title="Par phase de la partie"
        note={`Précision de vos coups, théorie d'ouverture exclue${
          profile.baseline.accuracy === null
            ? ''
            : ` (${whole.format(profile.baseline.accuracy)} % en moyenne sur l'ensemble)`
        }.`}
      >
        <ul className="flex flex-col gap-3">
          {PHASES.map(({ id, label, range }) => (
            <BarRow
              key={id}
              label={`${label} (${range})`}
              value={phases[id].accuracy}
              valueText={accuracyText(phases[id].accuracy)}
              detail={movesDetail(phases[id])}
              isThin={phases[id].moves < MIN_BUCKET_MOVES}
              isWeak={weakest === id}
              badge={weakest === id ? 'À travailler' : undefined}
            />
          ))}
        </ul>
      </Section>

      <Section
        title="Vos erreurs, par type"
        note={`${kinds.total} erreur${kinds.total > 1 ? 's' : ''} (erreurs, gaffes et occasions manquées).`}
      >
        {kinds.total === 0 ? (
          <p className="text-xs text-slate-400">Aucune erreur dans ces parties.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {FAULT_KINDS.map((kind) => (
              <BarRow
                key={kind}
                label={KIND_TEXT[kind].label}
                value={(kinds.counts[kind] / kinds.total) * 100}
                valueText={`${whole.format((kinds.counts[kind] / kinds.total) * 100)} % · ${kinds.counts[kind]}`}
                detail={kindDetail(kind, kinds.themes)}
                isThin={kind === 'other'}
              />
            ))}
          </ul>
        )}
        {worst.length > 0 && (
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-semibold text-slate-300">Vos pires erreurs</h4>
            <ol className="flex flex-col gap-2">
              {worst.map((fault) => (
                <li
                  key={`${fault.gameId}:${fault.moveNumber}:${fault.san}`}
                  className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200"
                >
                  <p className="text-[11px] text-slate-400">
                    Contre {fault.opponent} · {formatPlayedDate(fault.date)} · coup {fault.moveNumber} ·{' '}
                    {KIND_TEXT[fault.kind].label.toLowerCase()}
                  </p>
                  <p>
                    Vous avez joué <strong className="font-mono">{toFrenchSan(fault.san)}</strong> (
                    {whole.format(fault.loss)} points de chances de gain en moins)
                    {fault.bestSan && fault.bestSan !== fault.san && (
                      <>
                        , le moteur proposait <strong className="font-mono">{toFrenchSan(fault.bestSan)}</strong>
                      </>
                    )}
                    .
                  </p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </Section>

      <Section title="Selon la situation">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-semibold text-slate-300">Couleur</h4>
            <ul className="flex flex-col gap-3">
              <BarRow
                label="Avec les Blancs"
                value={colors.w.accuracy}
                valueText={accuracyText(colors.w.accuracy)}
                detail={gamesDetail(colors.w)}
                isThin={colors.w.moves < MIN_BUCKET_MOVES}
              />
              <BarRow
                label="Avec les Noirs"
                value={colors.b.accuracy}
                valueText={accuracyText(colors.b.accuracy)}
                detail={gamesDetail(colors.b)}
                isThin={colors.b.moves < MIN_BUCKET_MOVES}
              />
            </ul>
          </div>

          {hasTimeData && (
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold text-slate-300">Temps à la pendule</h4>
              <ul className="flex flex-col gap-3">
                <BarRow
                  label="Avec peu de temps"
                  value={time.pressure.accuracy}
                  valueText={accuracyText(time.pressure.accuracy)}
                  detail={movesDetail(time.pressure)}
                  isThin={time.pressure.moves < MIN_BUCKET_MOVES}
                />
                <BarRow
                  label="Avec du temps"
                  value={time.comfortable.accuracy}
                  valueText={accuracyText(time.comfortable.accuracy)}
                  detail={movesDetail(time.comfortable)}
                  isThin={time.comfortable.moves < MIN_BUCKET_MOVES}
                />
              </ul>
              <p className="text-[11px] text-slate-400">
                « Peu de temps » : moins d&apos;un dixième de la cadence (entre 10 s et 2 min). {time.gamesWithClocks}{' '}
                partie
                {time.gamesWithClocks > 1 ? 's' : ''} avec pendule.
              </p>
            </div>
          )}

          {hasSpeedData && (
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold text-slate-300">Vitesse de jeu</h4>
              <ul className="flex flex-col gap-3">
                <BarRow
                  label="Coups joués d'un seul coup (3 s ou moins)"
                  value={time.instant.accuracy}
                  valueText={accuracyText(time.instant.accuracy)}
                  detail={movesDetail(time.instant)}
                  isThin={time.instant.moves < MIN_BUCKET_MOVES}
                />
                <BarRow
                  label="Coups réfléchis"
                  value={time.thoughtful.accuracy}
                  valueText={accuracyText(time.thoughtful.accuracy)}
                  detail={movesDetail(time.thoughtful)}
                  isThin={time.thoughtful.moves < MIN_BUCKET_MOVES}
                />
              </ul>
            </div>
          )}

          {hasOpponentData && (
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold text-slate-300">Force de l&apos;adversaire</h4>
              <ul className="flex flex-col gap-3">
                {(
                  [
                    ['Plus fort (50 points de plus ou davantage)', opponents.stronger],
                    ['De votre niveau (moins de 50 points d’écart)', opponents.similar],
                    ['Plus faible (50 points de moins ou davantage)', opponents.weaker],
                  ] as const
                )
                  .filter(([, bucket]) => bucket.games > 0)
                  .map(([label, bucket]) => (
                    <BarRow
                      key={label}
                      label={label}
                      value={bucket.accuracy}
                      valueText={accuracyText(bucket.accuracy)}
                      detail={gamesDetail(bucket)}
                      isThin={bucket.moves < MIN_BUCKET_MOVES}
                    />
                  ))}
              </ul>
            </div>
          )}

          {speeds.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold text-slate-300">Cadence</h4>
              <ul className="flex flex-col gap-3">
                {speeds.map((speed) => (
                  <BarRow
                    key={speed}
                    label={SPEED_LABELS[speed]}
                    value={timeControls[speed]!.accuracy}
                    valueText={accuracyText(timeControls[speed]!.accuracy)}
                    detail={gamesDetail(timeControls[speed]!)}
                    isThin={timeControls[speed]!.moves < MIN_BUCKET_MOVES}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      </Section>

      <Section title="Évolution">
        <TrendChart games={trend} />
        {trendChange ? (
          <p className="text-xs text-slate-300">
            Vos {trendChange.count} dernières parties : {decimal.format(trendChange.accuracy.recent)} % de précision (
            {signed.format(trendChange.accuracy.recent - trendChange.accuracy.previous)} pts par rapport aux{' '}
            {trendChange.count} précédentes) et {decimal.format(trendChange.faults.recent)} erreurs par partie (
            {faultsChange(trendChange.faults.recent - trendChange.faults.previous)}).
          </p>
        ) : (
          <p className="text-xs text-slate-400">
            Il faut au moins {MIN_TREND_GAMES} parties pour comparer les plus récentes aux précédentes.
          </p>
        )}
      </Section>
    </div>
  );
};
