/**
 * Play screens on the Scene: Training (fires visible, tap-to-predict on propagation lessons), Challenge (planning
 * with fog, detectors, big crew chips, undo/redo/clear, tutorial callouts), Dispatch (spray showpiece → result
 * overlay) and Why? (debrief: your spray vs. the alternative + the step-by-step replay under Details).
 * The Challenge view receives ONLY a PublicMissionView and the live plan — never the true error.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { getCode, fromString, letterAt, syndrome as syndromeOf, syndromeToArray, propagate, toString as pauliToString } from '../quantum';
import {
  buildEffects,
  crewCount,
  districtForMission,
  filterByDispatch,
  listPublicMissions,
  logicalPatternSupport,
  resultType,
  type Action,
  type CloudResult,
  type CloudResultOk,
  type CrewLetter,
  type Debrief,
  type GameState,
  type PublicMissionView,
  type QuantumBridge,
} from '../game';
import { debriefNarrative, missionCopy, trainingCaption, useLanguage, useT, type Key } from './i18n';
import { AlarmList, Details, Dialog, HelmetIcon, Legend, Palette, Stars, TopBar } from './panels';
import { ResultOverlay, Scene, SprayPlayer, WhyCompare, type SceneOutcome } from './scene';
import { alarmSummary, fireLabel, outcomeKey, QUALITY_KEY, resultActions, stepTitle } from './text';

interface PlayProps {
  readonly state: GameState;
  readonly dispatch: (a: Action) => void;
}

const SOURCE_KEY: Readonly<Record<CloudResultOk['source'], Key>> = { 'local-simulator': 'cloud.source.local', 'cached-cloud': 'cloud.source.cached', 'live-cloud': 'cloud.source.live' };

/** Phones and tablets (≤1023px): one-column play layout, bottom action bar, tutorial stepper strip. */
const COMPACT_QUERY = '(max-width: 1023px)';

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    try {
      return globalThis.matchMedia?.(query).matches ?? false;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let mq: MediaQueryList | undefined;
    try {
      mq = globalThis.matchMedia?.(query);
    } catch {
      mq = undefined;
    }
    if (mq === undefined) return;
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq?.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}


/* ------------------------------------------------------------------ training */

export function TrainingScreen({ state, dispatch, mission }: PlayProps & { readonly mission: PublicMissionView }) {
  const t = useT();
  const lang = useLanguage();
  const lesson = mission.training[state.lesson];
  const descId = useId();
  // Tap-to-predict (R10): on propagation lessons the player taps the house they expect to burn after the next gate
  // BEFORE the step reveals. The reveal is the engine's next frame; the reaction compares the tap with that frame.
  const [prediction, setPrediction] = useState<{ readonly lesson: number; readonly cursor: number; readonly q: number } | null>(null);
  const reactionRef = useRef<HTMLParagraphElement>(null);
  // After a prediction tap the reveal is announced AND focused, so keyboard / screen-reader players land on the reaction.
  useEffect(() => {
    if (prediction !== null) reactionRef.current?.focus({ preventScroll: true });
  }, [prediction]);
  const copy = missionCopy(mission.id, lang);
  if (lesson === undefined) return null;
  const code = getCode(mission.code);
  const start = fromString(lesson.fire);
  const traj = propagate(start, lesson.circuit);
  const cursor = state.lessonCursor;
  const frame = traj.frames[cursor + 1] ?? start;
  const frameStr = pauliToString(frame);
  const isLanes = lesson.circuit.length > 0 || code.checks.length === 0;
  const synd = code.checks.length > 0 ? syndromeToArray(syndromeOf(code, frame)) : null;
  const lessonCount = mission.training.length;
  const atLastFrame = cursor >= lesson.circuit.length - 1;
  const atLastLesson = state.lesson === lessonCount - 1;
  const predicting = lesson.circuit.length > 0 && !atLastFrame;
  const nextLabel = !atLastFrame ? t('training.nextStep') : !atLastLesson ? t('training.nextLesson') : t('training.startDispatch');
  const predict = (q: number) => {
    if (!predicting) return;
    setPrediction({ lesson: state.lesson, cursor: cursor + 1, q });
    dispatch({ type: 'LESSON_NEXT' });
  };
  // Reaction for the step that was just revealed (prediction made for this lesson at this cursor).
  const reaction = prediction !== null && prediction.lesson === state.lesson && prediction.cursor === cursor ? (letterAt(frame, prediction.q) !== 'I' ? t('training.predict.hit', { q: prediction.q }) : t('training.predict.miss', { q: prediction.q })) : null;
  const caption = trainingCaption(mission.id, state.lesson, lang, lesson.caption);
  return (
    <main className="screen screen-play screen-training">
      <TopBar
        title={copy.districtName}
        subtitle={t('training.subtitle', { n: state.lesson + 1, total: lessonCount })}
        onMissions={() => dispatch({ type: 'OPEN_MISSIONS' })}
        onSettings={() => dispatch({ type: 'OPEN_SETTINGS' })}
      />
      <div className="play-layout">
        <section className="board-col" aria-label={t('training.boardLabel')}>
          <Scene
            codeId={mission.code}
            circuit={lesson.circuit}
            fires={frameStr}
            crews={null}
            residual={null}
            syndrome={synd}
            interactive={predicting}
            onToggle={predict}
            tapHint={t('a11y.pressToPredict')}
            gateCursor={isLanes ? cursor : undefined}
            inputFires={isLanes ? lesson.fire : null}
            ariaDescribedBy={descId}
            ariaLabel={t('training.board')}
          />
          {predicting ? (
            <p className="predict-prompt" data-testid="predict-prompt" role="status">
              <strong>{t('training.predictTap')}</strong> <span className="muted">{t('training.predict.waiting')}</span>
            </p>
          ) : null}
          {reaction !== null ? (
            <p className="predict-reaction" data-testid="predict-reaction" role="status" tabIndex={-1} ref={reactionRef}>
              {reaction}
            </p>
          ) : null}
          <p className="board-caption" id={descId} aria-live="polite" data-testid="training-caption">
            {lesson.circuit.length > 0 ? (
              <strong className="mono-lead">
                {cursor < 0 ? t('training.start') : t('training.afterGate', { n: cursor + 1, total: lesson.circuit.length })} <span className="mono">{frameStr}</span>
              </strong>
            ) : null}{' '}
            {caption}
          </p>
        </section>
        <aside className="panel" aria-label={t('training.lesson')}>
          {code.checks.length > 0 ? <AlarmList codeId={mission.code} syndrome={synd} /> : null}
          <section className="panel-section">
            <h2 className="panel-title">{t('training.lesson')}</h2>
            <p className="muted small">{copy.lessonOneLiner}</p>
            <ol className="lesson-dots" aria-label={t('training.lessons')}>
              {mission.training.map((l, i) => (
                <li key={i}>
                  <button type="button" className={`dot${i === state.lesson ? ' is-current' : ''}`} aria-current={i === state.lesson ? 'step' : undefined} onClick={() => dispatch({ type: 'LESSON_SELECT', lesson: i })} aria-label={t('training.lessonLabel', { n: i + 1, fires: fireLabel(t, l.fire) })}>
                    {i + 1}
                  </button>
                </li>
              ))}
            </ol>
            <Legend allowed={mission.allowed} alarms={code.checks.length > 0} />
          </section>
          <div className="actions">
            <button type="button" className="btn" onClick={() => dispatch({ type: 'LESSON_PREV' })} disabled={state.lesson === 0 && cursor <= -1} data-testid="training-prev">
              {t('training.prev')}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'LESSON_NEXT' })} disabled={predicting} aria-disabled={predicting} data-testid="training-next">
              {nextLabel}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => dispatch({ type: 'START_CHALLENGE' })} data-testid="start-challenge">
              {t('training.skip')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => dispatch({ type: 'BACK_TO_BRIEFING' })} data-testid="back-to-briefing">
              {t('briefing.back')}
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ challenge */

export interface ChallengeProps {
  /** Public data only. The type has no `error` field by construction. */
  readonly mission: PublicMissionView;
  readonly placements: Readonly<Record<number, CrewLetter>>;
  readonly selected: CrewLetter;
  readonly standDownDialog: boolean;
  readonly highlightedCheck: number | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly tutorialActive: boolean;
  readonly dispatch: (a: Action) => void;
}

const TUTORIAL_STEP_KEY: Readonly<Record<1 | 2 | 3, { readonly title: Key; readonly body: Key }>> = {
  1: { title: 'tutorial.step1', body: 'tutorial.step1.body' },
  2: { title: 'tutorial.step2', body: 'tutorial.step2.body' },
  3: { title: 'tutorial.step3', body: 'tutorial.step3.body' },
};

function Callout({ step, current, title, body }: { readonly step: 1 | 2 | 3; readonly current: number; readonly title: string; readonly body: string }) {
  const done = step < current;
  const active = step === current;
  return (
    <div className={`callout${active ? ' is-active' : ''}${done ? ' is-done' : ''}`} data-testid={`tutorial-callout-${String(step)}`} data-active={active ? 'true' : 'false'} data-done={done ? 'true' : 'false'} aria-current={active ? 'step' : undefined}>
      <span className="callout-n" aria-hidden="true">
        {done ? '✓' : step}
      </span>
      <span className="callout-text">
        <strong>{title}</strong> <span>{body}</span>
      </span>
    </div>
  );
}

/**
 * Layout. Wide screens (≥1024px): DOM order is alarms → palette → scene → plan → actions (the Tab order); the grid
 * keeps the scene left and the panels right. In the tutorial the palette comes first so the numbered callouts read
 * 1 (crew) → 2 (house, under the scene) → 3 (spray) from top to bottom. Compact screens (≤1023px): scene first,
 * then the crew palette, then the alarms, then the plan; the tutorial callouts form one stepper strip above the scene.
 */
export function ChallengeScreen({ mission, placements, selected, standDownDialog, highlightedCheck, canUndo, canRedo, tutorialActive, dispatch }: ChallengeProps) {
  const t = useT();
  const lang = useLanguage();
  const descId = useId();
  const mainRef = useRef<HTMLElement>(null);
  const copy = missionCopy(mission.id, lang);
  const used = crewCount(placements);
  const budgetReached = used >= mission.budget;
  const isWires = mission.kind === 'propagation';
  const synd = isWires ? null : mission.syndrome;
  const [crewTapped, setCrewTapped] = useState(false);
  const tutorialStep = !crewTapped ? 1 : used === 0 ? 2 : 3;
  const compact = useMediaQuery(COMPACT_QUERY);

  // Keyboard shortcuts: 1/2/3 select, Backspace recalls the focused house's crew (or clears all), C sprays.
  // Active only while focus is inside this dispatch screen (never from the body, a notice or a dialog).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (standDownDialog || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      const root = mainRef.current;
      if (target === null || root === null || !root.contains(target)) return;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      const map: Record<string, CrewLetter> = { '1': 'X', '2': 'Z', '3': 'Y' };
      const letter = map[e.key];
      if (letter !== undefined) {
        if (mission.allowed.includes(letter)) {
          dispatch({ type: 'SELECT_LETTER', letter });
          setCrewTapped(true);
        }
        e.preventDefault();
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const block = target.closest<HTMLElement>('button.block[data-q]');
        const q = block === null ? NaN : Number(block.dataset['q']);
        if (Number.isInteger(q)) dispatch({ type: 'RECALL_BLOCK', qubit: q });
        else dispatch({ type: 'CLEAR_CREWS' });
        e.preventDefault();
        return;
      }
      if (e.key === 'c' || e.key === 'C') {
        dispatch({ type: 'CONFIRM' });
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dispatch, mission.allowed, standDownDialog]);

  const startLetters = mission.visibleStart === null ? [] : Array.from(mission.visibleStart).map((l, q) => ({ q, l })).filter((x) => x.l !== 'I');
  const placed = Object.entries(placements).sort(([a], [b]) => Number(a) - Number(b));

  const callout = (step: 1 | 2 | 3) => <Callout step={step} current={tutorialStep} title={t(TUTORIAL_STEP_KEY[step].title)} body={t(TUTORIAL_STEP_KEY[step].body)} />;
  const alarms = !isWires ? <AlarmList codeId={mission.code} syndrome={synd} compact={getCode(mission.code).checks.length > 4} hint={t('challenge.detector.hint')} /> : null;
  const palette = (
    <Palette
      allowed={mission.allowed}
      selected={selected}
      onSelect={(l) => {
        dispatch({ type: 'SELECT_LETTER', letter: l });
        setCrewTapped(true);
      }}
      callout={tutorialActive && !compact ? callout(1) : undefined}
    />
  );
  const scene = (
    <Scene
      codeId={mission.code}
      circuit={mission.circuit}
      fires={null}
      crews={null}
      placements={placements}
      residual={null}
      syndrome={synd}
      fog={!isWires}
      interactive
      onToggle={(q) => dispatch({ type: 'TOGGLE_BLOCK', qubit: q })}
      selected={selected}
      budgetReached={budgetReached}
      highlightedCheck={highlightedCheck}
      onToggleDetector={isWires ? undefined : (i) => dispatch({ type: 'TOGGLE_DETECTOR_HIGHLIGHT', checkIndex: i })}
      gateCursor={isWires ? mission.circuit.length : undefined}
      inputFires={isWires ? mission.visibleStart : null}
      ariaDescribedBy={descId}
    />
  );
  const caption = (
    <>
      <p className="board-caption" id={descId}>
        {isWires ? t('challenge.startingFire', { fires: startLetters.map((x) => t('challenge.startToken', { letter: x.l, q: x.q })).join(t('spray.list.comma', { a: '', b: '' })) }) : `${t('challenge.fog')} ${alarmSummary(t, mission.code, synd)}`} <span className="muted">{t('challenge.tapHint')}</span>
      </p>
      {!isWires && highlightedCheck !== null ? (
        <p className="muted small" data-testid="detector-watch">
          {t('challenge.detector.watches', { station: getCode(mission.code).checks[highlightedCheck]?.id ?? '', list: (getCode(mission.code).checks[highlightedCheck]?.qubits ?? []).join(', ') })}
        </p>
      ) : null}
    </>
  );
  const plan = (
    <section className="panel-section plan">
      <h2 className="panel-title">{t('plan.title')}</h2>
      <p className="budget" data-testid="budget" aria-live="polite">
        {t('challenge.crews', { used, budget: mission.budget })}
        {budgetReached ? <span className="muted"> · {t('challenge.budgetReached')}</span> : null}
      </p>
      <ul className="placement-list" aria-label={t('challenge.placed')}>
        {placed.map(([q, l]) => (
          <li key={q}>
            <HelmetIcon letter={l} size={22} /> {t('challenge.placement', { letter: l, q })}
          </li>
        ))}
        {used === 0 ? <li className="muted">{t('plan.empty')}</li> : null}
      </ul>
      <p className="muted small">{t('plan.hint')}</p>
      <div className="plan-tools">
        <button type="button" className="btn btn-small" onClick={() => dispatch({ type: 'REDO_PLACEMENT' })} disabled={!canRedo} data-testid="redo">
          {t('plan.redo')}
        </button>
        <button type="button" className="btn btn-small" onClick={() => dispatch({ type: 'CLEAR_CREWS' })} disabled={used === 0} data-testid="clear">
          {t('plan.clear')}
        </button>
        {tutorialActive ? null : (
          <button type="button" className="btn btn-small btn-ghost" onClick={() => dispatch({ type: 'BACK_TO_BRIEFING' })} data-testid="back-to-briefing">
            {t('briefing.back')}
          </button>
        )}
      </div>
    </section>
  );
  const actions = (
    <div className="actions action-bar" data-testid="action-bar">
      <button type="button" className="btn" onClick={() => dispatch({ type: 'UNDO_PLACEMENT' })} disabled={!canUndo} data-testid="undo">
        {t('plan.undo')}
      </button>
      <button type="button" className="btn btn-primary btn-spray" onClick={() => dispatch({ type: 'CONFIRM' })} data-testid="confirm">
        {t('challenge.spray')}
      </button>
    </div>
  );

  return (
    <main className={`screen screen-play screen-challenge${tutorialActive ? ' is-tutorial' : ''}`} ref={mainRef} data-tutorial={tutorialActive ? 'true' : 'false'} data-layout={compact ? 'compact' : 'wide'}>
      <TopBar
        title={copy.districtName}
        subtitle={isWires ? t('challenge.subtitle.predict') : t('challenge.subtitle.dispatch')}
        onMissions={() => dispatch({ type: 'OPEN_MISSIONS' })}
        onSettings={() => dispatch({ type: 'OPEN_SETTINGS' })}
      />
      {tutorialActive ? (
        <div className="tutorial-bar" data-testid="tutorial-bar">
          <p className="tutorial-intro">
            <strong>{t('tutorial.title')}</strong> {t('tutorial.intro')}
          </p>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => dispatch({ type: 'TUTORIAL_SKIP' })} data-testid="tutorial-skip">
            {t('tutorial.skip')}
          </button>
        </div>
      ) : null}
      {compact ? (
        <div className="play-layout play-layout-challenge is-compact">
          <section className="board-col" aria-label={t('challenge.board')}>
            {tutorialActive ? (
              <ol className="tutorial-strip" data-testid="tutorial-strip" aria-label={t('a11y.tutorialSteps')}>
                <li>{callout(1)}</li>
                <li>{callout(2)}</li>
                <li>{callout(3)}</li>
              </ol>
            ) : null}
            {scene}
            {caption}
          </section>
          <aside className="panel panel-before" aria-label={t('a11y.alarmsAndCrews')}>
            {palette}
            {alarms}
          </aside>
          <aside className="panel panel-after" aria-label={t('plan.title')}>
            {plan}
            {actions}
          </aside>
        </div>
      ) : (
        <div className="play-layout play-layout-challenge">
          <aside className="panel panel-before" aria-label={t('a11y.alarmsAndCrews')}>
            {tutorialActive ? palette : alarms}
            {tutorialActive ? alarms : palette}
          </aside>
          <section className="board-col" aria-label={t('challenge.board')}>
            {scene}
            {tutorialActive ? callout(2) : null}
            {caption}
          </section>
          <aside className="panel panel-after" aria-label={t('plan.title')}>
            {plan}
            {tutorialActive ? callout(3) : null}
            {actions}
          </aside>
        </div>
      )}
      {standDownDialog ? (
        <Dialog title={t('challenge.standDown.title')} confirmLabel={t('challenge.standDown.confirm')} cancelLabel={t('challenge.standDown.cancel')} onConfirm={() => dispatch({ type: 'STAND_DOWN_CONFIRM' })} onCancel={() => dispatch({ type: 'STAND_DOWN_CANCEL' })}>
          <p>{t('challenge.standDown.body')}</p>
        </Dialog>
      ) : null}
    </main>
  );
}

/* ------------------------------------------------------------------ dispatch (spray → result overlay) */

export interface DispatchProps extends PlayProps {
  readonly mission: PublicMissionView;
  readonly debrief: Debrief;
  readonly bridge: QuantumBridge;
  readonly reducedMotion: boolean;
}

function outcomeOf(debrief: Debrief): SceneOutcome {
  const result = resultType(debrief);
  const hasBeacon = districtForMission(debrief.missionId)?.hasBeacon ?? false;
  return { result, logicalFlip: debrief.logicalFlip, patternQubits: logicalPatternSupport(debrief), beacon: hasBeacon || result === 'logical-failure' };
}

/** Details content shared by the result overlay and the Why screen: residual, alarms, decision, cost, cloud. */
function ResultDetails({ state, mission, debrief, bridge, children }: DispatchProps & { readonly children?: ReactNode }) {
  const t = useT();
  const lang = useLanguage();
  const code = getCode(mission.code);
  const s = debrief.score;
  return (
    <>
      <dl className="facts">
        <div>
          <dt>{t('details.rawResidual')}</dt>
          <dd className="mono" data-testid="residual">
            {debrief.residual}
          </dd>
        </div>
        <div>
          <dt>{t('debrief.yourCrews')}</dt>
          <dd className="mono">{debrief.crews}</dd>
        </div>
        <div>
          <dt>{t('details.syndrome')}</dt>
          <dd className="mono" data-testid="residual-syndrome">
            {code.checks.length === 0 ? t('alarms.summary.none') : debrief.syndromeOfResidual.join('')}
          </dd>
        </div>
        <div>
          <dt>{t('result.decision')}</dt>
          <dd data-testid="decision">
            {t(QUALITY_KEY[s.quality])} · <Stars count={s.stars} max={s.maxStars} size={16} />
          </dd>
        </div>
        <div>
          <dt>{t('result.outcome')}</dt>
          <dd data-testid="verdict-label">{t(outcomeKey(s.outcome, code.checks.length > 0))}</dd>
        </div>
        <div>
          <dt>{t('result.cost')}</dt>
          <dd>{s.crewsUsed === 1 ? t('result.costText.one', { min: s.minCrews }) : t('result.costText.other', { used: s.crewsUsed, min: s.minCrews })}</dd>
        </div>
        <div>
          <dt>{t('result.attempts')}</dt>
          <dd data-testid="attempts">{state.progress[mission.id]?.attempts ?? 1}</dd>
        </div>
      </dl>
      {code.checks.length > 0 ? <AlarmList codeId={mission.code} syndrome={debrief.syndromeOfResidual} compact /> : null}
      <p className="narrative" data-testid="narrative">
        {debriefNarrative(mission.id, debrief.verdict, lang, debrief.narrative)}
      </p>
      {children}
      <CloudPanel key={`${mission.id}:${debrief.crews}`} bridge={bridge} missionId={mission.id} correction={debrief.crews} />
    </>
  );
}

export function DispatchScreen(props: DispatchProps) {
  const { state, dispatch, mission, debrief, reducedMotion } = props;
  const t = useT();
  const lang = useLanguage();
  const copy = missionCopy(mission.id, lang);
  const timeline = useMemo(() => buildEffects(debrief, reducedMotion), [debrief, reducedMotion]);
  const onDone = useCallback(() => dispatch({ type: 'DISPATCH_DONE' }), [dispatch]);
  const isLast = mission.index === listPublicMissions().length;
  const { nextLabel, primary } = resultActions(t, debrief, isLast, state.tutorialActive);
  const isLanes = mission.kind === 'propagation';
  const hasChecks = getCode(mission.code).checks.length > 0;
  return (
    <main className="screen screen-play screen-dispatch" data-dispatch-done={state.dispatchDone ? 'true' : 'false'}>
      <TopBar title={copy.districtName} subtitle={t('dispatch.subtitle')} onMissions={() => dispatch({ type: 'OPEN_MISSIONS' })} onSettings={() => dispatch({ type: 'OPEN_SETTINGS' })} />
      {!state.dispatchDone ? (
        <div className={`dispatch-live${hasChecks ? ' has-alarms' : ''}`} data-testid="dispatch-live">
          <div className="dispatch-stage">
            <SprayPlayer key={`${debrief.missionId}:${debrief.crews}:${String(state.progress[mission.id]?.attempts ?? 0)}`} codeId={mission.code} circuit={mission.circuit} debrief={debrief} timeline={timeline} reducedMotion={reducedMotion} onDone={onDone} missionCopy={copy} />
            <p className="muted small">{t('dispatch.answerCheck.note')}</p>
          </div>
          {/* The alarms the player planned against stay in view while the crews spray (public bits, nothing new revealed). */}
          {hasChecks ? (
            <aside className="dispatch-alarms" aria-label={t('alarms.title')} data-testid="dispatch-alarms">
              <AlarmList codeId={mission.code} syndrome={mission.syndrome} compact={getCode(mission.code).checks.length > 4} />
            </aside>
          ) : null}
        </div>
      ) : (
        <div className="scene-stage" data-testid="dispatch-result">
          <div className="board-col">
            <h2 className="spray-title">{t('dispatch.answerCheck')}</h2>
            <Scene
              codeId={mission.code}
              circuit={mission.circuit}
              fires={debrief.fires}
              crews={debrief.crews}
              residual={debrief.residual}
              syndrome={debrief.syndromeOfResidual}
              interactive={false}
              outcome={outcomeOf(debrief)}
              gateCursor={isLanes ? mission.circuit.length : undefined}
              inputFires={isLanes ? debrief.startFires : null}
              ariaLabel={t('dispatch.answerCheck')}
            />
            <p className="muted small">{t('dispatch.answerCheck.note')}</p>
          </div>
          <ResultOverlay
            debrief={debrief}
            result={resultType(debrief)}
            missionCopy={copy}
            stars={debrief.score.stars}
            maxStars={debrief.score.maxStars}
            onWhy={() => dispatch({ type: 'OPEN_WHY', reducedMotion })}
            onRetry={() => dispatch({ type: 'TRY_AGAIN' })}
            onNext={() => dispatch(state.tutorialActive ? { type: 'OPEN_MISSIONS' } : { type: 'NEXT_MISSION' })}
            nextLabel={nextLabel}
            className={primary === 'retry' ? 'is-primary-retry' : undefined}
          >
            <ResultDetails {...props}>
              <div className="actions">
                <button type="button" className="btn btn-small" onClick={() => dispatch({ type: 'OPEN_WHY', reducedMotion })} data-testid="step-by-step">
                  {t('debrief.stepByStep')}
                </button>
                <button type="button" className="btn btn-small" onClick={() => dispatch({ type: 'SHOW_RESULT' })} data-testid="to-result">
                  {t('debrief.result')}
                </button>
              </div>
            </ResultDetails>
          </ResultOverlay>
        </div>
      )}
    </main>
  );
}

/* ------------------------------------------------------------------ why? (debrief) */

export function DebriefScreen(props: DispatchProps) {
  const { state, dispatch, mission, debrief, reducedMotion } = props;
  const t = useT();
  const lang = useLanguage();
  const copy = missionCopy(mission.id, lang);
  const code = getCode(mission.code);
  const step = debrief.steps[state.replayIndex] ?? debrief.steps[debrief.steps.length - 1];
  const descId = useId();
  if (step === undefined) return null;
  const last = debrief.steps.length - 1;
  const isLanes = mission.kind === 'propagation';
  // The alternative correction was computed by the reducer at commit (never confirmDispatch / revealMission here).
  const alt = debrief.alternative;
  const alternative = { crews: alt.crews, verdict: alt.verdict, label: alt.kind === 'true-fires' ? t('why.trueFires') : t('why.decoder') };
  // WhyCompare disables Skip once the clock has finished; keep keyboard focus on the group by moving it to Replay both.
  const onWhyClick = (e: ReactMouseEvent<HTMLElement>) => {
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (target === null || target.closest('[data-testid="why-skip"]') === null) return;
    const root = e.currentTarget;
    globalThis.setTimeout(() => root.querySelector<HTMLElement>('[data-testid="why-replay"]')?.focus(), 0);
  };
  const residualP = fromString(debrief.residual);
  const residualHouses = Array.from({ length: code.n }, (_, q) => q).filter((q) => letterAt(residualP, q) !== 'I');
  const logicalText =
    debrief.verdict === 'success'
      ? t('debrief.logical.preserved')
      : debrief.verdict === 'detectable'
        ? t('debrief.logical.undecided')
        : isLanes
          ? t('debrief.logical.missed', { houses: residualHouses.join(', ') })
          : t('debrief.logical.flipped', { ops: [debrief.logicalFlip.x.some(Boolean) ? 'X̄' : null, debrief.logicalFlip.z.some(Boolean) ? 'Z̄' : null].filter(Boolean).join(` ${t('common.and')} `) });
  const isLast = mission.index === listPublicMissions().length;
  const { nextLabel } = resultActions(t, debrief, isLast, state.tutorialActive);
  return (
    <main className="screen screen-play screen-debrief">
      <TopBar title={copy.districtName} subtitle={t('why.title')} onMissions={() => dispatch({ type: 'OPEN_MISSIONS' })} onSettings={() => dispatch({ type: 'OPEN_SETTINGS' })} />
      <section className="why-section" aria-label={t('why.comparison')} data-testid="why-section" onClick={onWhyClick}>
        <h2 id="why-h" className="section-h" tabIndex={-1} data-focus-target data-testid="why-heading">
          {t('why.title')}
        </h2>
        <p className="why-short" data-testid="why-short">
          {copy.whyShort}
        </p>
        <WhyCompare codeId={mission.code} circuit={mission.circuit} mine={debrief} alternative={alternative} reducedMotion={reducedMotion} missionCopy={copy} />
      </section>
      <Details summary={t('debrief.stepByStep')} testId="step-details" className="step-details">
        <div className="play-layout">
          <section className="board-col" aria-label={t('debrief.replayBoard')}>
            <Scene
              codeId={mission.code}
              circuit={mission.circuit}
              fires={step.fires}
              crews={step.crews}
              residual={step.residual}
              syndrome={step.syndrome}
              interactive={false}
              outcome={step.showVerdict ? outcomeOf(debrief) : undefined}
              gateCursor={isLanes ? step.gateCursor : undefined}
              inputFires={isLanes ? debrief.startFires : null}
              ariaDescribedBy={descId}
              ariaLabel={t('a11y.replayBoard')}
            />
            <p className="board-caption" id={descId} aria-live="polite" data-testid="replay-caption">
              <strong>{t('debrief.step', { n: state.replayIndex + 1, total: debrief.steps.length, title: stepTitle(t, step.id) })}</strong> {step.caption}
            </p>
            <p className="muted small">{t('details.replayEnglish')}</p>
            <div className="replay-controls" role="group" aria-label={t('a11y.replayControls')}>
              <button type="button" className="btn" onClick={() => dispatch({ type: 'REPLAY_PREV' })} disabled={state.replayIndex === 0} data-testid="replay-prev">
                {t('debrief.prev')}
              </button>
              <button type="button" className="btn" onClick={() => dispatch({ type: 'REPLAY_NEXT' })} disabled={state.replayIndex === last} data-testid="replay-next">
                {t('debrief.next')}
              </button>
              <button type="button" className={`btn${state.autoPlay ? ' is-active' : ''}`} aria-pressed={state.autoPlay} onClick={() => dispatch({ type: 'REPLAY_AUTO', on: !state.autoPlay })} data-testid="replay-auto">
                {t('debrief.autoPlay')}
              </button>
              <ol className="step-dots" aria-label={t('a11y.replaySteps')}>
                {debrief.steps.map((s, i) => (
                  <li key={s.id}>
                    <button type="button" className={`dot${i === state.replayIndex ? ' is-current' : ''}`} aria-current={i === state.replayIndex ? 'step' : undefined} onClick={() => dispatch({ type: 'REPLAY_GOTO', index: i })} aria-label={t('a11y.step', { n: i + 1, title: stepTitle(t, s.id) })}>
                      {i + 1}
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </section>
          <aside className="panel" aria-label={t('debrief.report')}>
            <section className="panel-section">
              <h2 className="panel-title">{t('debrief.report')}</h2>
              <dl className="facts">
                <div>
                  <dt>{t('debrief.trueFires')}</dt>
                  <dd className="mono">{debrief.fires}</dd>
                </div>
                {isLanes ? (
                  <div>
                    <dt>{t('debrief.startedAs')}</dt>
                    <dd className="mono">{debrief.startFires}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>{t('debrief.yourCrews')}</dt>
                  <dd className="mono">{debrief.crews}</dd>
                </div>
                <div>
                  <dt>{t('debrief.residual')}</dt>
                  <dd className="mono" data-testid="residual">
                    {debrief.residual}
                    <span className="muted"> {residualHouses.length > 0 ? t('debrief.residualHouses', { list: residualHouses.join(', ') }) : t('debrief.nothingLeft')}</span>
                  </dd>
                </div>
                <div>
                  <dt>{t('debrief.logical')}</dt>
                  <dd data-testid="logical">{logicalText}</dd>
                </div>
                <div>
                  <dt>{t('debrief.decision')}</dt>
                  <dd>
                    {t(QUALITY_KEY[debrief.score.quality])} · <Stars count={debrief.score.stars} max={debrief.score.maxStars} size={16} />
                  </dd>
                </div>
              </dl>
              <p className="narrative" data-testid="narrative">
                {debriefNarrative(mission.id, debrief.verdict, lang, debrief.narrative)}
              </p>
            </section>
            {code.checks.length > 0 ? <AlarmList codeId={mission.code} syndrome={step.syndrome} compact /> : null}
            <section className="panel-section whatif" data-testid="whatif">
              <h2 className="panel-title">{t('debrief.whatIf')}</h2>
              <p>{t('debrief.whatIf.decoder', { crews: debrief.whatIf.decoderCrews, verdict: t(outcomeKey(debrief.whatIf.decoderVerdict, code.checks.length > 0)) })}</p>
              {debrief.whatIf.trueFireCrews !== null ? <p>{t('debrief.whatIf.trueFires', { crews: debrief.whatIf.trueFireCrews })}</p> : null}
              <h3 className="panel-title">{t('details.englishOriginal')}</h3>
              <p className="muted">{debrief.whatIf.explanation}</p>
              {lang !== 'en' ? <p className="muted small">{debrief.narrative}</p> : null}
            </section>
            <CloudPanel key={`${mission.id}:${debrief.crews}`} bridge={props.bridge} missionId={mission.id} correction={debrief.crews} />
          </aside>
        </div>
      </Details>
      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'SHOW_RESULT' })} data-testid="to-result">
          {t('debrief.result')}
        </button>
        <button type="button" className="btn" onClick={() => dispatch({ type: 'TRY_AGAIN' })} data-testid="try-again">
          {t('debrief.tryAgain')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => dispatch(state.tutorialActive ? { type: 'OPEN_MISSIONS' } : { type: 'NEXT_MISSION' })} data-testid="debrief-next">
          {nextLabel}
        </button>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ cloud verification */

type CloudState = { readonly kind: 'idle' } | { readonly kind: 'running' } | { readonly kind: 'done'; readonly result: CloudResult };

/**
 * Shows only recorded results that verify THIS dispatch (identical crews, or crews that differ from the
 * recorded ones by a stabilizer). The bridge filters already; the UI filters again so a bridge that ignores
 * the second argument (the Qollab live path) can never show a card for a different dispatch.
 * Source labels (Local (Aer) / Cached cloud result / Live cloud result) are kept verbatim in English.
 */
export function CloudPanel({ bridge, missionId, correction }: { readonly bridge: QuantumBridge; readonly missionId: string; readonly correction: string }) {
  const t = useT();
  const [live, setLive] = useState<CloudState>({ kind: 'idle' });
  const allForMission = bridge.cached(missionId);
  // The Qollab bridge also records the result it just returned, so the live card must not appear a second time
  // as a recorded one.
  const liveOk = live.kind === 'done' && live.result.status === 'ok' ? live.result : null;
  const cached = filterByDispatch(bridge.cached(missionId, correction), missionId, correction).filter((r) => liveOk === null || !sameRun(r, liveOk));
  const otherDispatches = Array.from(new Set(allForMission.map((r) => r.correction))).filter((c) => !cached.some((r) => r.correction === c));
  const canRun = bridge.kind === 'qollab' && typeof bridge.run === 'function';
  const remaining = bridge.jobsRemaining?.() ?? 0;
  const backend = bridge.backendName ?? t('cloud.selectedBackend');
  const run = async () => {
    if (!canRun || bridge.run === undefined) return;
    setLive({ kind: 'running' });
    const result = await bridge.run({ missionId, correction, shots: 100 });
    setLive({ kind: 'done', result });
  };
  return (
    <section className="panel-section cloud" data-testid="cloud-panel">
      <h2 className="panel-title">{t('cloud.title')}</h2>
      <p className="muted small">{t('cloud.intro', { correction })}</p>
      {cached.length === 0 && live.kind === 'idle' ? (
        <p className="cloud-empty" data-testid="cloud-empty">
          {t('cloud.empty', { others: otherDispatches.length > 0 ? t('cloud.emptyOthers', { list: otherDispatches.join(', ') }) : '' })}
        </p>
      ) : null}
      {cached.map((r, i) => (
        <CloudResultCard key={`${r.startedAt}-${String(i)}`} result={r} />
      ))}
      {live.kind === 'running' ? (
        <p className="cloud-running" role="status">
          {t('cloud.running', { backend })}
        </p>
      ) : null}
      {live.kind === 'done' ? (
        live.result.status === 'ok' ? (
          <CloudResultCard result={live.result} />
        ) : (
          <p className="cloud-error" role="alert">
            {t('cloud.failed', { message: live.result.message })}
          </p>
        )
      ) : null}
      {canRun ? (
        <button type="button" className="btn" onClick={() => void run()} disabled={live.kind === 'running' || remaining <= 0}>
          {remaining <= 0 ? t('cloud.noJobs') : t('cloud.verifyOn', { backend })}
        </button>
      ) : null}
    </section>
  );
}

function sameRun(a: CloudResultOk, b: CloudResultOk): boolean {
  return a === b || (a.backendName === b.backendName && a.jobId === b.jobId && a.startedAt === b.startedAt);
}

function CloudResultCard({ result }: { readonly result: CloudResultOk }) {
  const t = useT();
  const total = Object.values(result.counts).reduce((a, b) => a + b, 0);
  const top = Object.entries(result.counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);
  return (
    <div className={`cloud-card cloud-${result.source}`} data-testid="cloud-card">
      <p className="cloud-source">
        <span className="tag">{t(SOURCE_KEY[result.source])}</span> {result.backendName} · {t('cloud.shots', { n: result.shots })} · {new Date(result.finishedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC
      </p>
      <p className="cloud-dispatch small">
        {t('cloud.recordedCrews')} <span className="mono">{result.correction}</span> · {t('cloud.jobId')} <span className="mono">{result.jobId ?? t('cloud.noneLocal')}</span>
      </p>
      <ul className="counts">
        {top.map(([bits, n]) => (
          <li key={bits}>
            <span className="mono">{bits}</span> <span className="muted">{n}</span> <span className="bar" style={{ width: `${String(total > 0 ? (n / total) * 100 : 0)}%` }} aria-hidden="true" />
          </li>
        ))}
      </ul>
      <dl className="facts small cloud-facts">
        {summariseAnalysis(result, t).map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Curated, human-readable summary of the Python-side analysis (shape documented in qollab/q11/circuits.py). */
function summariseAnalysis(result: CloudResultOk, t: ReturnType<typeof useT>): readonly (readonly [string, string])[] {
  const out: (readonly [string, string])[] = [];
  const a = isRecord(result.analysis) ? result.analysis : {};
  const p = isRecord(result.prediction) ? result.prediction : {};
  const pct = (x: unknown): string | null => (typeof x === 'number' ? `${String(Math.round(x * 100))}%` : null);
  const bits = (x: unknown): string | null => (Array.isArray(x) && x.every((b) => b === 0 || b === 1) ? x.map(String).join('') : null);
  const dom = bits(a['dominantSyndrome']);
  const predSyn = bits(p['syndrome']);
  if (dom !== null) out.push([t('cloud.analysis.dominant'), predSyn !== null ? t('cloud.analysis.predicted', { dom, pred: predSyn }) : dom]);
  const synShare = pct(a['predictedSyndromeShare']);
  if (synShare !== null) out.push([t('cloud.analysis.syndromeShare'), synShare]);
  const ls = a['predictedLogicalShare'];
  if (Array.isArray(ls) && typeof ls[0] === 'number') out.push([t('cloud.analysis.logicalShare'), pct(ls[0]) ?? '—']);
  const dm = a['dominantMatches'];
  if (isRecord(dm)) {
    const ok = Object.values(dm).every((v) => v === true || v === null);
    out.push([t('cloud.analysis.dominantMatches'), ok ? t('cloud.analysis.yes') : t('cloud.analysis.no')]);
  }
  const em = a['exactMatchesIdealModel'] ?? a['matches'];
  if (isRecord(em)) out.push([t('cloud.analysis.exact'), Object.values(em).every((v) => v === true || v === null) ? t('cloud.analysis.yes') : t('cloud.analysis.noNoise')]);
  if (typeof p['verdict'] === 'string') out.push([t('cloud.analysis.verdict'), p['verdict']]);
  if (typeof a['readoutBasis'] === 'string' && typeof a['prep'] === 'string') out.push([t('cloud.analysis.prep'), t('cloud.analysis.prepValue', { prep: a['prep'], basis: a['readoutBasis'] })]);
  return out;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
