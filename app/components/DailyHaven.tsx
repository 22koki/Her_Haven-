'use client';

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, BookOpen, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CloudRain, CloudSun, Compass, Flower2, Heart, Leaf, LockKeyhole, Moon, Pencil, RefreshCw, Sparkles, Sprout, Sun, Sunrise, Trash2, UsersRound, Wind } from 'lucide-react';
import type { GoalArea, MomentMood, MomentNeed, MomentsAction, MomentsSnapshot, PersonalGoal, PrivateCheckIn } from '../../lib/moments-contract';

type Props = { displayName: string; onNavigate: (view: string) => void; notify: (message: string) => void };
type CheckInDraft = { day: string; mood: MomentMood | ''; need: MomentNeed; note: string; dirty: boolean };
type GoalDraft = { title: string; area: GoalArea; dirty: boolean };
type Section = 'check-in' | 'goal' | 'history';
type Removal = { kind: 'goal'; id: string } | { kind: 'check-in'; day: string; location: 'today' | 'history' } | null;
type Loaded = { key: string; day: string; data: MomentsSnapshot | null; error: string; status: number };

const MOODS = [
  { id: 'heavy', label: 'Feeling heavy', short: 'Heavy', icon: CloudRain, tone: 'lilac' },
  { id: 'tired', label: 'Low on energy', short: 'Tired', icon: Moon, tone: 'blue' },
  { id: 'steady', label: 'Somewhere steady', short: 'Steady', icon: CloudSun, tone: 'sage' },
  { id: 'hopeful', label: 'A little hopeful', short: 'Hopeful', icon: Sunrise, tone: 'peach' },
  { id: 'bright', label: 'Feeling bright', short: 'Bright', icon: Sun, tone: 'gold' },
] as const;
const NEEDS = [
  { id: 'quiet', label: 'Some quiet', icon: Wind },
  { id: 'connection', label: 'A little company', icon: UsersRound },
  { id: 'growth', label: 'A way forward', icon: Sprout },
  { id: 'joy', label: 'A little joy', icon: Sparkles },
  { id: 'unsure', label: 'Not sure yet', icon: Compass },
] as const;
const AREAS: { id: GoalArea; label: string }[] = [
  { id: 'care', label: 'Self care' }, { id: 'connection', label: 'Connection' },
  { id: 'work-money', label: 'Work & money' }, { id: 'joy', label: 'Joy' },
];
const DIRECTIONS: Record<MomentNeed, { title: string; body: string; action: string; view: string; icon: typeof Wind }> = {
  quiet: { title: 'A softer pause.', body: 'There is room to step out of the conversation for a moment. Nothing to keep up with here.', action: 'Visit the quiet room', view: 'quiet', icon: Wind },
  connection: { title: 'A little company.', body: 'Find women in your circles when you feel like sharing, listening, or simply being around others.', action: 'Find company', view: 'community', icon: UsersRound },
  growth: { title: 'One manageable next step.', body: 'Explore practical prompts and words for the conversations you want to have, at your own pace.', action: 'Explore Grow together', view: 'resources', icon: Sprout },
  joy: { title: 'Room for a good moment.', body: 'Choose something creative or playful. You do not have to earn a little enjoyment.', action: 'Visit the joy corner', view: 'joy', icon: Sparkles },
  unsure: { title: 'You can begin with a pause.', body: 'You do not have to know what you need yet. A quiet moment is a place to start.', action: 'Take a quiet moment', view: 'quiet', icon: Leaf },
};
const PATHWAYS = [
  { view: 'quiet', label: 'Take a breath', detail: 'The quiet room', icon: Wind, tone: 'lilac' },
  { view: 'community', label: 'Find your people', detail: 'Your community', icon: UsersRound, tone: 'rose' },
  { view: 'resources', label: 'Grow a little', detail: 'Work, life & words', icon: Sprout, tone: 'sage' },
  { view: 'joy', label: 'Make room for joy', detail: 'The joy corner', icon: Sun, tone: 'gold' },
] as const;

function BotanicalBranch({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 160 240" fill="none" aria-hidden="true" focusable="false">
    <path d="M82 225C76 185 71 138 83 92C91 61 111 31 124 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M79 192C49 194 25 178 19 153C46 150 71 165 79 192Z M77 162C98 146 122 147 139 157C126 178 98 182 77 162Z M77 128C50 127 32 108 32 86C57 91 75 104 77 128Z M85 103C108 83 136 87 149 101C130 118 104 119 85 103Z M100 61C77 60 61 45 64 24C88 31 98 43 100 61Z M110 41C128 24 147 27 155 34C145 51 129 56 110 41Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M23 157L78 191M81 162L134 158M37 90L77 128M87 102L143 101M69 29L100 61M113 42L150 35" stroke="currentColor" strokeWidth="1" opacity=".6" />
  </svg>;
}

function localDay() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function dayLabel(day: string, long = false) {
  return new Intl.DateTimeFormat(undefined, long
    ? { weekday: 'long', day: 'numeric', month: 'long' }
    : { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${day}T12:00:00`));
}
function draftFor(checkIn: PrivateCheckIn | null, day: string): CheckInDraft {
  return { day, mood: checkIn?.mood ?? '', need: checkIn?.need ?? 'unsure', note: checkIn?.note ?? '', dirty: false };
}
function goalDraftFor(goal: PersonalGoal | null): GoalDraft {
  return { title: goal?.title ?? '', area: goal?.area ?? 'care', dirty: false };
}
function apiUrl(day: string, before: string) {
  const query = new URLSearchParams({ day });
  if (before) query.set('before', before);
  return `/api/moments?${query}`;
}
async function readResponse(response: Response) {
  const body = await response.json().catch(() => null) as (MomentsSnapshot & { error?: string }) | null;
  if (!response.ok || !body) {
    const error = new Error(body?.error || 'Your private space could not connect. Please try again.');
    Object.assign(error, { status: response.status });
    throw error;
  }
  return body;
}
function statusOf(error: unknown) {
  return error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : 0;
}

function ConfirmRemoval({ title, message, busy, onCancel, onConfirm }: { title: string; message: string; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const id = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancel.current?.focus(); }, []);
  return <div className="daily-confirm" role="group" aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`}>
    <strong id={`${id}-title`}>{title}</strong><p id={`${id}-body`}>{message}</p>
    <div className="daily-actions"><button ref={cancel} className="btn btn-secondary" type="button" disabled={busy} onClick={onCancel}>Keep it</button><button className="btn btn-danger" type="button" disabled={busy} onClick={onConfirm}>{busy ? 'Removing…' : 'Yes, remove it'}</button></div>
  </div>;
}

export function DailyHaven({ displayName, onNavigate, notify }: Props) {
  const [day, setDay] = useState(localDay);
  const dayRef = useRef(day);
  const [cursors, setCursors] = useState<string[]>(['']);
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const before = cursors[page] ?? '';
  const requestKey = `${day}|${before}|${refresh}`;
  const [loaded, setLoaded] = useState<Loaded>({ key: '', day: '', data: null, error: '', status: 0 });
  const [checkIn, setCheckIn] = useState<CheckInDraft>(() => draftFor(null, day));
  const [goalDraft, setGoalDraft] = useState<GoalDraft>(() => goalDraftFor(null));
  const [editingCheckIn, setEditingCheckIn] = useState(false);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalIsNew, setGoalIsNew] = useState(false);
  const [removal, setRemoval] = useState<Removal>(null);
  const [actionError, setActionError] = useState<{ section: Section; message: string } | null>(null);
  const [actionBusy, setActionBusy] = useState<Section | null>(null);
  const busyRef = useRef(false);
  const mutation = useRef<AbortController | null>(null);
  const checkInHeading = useRef<HTMLHeadingElement>(null);
  const goalHeading = useRef<HTMLHeadingElement>(null);
  const historySummary = useRef<HTMLElement>(null);
  const firstMood = useRef<HTMLInputElement>(null);
  const goalInput = useRef<HTMLInputElement>(null);
  const snapshot = loaded.day === day ? loaded.data : null;
  const loading = loaded.key !== requestKey;
  const busy = loading || actionBusy !== null;
  const available = Boolean(snapshot?.profileReady);
  const today = snapshot?.today ?? null;
  const goal = snapshot?.goal ?? null;
  const draftIsOld = checkIn.dirty && checkIn.day !== day;
  const showCheckInForm = available && (!today || editingCheckIn || checkIn.dirty);
  const showGoalForm = available && (!goal || editingGoal);
  const selectedNeed = showCheckInForm && !draftIsOld ? checkIn.need : today?.need ?? 'unsure';
  const direction = DIRECTIONS[selectedNeed];
  const DirectionIcon = direction.icon;

  const syncCalendarDay = useCallback(() => {
    const next = localDay();
    if (next === dayRef.current) return false;
    dayRef.current = next;
    setDay(next); setCursors(['']); setPage(0); setRemoval(null);
    return true;
  }, []);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') syncCalendarDay(); };
    window.addEventListener('focus', syncCalendarDay);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener('focus', syncCalendarDay); document.removeEventListener('visibilitychange', onVisible); mutation.current?.abort(); };
  }, [syncCalendarDay]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(apiUrl(day, before), { cache: 'no-store', signal: controller.signal });
        const data = await readResponse(response);
        if (controller.signal.aborted) return;
        setLoaded({ key: requestKey, day, data, error: '', status: response.status });
        setCheckIn(previous => previous.dirty ? previous : draftFor(data.today, day));
        setGoalDraft(previous => previous.dirty ? previous : goalDraftFor(data.goal));
      } catch (error) {
        if (controller.signal.aborted) return;
        const status = statusOf(error);
        setLoaded(previous => ({ key: requestKey, day, data: status === 401 || status === 403 || previous.day !== day ? null : previous.data, error: error instanceof Error ? error.message : 'Your private space could not connect. Please try again.', status }));
      }
    }
    void load();
    return () => controller.abort();
  }, [day, before, requestKey]);

  async function runAction(action: MomentsAction, section: Section, message: string) {
    if (busyRef.current || loading || !available) return null;
    if (syncCalendarDay()) {
      setActionError({ section, message: 'Your local date has changed. Give today a moment to load, then try again.' });
      return null;
    }
    const requestedDay = day;
    const controller = new AbortController();
    mutation.current = controller;
    busyRef.current = true; setActionBusy(section); setActionError(null);
    try {
      const response = await fetch(apiUrl(requestedDay, before), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action), signal: controller.signal });
      const data = await readResponse(response);
      if (controller.signal.aborted) return null;
      if (dayRef.current === requestedDay) {
        setLoaded({ key: requestKey, day: requestedDay, data, error: '', status: response.status });
        setCheckIn(previous => previous.dirty ? previous : draftFor(data.today, requestedDay));
        setGoalDraft(previous => previous.dirty ? previous : goalDraftFor(data.goal));
      }
      notify(message);
      return data;
    } catch (error) {
      if (controller.signal.aborted) return null;
      const status = statusOf(error);
      if (status === 401 || status === 403) setLoaded({ key: requestKey, day: requestedDay, data: null, error: error instanceof Error ? error.message : 'Please refresh your sign-in to continue.', status });
      setActionError({ section, message: error instanceof Error ? error.message : 'This change could not be saved. Your draft is still here.' });
      return null;
    } finally {
      busyRef.current = false;
      if (!controller.signal.aborted) setActionBusy(null);
    }
  }

  async function saveCheckIn(event: FormEvent) {
    event.preventDefault();
    if (!checkIn.mood || draftIsOld) return;
    const savedDay = day;
    const data = await runAction({ action: 'save-check-in', day, mood: checkIn.mood, need: checkIn.need, note: checkIn.note.trim() }, 'check-in', 'Your check-in is saved privately.');
    if (data && dayRef.current === savedDay) {
      setCheckIn(draftFor(data.today, savedDay)); setEditingCheckIn(false); checkInHeading.current?.focus();
    }
  }

  async function saveGoal(event: FormEvent) {
    event.preventDefault();
    const data = await runAction({ action: 'save-goal', title: goalDraft.title.trim(), area: goalDraft.area }, 'goal', 'Your small step is saved. There is no rush.');
    if (data) { setGoalDraft(goalDraftFor(data.goal)); setEditingGoal(false); setGoalIsNew(false); goalHeading.current?.focus(); }
  }

  async function removeSaved() {
    if (!removal) return;
    const currentRemoval = removal;
    const action: MomentsAction = currentRemoval.kind === 'goal' ? { action: 'delete-goal', id: currentRemoval.id } : { action: 'delete-check-in', day: currentRemoval.day };
    const section = currentRemoval.kind === 'goal' ? 'goal' : currentRemoval.location === 'today' ? 'check-in' : 'history';
    const data = await runAction(action, section, currentRemoval.kind === 'goal' ? 'Your saved step has been removed.' : 'That check-in has been removed from your account.');
    if (!data) return;
    setRemoval(null);
    if (currentRemoval.kind === 'goal') { setGoalDraft(goalDraftFor(null)); setEditingGoal(false); goalHeading.current?.focus(); }
    else if (currentRemoval.location === 'today') { setCheckIn(previous => previous.dirty ? previous : draftFor(data.today, day)); checkInHeading.current?.focus(); }
    else historySummary.current?.focus();
  }

  function editCheckIn() {
    setCheckIn(draftFor(today, day)); setEditingCheckIn(true); setActionError(null); setRemoval(null);
    requestAnimationFrame(() => firstMood.current?.focus());
  }
  function editGoal(fresh = false) {
    setGoalDraft(fresh ? { ...goalDraftFor(null), dirty: true } : goalDraftFor(goal));
    setGoalIsNew(fresh); setEditingGoal(true); setActionError(null); setRemoval(null);
    requestAnimationFrame(() => goalInput.current?.focus());
  }
  function cancelRemoval() {
    const current = removal; setRemoval(null);
    if (current?.kind === 'goal') goalHeading.current?.focus();
    else if (current?.kind === 'check-in' && current.location === 'today') checkInHeading.current?.focus();
    else historySummary.current?.focus();
  }
  const errorFor = (section: Section) => actionError?.section === section ? <p className="daily-error" role="alert">{actionError.message}</p> : null;

  return <section className="daily-haven" aria-labelledby="daily-haven-title">
    <header className="daily-intro">
      <div className="daily-intro-copy">
        <p className="daily-eyebrow daily-hero-kicker"><Sparkles size={15} aria-hidden="true" />YOUR OWN LITTLE CORNER</p>
        <p className="daily-hello">Welcome back, {displayName}.</p>
        <h1 id="daily-haven-title">A little room<br /><em>for today.</em></h1>
        <p className="daily-intro-description">Notice where you are. Choose one small thing.<br className="daily-desktop-break" /> There is no need to do it all.</p>
        <div className="daily-hero-actions"><button className="btn btn-primary" type="button" onClick={() => {
          const heading = checkInHeading.current;
          heading?.scrollIntoView({ behavior: 'instant', block: 'start' });
          heading?.focus({ preventScroll: true });
        }}>A moment for me <Heart size={16} aria-hidden="true" /></button><button className="daily-hero-link" type="button" disabled={actionBusy !== null} onClick={() => onNavigate('quiet')}><span><Wind size={17} aria-hidden="true" /></span>Just take a breath</button></div>
        <div className="daily-date"><CalendarDays size={16} aria-hidden="true" /><time dateTime={day}>{dayLabel(day, true)}</time><span>Your local day</span></div>
      </div>
      <div className="daily-intro-art" aria-hidden="true">
        <span className="daily-art-disc" /><span className="daily-art-orbit" />
        <BotanicalBranch className="daily-hero-botanical" />
        <div className="daily-art-frame"><img src="/images/hero-gathering.webp" alt="" /><span className="daily-art-caption">a little more together</span></div>
        <span className="daily-art-stamp"><Flower2 size={31} strokeWidth={1.2} /><span>COME AS<br />YOU ARE</span></span>
        <span className="daily-art-note"><Heart size={17} strokeWidth={1.4} />nothing to prove.<br />room to just be.</span>
        <span className="daily-art-star daily-art-star-one">✦</span><span className="daily-art-star daily-art-star-two">✧</span>
      </div>
    </header>

    <nav className="daily-pathways" aria-label="Choose a place in Her Haven">{PATHWAYS.map(place => { const PlaceIcon = place.icon; return <button className={`daily-pathway daily-pathway-${place.tone}`} type="button" key={place.view} disabled={actionBusy !== null} onClick={() => onNavigate(place.view)}><span className="daily-pathway-icon"><PlaceIcon size={27} strokeWidth={1.45} aria-hidden="true" /></span><span className="daily-pathway-copy"><strong>{place.label}</strong><span>{place.detail}</span></span><ArrowRight className="daily-pathway-arrow" size={18} aria-hidden="true" /></button>; })}</nav>

    <div className="daily-privacy"><LockKeyhole size={17} aria-hidden="true" /><p><strong>Just for your own reflection.</strong> Saved to your account. Never posted to circles or the Care desk.</p><button className="daily-refresh" type="button" disabled={busy} onClick={() => { syncCalendarDay(); setRefresh(value => value + 1); }} aria-label="Refresh private check-ins and goal"><RefreshCw size={17} aria-hidden="true" /></button></div>

    {!loading && loaded.error && <div className="daily-connection" role="alert"><div><strong>{loaded.status === 401 ? 'Let’s reconnect your sign-in.' : 'Your private space needs a moment.'}</strong><p>{loaded.error}</p><p className="daily-small">You can still explore the rest of Her Haven. Any unsaved draft in this view stays here while you retry.</p></div><div className="daily-actions">{loaded.status === 401 ? <a className="btn btn-primary" href="/signin-with-chatgpt?return_to=%2F%23home">Sign in again <ArrowRight size={15} aria-hidden="true" /></a> : <button className="btn btn-secondary" type="button" onClick={() => setRefresh(value => value + 1)}>Try again <RefreshCw size={15} aria-hidden="true" /></button>}</div></div>}
    {!loading && snapshot && !snapshot.profileReady && <div className="daily-connection"><div><strong>Make a little space of your own.</strong><p>Complete your chosen-name profile and welcome agreement before saving a private check-in or goal.</p></div><button className="btn btn-primary" type="button" onClick={() => onNavigate('space')}>Go to My space <ArrowRight size={15} aria-hidden="true" /></button></div>}

    <div className="daily-grid">
      <section className="daily-checkin daily-card" aria-labelledby="daily-checkin-title" aria-busy={loading || actionBusy === 'check-in'}>
        <div className="daily-card-heading"><span className="daily-card-mark daily-mark-rose"><Heart size={22} strokeWidth={1.5} aria-hidden="true" /></span><div><p className="daily-eyebrow">A MOMENT WITH YOURSELF</p><h2 ref={checkInHeading} id="daily-checkin-title" tabIndex={-1}>How are you arriving?</h2></div>{today && !showCheckInForm && <span className="daily-saved"><Check size={13} aria-hidden="true" />Saved today</span>}</div>
        <p className="daily-card-intro">No right answer. No need to make it sound better.</p>

        {loading && !snapshot ? <div className="daily-loading" role="status"><Flower2 size={26} aria-hidden="true" /><span>Opening your own little corner…</span></div> : !available ? <div className="daily-unavailable"><Leaf size={25} aria-hidden="true" /><p>Your saved check-ins will appear here when your private space is connected.</p></div> : showCheckInForm ? <form onSubmit={saveCheckIn}>
          {draftIsOld && <div className="daily-day-change" role="status"><strong>A new day has arrived.</strong><p>Your unsaved draft from {dayLabel(checkIn.day)} is still here. Choose whether to use it for today or start fresh.</p><div className="daily-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setCheckIn(previous => ({ ...previous, day, dirty: true }))}>Use this draft today</button><button type="button" className="daily-link" disabled={busy} onClick={() => { setCheckIn(draftFor(today, day)); setEditingCheckIn(false); }}>Start fresh</button></div></div>}
          <fieldset className="daily-fieldset" disabled={busy || draftIsOld}><legend>What feels closest right now?</legend><div className="daily-moods">{MOODS.map((mood, index) => { const MoodIcon = mood.icon; return <label key={mood.id} className={`daily-mood daily-mood-${mood.tone} ${checkIn.mood === mood.id ? 'is-selected' : ''}`}><input ref={index === 0 ? firstMood : undefined} type="radio" name="daily-mood" value={mood.id} checked={checkIn.mood === mood.id} required onChange={() => { setCheckIn(previous => ({ ...previous, mood: mood.id, dirty: true })); setActionError(null); }} /><MoodIcon size={25} strokeWidth={1.5} aria-hidden="true" /><span>{mood.label}</span><Check className="daily-choice-tick" size={13} aria-hidden="true" /></label>; })}</div></fieldset>
          <fieldset className="daily-fieldset daily-needs-fieldset" disabled={busy || draftIsOld}><legend>What would feel helpful?</legend><div className="daily-needs">{NEEDS.map(need => { const NeedIcon = need.icon; return <label key={need.id} className={`daily-need ${checkIn.need === need.id ? 'is-selected' : ''}`}><input type="radio" name="daily-need" value={need.id} checked={checkIn.need === need.id} onChange={() => setCheckIn(previous => ({ ...previous, need: need.id, dirty: true }))} /><NeedIcon size={16} aria-hidden="true" /><span>{need.label}</span></label>; })}</div></fieldset>
          <label className="daily-label" htmlFor="daily-note">Anything you want to put down? <span>Optional</span></label><textarea id="daily-note" rows={3} maxLength={1200} disabled={busy || draftIsOld} value={checkIn.note} onChange={event => setCheckIn(previous => ({ ...previous, note: event.target.value, dirty: true }))} placeholder="A thought, a small win, or something taking up space…" aria-describedby="daily-note-hint" /><div className="daily-field-footer"><span id="daily-note-hint">A few words are enough. You can leave this blank.</span><span>{checkIn.note.length}/1,200</span></div>
          {errorFor('check-in')}<div className="daily-save-row"><button className="btn btn-primary" type="submit" disabled={busy || draftIsOld || !checkIn.mood}>{actionBusy === 'check-in' ? 'Saving…' : today ? 'Save changes' : 'Save my check-in'}<Check size={16} aria-hidden="true" /></button>{today && <button className="daily-link" type="button" disabled={busy} onClick={() => { setCheckIn(draftFor(today, day)); setEditingCheckIn(false); setActionError(null); checkInHeading.current?.focus(); }}>Cancel changes</button>}<span className="daily-draft-status">{checkIn.dirty ? 'Unsaved changes' : 'Only saved when you choose'}</span></div>
        </form> : today && <div className="daily-today-summary">
          <div className={`daily-arrival-summary daily-mood-${MOODS.find(item => item.id === today.mood)?.tone ?? 'sage'}`}><span className="daily-summary-icon" aria-hidden="true">{(() => { const MoodIcon = MOODS.find(item => item.id === today.mood)?.icon ?? CloudSun; return <MoodIcon size={32} strokeWidth={1.4} />; })()}</span><div><span>You arrived feeling</span><h3>{MOODS.find(item => item.id === today.mood)?.label ?? today.mood}</h3><p>{today.need === 'unsure' ? 'Still finding what you need. That is allowed.' : `Making room for ${NEEDS.find(item => item.id === today.need)?.label.toLowerCase() ?? today.need}.`}</p></div></div>
          {today.note ? <div className="daily-saved-note"><span>Your own words</span><p>{today.note}</p></div> : <p className="daily-no-note">You checked in with yourself. That is enough for this moment.</p>}
          <div className="daily-summary-actions"><button className="btn btn-secondary" type="button" disabled={busy} onClick={editCheckIn}><Pencil size={15} aria-hidden="true" />Edit today’s check-in</button><button className="daily-icon-action" type="button" disabled={busy} onClick={() => setRemoval({ kind: 'check-in', day: today.day, location: 'today' })} aria-label="Remove today’s saved check-in"><Trash2 size={17} aria-hidden="true" /></button></div>
          {removal?.kind === 'check-in' && removal.location === 'today' && <ConfirmRemoval title="Remove today’s check-in?" message="This removes its feeling, selected need, and note from your account. You cannot undo it here." busy={busy} onCancel={cancelRemoval} onConfirm={() => void removeSaved()} />}{errorFor('check-in')}
        </div>}
      </section>

      <div className="daily-side">
        <section className={`daily-goal daily-card ${goal?.completed && !showGoalForm ? 'daily-goal-done' : ''}`} aria-labelledby="daily-goal-title" aria-busy={loading || actionBusy === 'goal'}><div className="daily-card-heading"><span className="daily-card-mark daily-mark-sage"><Sprout size={22} strokeWidth={1.5} aria-hidden="true" /></span><div><p className="daily-eyebrow">SMALL IS STILL SOMETHING</p><h2 ref={goalHeading} id="daily-goal-title" tabIndex={-1}>One gentle step.</h2></div></div><p className="daily-card-intro">Something small, just for you. No deadline to race.</p>
          {loading && !snapshot ? <div className="daily-loading" role="status"><Leaf size={23} aria-hidden="true" /><span>Finding your small step…</span></div> : !available ? <p className="daily-unavailable">Your personal goal will appear here when your private space is connected.</p> : showGoalForm ? <form onSubmit={saveGoal}>
            <label className="daily-label" htmlFor="daily-goal-input">What would you like to make room for?</label><input ref={goalInput} id="daily-goal-input" value={goalDraft.title} onChange={event => setGoalDraft(previous => ({ ...previous, title: event.target.value, dirty: true }))} minLength={1} maxLength={160} required disabled={busy} placeholder="Call a friend, or put a little money aside…" aria-describedby="daily-goal-hint" /><label className="daily-label" htmlFor="daily-goal-area">A part of your life</label><select id="daily-goal-area" value={goalDraft.area} disabled={busy} onChange={event => setGoalDraft(previous => ({ ...previous, area: event.target.value as GoalArea, dirty: true }))}>{AREAS.map(area => <option key={area.id} value={area.id}>{area.label}</option>)}</select><p className="daily-goal-hint" id="daily-goal-hint">{goalIsNew && goal ? 'You keep one saved step at a time. Saving a new one replaces the step shown before.' : 'One saved step at a time. It is yours to change, complete, or remove.'}</p>{errorFor('goal')}<div className="daily-goal-form-actions"><button type="submit" className="btn btn-primary" disabled={busy || !goalDraft.title.trim()}>{actionBusy === 'goal' ? 'Saving…' : goal && !goalIsNew ? 'Save this step' : 'Save my small step'}<ArrowRight size={15} aria-hidden="true" /></button>{goal && <button type="button" className="daily-link" disabled={busy} onClick={() => { setGoalDraft(goalDraftFor(goal)); setEditingGoal(false); setGoalIsNew(false); setActionError(null); goalHeading.current?.focus(); }}>Keep my current step</button>}</div>{goalDraft.dirty && <p className="daily-draft-status">Unsaved changes</p>}
          </form> : goal && <div className="daily-goal-summary"><span className="daily-area-label">{AREAS.find(area => area.id === goal.area)?.label ?? goal.area}</span>{goal.completed && <span className="daily-goal-complete-mark"><CheckCircle2 size={25} strokeWidth={1.5} aria-hidden="true" />That counts.</span>}<h3>{goal.title}</h3><p className="daily-goal-message">{goal.completed ? 'A little thing you made room for. You can simply enjoy that.' : 'A small intention, with room for life to happen around it.'}</p><button className={`btn ${goal.completed ? 'btn-secondary' : 'btn-primary'} daily-complete-button`} type="button" disabled={busy} onClick={async () => { await runAction({ action: 'goal-completion', id: goal.id, completed: !goal.completed }, 'goal', goal.completed ? 'Your step is open again. Take your time.' : 'Your small step is complete. That counts.'); }}><CheckCircle2 size={17} aria-hidden="true" />{goal.completed ? 'Keep working on it' : 'Mark this step complete'}</button><div className="daily-goal-tools"><button className="daily-link" type="button" disabled={busy} onClick={() => editGoal(goal.completed)}><Pencil size={15} aria-hidden="true" />{goal.completed ? 'Choose another step' : 'Change my step'}</button><button className="daily-icon-action" type="button" aria-label="Remove saved goal" disabled={busy} onClick={() => setRemoval({ kind: 'goal', id: goal.id })}><Trash2 size={17} aria-hidden="true" /></button></div>{removal?.kind === 'goal' && <ConfirmRemoval title="Remove this saved step?" message="This removes the goal and its completion state from your account. You cannot undo it here." busy={busy} onCancel={cancelRemoval} onConfirm={() => void removeSaved()} />}{errorFor('goal')}</div>}
        </section>

        <aside className={`daily-direction daily-direction-${selectedNeed}`} aria-label="A place you can choose"><BotanicalBranch className="daily-direction-botanical" /><DirectionIcon className="daily-direction-symbol" size={30} strokeWidth={1.4} aria-hidden="true" /><p className="daily-eyebrow">ROOM FOR WHAT YOU NEED</p><h2>{direction.title}</h2><p>{direction.body}</p><button className="daily-link" type="button" disabled={actionBusy !== null} onClick={() => onNavigate(direction.view)}>{direction.action}<ArrowRight size={16} aria-hidden="true" /></button><span className="daily-direction-note">An invitation, never a task.</span></aside>
      </div>
    </div>

    <details className="daily-history"><summary ref={historySummary}><span className="daily-history-mark"><BookOpen size={22} strokeWidth={1.5} aria-hidden="true" /></span><span><strong>Your private check-ins</strong><span>Look back when you want to. There is no streak to keep.</span></span><ChevronDown size={20} aria-hidden="true" /></summary><div className="daily-history-body" aria-busy={loading || actionBusy === 'history'}><p className="daily-history-intro"><LockKeyhole size={14} aria-hidden="true" />These are your saved moments, including today. You can remove any entry.</p>
      {loading ? <p className="daily-history-status" role="status">Loading this page of your check-ins…</p> : !available ? <p className="daily-history-status">Connect your private space to see your saved check-ins.</p> : snapshot?.history.length ? <div className="daily-history-list">{snapshot.history.map(entry => { const mood = MOODS.find(item => item.id === entry.mood); const MoodIcon = mood?.icon ?? CloudSun; return <article key={entry.day} className="daily-history-entry"><div className="daily-history-entry-heading"><span className={`daily-history-mood daily-mood-${mood?.tone ?? 'sage'}`}><MoodIcon size={20} strokeWidth={1.5} aria-hidden="true" /></span><div><h3><time dateTime={entry.day}>{entry.day === day ? 'Today' : dayLabel(entry.day)}</time></h3><p>{mood?.short ?? entry.mood}<span aria-hidden="true"> · </span>{NEEDS.find(need => need.id === entry.need)?.label ?? entry.need}</p></div><button className="daily-icon-action" type="button" disabled={busy} aria-label={`Remove check-in from ${dayLabel(entry.day)}`} onClick={() => setRemoval({ kind: 'check-in', day: entry.day, location: 'history' })}><Trash2 size={17} aria-hidden="true" /></button></div>{entry.note && <p className="daily-history-note">{entry.note}</p>}{removal?.kind === 'check-in' && removal.location === 'history' && removal.day === entry.day && <ConfirmRemoval title={`Remove the check-in from ${dayLabel(entry.day)}?`} message="This removes its feeling, selected need, and note from your account. You cannot undo it here." busy={busy} onCancel={cancelRemoval} onConfirm={() => void removeSaved()} />}</article>; })}</div> : <div className="daily-history-empty"><Flower2 size={30} strokeWidth={1.3} aria-hidden="true" /><h3>{page ? 'No more check-ins on this page.' : 'Your own words, when you are ready.'}</h3><p>{page ? 'Use Newer check-ins to return to a more recent page.' : 'A saved check-in will appear here. Skipping a day does not take anything away.'}</p></div>}
      {errorFor('history')}{available && <div className="daily-history-pagination"><button className="btn btn-secondary" type="button" disabled={busy || page === 0} onClick={() => { setRemoval(null); setPage(value => Math.max(0, value - 1)); }}><ChevronLeft size={16} aria-hidden="true" />Newer check-ins</button><span>Page {page + 1}</span><button className="btn btn-secondary" type="button" disabled={busy || !snapshot?.nextCursor} onClick={() => { if (!snapshot?.nextCursor) return; setRemoval(null); setCursors(previous => [...previous.slice(0, page + 1), snapshot.nextCursor!]); setPage(value => value + 1); }}>Older check-ins<ChevronRight size={16} aria-hidden="true" /></button></div>}<p className="daily-history-footnote">Clearing your private data in My space also removes these check-ins and your saved step.</p>
    </div></details>
  </section>;
}
