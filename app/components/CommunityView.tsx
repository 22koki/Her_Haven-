'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowRight, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, Eye, EyeOff, Flag, Flower2, HandHeart, Heart, HeartHandshake, Leaf, Lightbulb, LoaderCircle, LockKeyhole, MessageCircle, MessagesSquare, MoreHorizontal, Plus, RefreshCw, Search, Send, ShieldCheck, ShieldOff, Sparkles, Sprout, Trash2, UserCheck, UsersRound, X } from 'lucide-react';
import { CIRCLES, RESPONSE_OPTIONS } from '../../lib/haven-data';
import type { CommunityAction, CommunityPost, CommunityQuery, CommunityReply, CommunitySnapshot, CommunityStatus, ContentTarget, ModeratorMember, ModeratorReport } from '../../lib/community-contract';

type Props = {
  hasProfile: boolean;
  notify: (message: string) => void;
  onNavigate: (view: string) => void;
  onSetupProfile: () => void;
};
type Tab = 'conversations' | 'reports' | 'boundaries' | 'moderation';
type CareTab = 'applications' | 'reports' | 'content' | 'members' | 'audit';
type DialogState =
  | { kind: 'compose' }
  | { kind: 'thread'; postId: string }
  | { kind: 'report' | 'block' | 'delete'; targetType: ContentTarget; targetId: string }
  | { kind: 'unblock'; id: string; label: string }
  | { kind: 'member'; member: ModeratorMember; status: Exclude<CommunityStatus, 'pending'> }
  | { kind: 'content'; targetType: ContentTarget; targetId: string; decision: 'hide' | 'restore'; preview?: string }
  | { kind: 'resolve'; report: ModeratorReport; decision: 'actioned' | 'dismissed' };

const STATUS_LABELS: Record<CommunityStatus, string> = { pending: 'Awaiting review', approved: 'Approved member', declined: 'Request declined', suspended: 'Membership paused' };
const REPORT_LABELS: Record<string, string> = { harassment: 'Unkindness or harassment', privacy: 'Privacy or unwanted sharing', 'harmful-advice': 'Harmful advice', spam: 'Spam or selling', other: 'Something else' };
const REPORT_STATUS: Record<string, string> = { open: 'Awaiting review', actioned: 'Action taken', dismissed: 'Review complete' };

class CommunityApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function requestSnapshot(query: CommunityQuery = {}, action?: CommunityAction, signal?: AbortSignal): Promise<CommunitySnapshot> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') params.set(key, String(value));
  const response = await fetch(`/api/community${params.size ? `?${params}` : ''}`, {
    method: action ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal,
    ...(action ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action) } : {}),
  });
  const data = await response.json().catch(() => null) as (Partial<CommunitySnapshot> & { error?: unknown }) | null;
  if (!response.ok) throw new CommunityApiError(typeof data?.error === 'string' ? data.error : 'The community could not connect just now. Please try again.', response.status);
  if (!data || typeof data.profileReady !== 'boolean' || !Array.isArray(data.posts) || !Array.isArray(data.replies) || !Array.isArray(data.reports) || !Array.isArray(data.blocks) || !Array.isArray(data.ownContent) || !Array.isArray(data.joinedCircles)) throw new CommunityApiError('The community response was incomplete. Please try again.', 503);
  return data as CommunitySnapshot;
}

function errorMessage(error: unknown): string {
  return error instanceof CommunityApiError ? error.message : 'We could not reach your community. Check your connection and try again.';
}

function dateLabel(value: string, detailed = false): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', ...(detailed ? { year: 'numeric', hour: 'numeric', minute: '2-digit' } as const : {}) }).format(date);
}

function moveTabFocus(event: KeyboardEvent<HTMLElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const index = tabs.findIndex(button => button === document.activeElement);
  if (index < 0 || !tabs.length) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next].focus(); tabs[next].click();
}

function ResponseLabel({ value }: { value: string }) {
  const preference = RESPONSE_OPTIONS.find(option => option.id === value);
  const Icon = value === 'no-replies' ? Leaf : value === 'celebrate' ? Sparkles : value === 'advice' ? Lightbulb : value === 'experience' ? MessagesSquare : value === 'practical' ? HandHeart : Heart;
  return <span className={`community-response community-response-${value}`}><Icon aria-hidden="true" />{preference?.label || 'Share gently'}</span>;
}

function CommunityDialog({ title, children, busy, onClose }: { title: string; children: ReactNode; busy: boolean; onClose: () => void }) {
  const element = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = element.current;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    return () => { dialog?.close(); document.body.style.overflow = previousOverflow; };
  }, []);
  return <dialog ref={element} className="community-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="community-dialog-body">
      <div className="community-dialog-header"><h2 id={titleId}>{title}</h2><button type="button" className="community-icon-button" disabled={busy} aria-label="Close dialog" onClick={onClose}><X aria-hidden="true" /></button></div>
      {children}
    </div>
  </dialog>;
}

function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="community-error" role="alert"><CircleHelp aria-hidden="true" /><div><p>{message}</p>{retry && <button type="button" className="text-button" onClick={retry}>Try again <RefreshCw size={14} aria-hidden="true" /></button>}</div></div>;
}

function Empty({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="community-empty">{icon}<h3>{title}</h3><p>{children}</p>{action}</div>;
}

export function CommunityView({ hasProfile, notify, onNavigate, onSetupProfile }: Props) {
  const [snapshot, setSnapshot] = useState<CommunitySnapshot | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [signedOut, setSignedOut] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [selectedTab, setTab] = useState<Tab>('conversations');
  const [careTab, setCareTab] = useState<CareTab>('applications');
  const [circle, setCircle] = useState('');
  const [search, setSearch] = useState('');
  const [responseFilter, setResponseFilter] = useState('all');
  const [pages, setPages] = useState<(string | undefined)[]>([undefined]);
  const [page, setPage] = useState(0);
  const [application, setApplication] = useState('');
  const [applicationConsent, setApplicationConsent] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [dialogError, setDialogError] = useState('');
  const [postBody, setPostBody] = useState('');
  const [postCircle, setPostCircle] = useState('');
  const [postResponse, setPostResponse] = useState('listen');
  const [quiet, setQuiet] = useState(false);
  const [shareConsent, setShareConsent] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replyConsent, setReplyConsent] = useState(false);
  const [thread, setThread] = useState<CommunitySnapshot | null>(null);
  const [threadLoadedKey, setThreadLoadedKey] = useState<string | null>(null);
  const [threadError, setThreadError] = useState('');
  const [replyPages, setReplyPages] = useState<(string | undefined)[]>([undefined]);
  const [replyPage, setReplyPage] = useState(0);
  const [reason, setReason] = useState('');
  const [reportReason, setReportReason] = useState('harassment');
  const [reportDetails, setReportDetails] = useState('');
  const [memberFilter, setMemberFilter] = useState('all');
  const latestRequest = useRef(0);

  const reload = useCallback(() => { setError(''); setRefresh(value => value + 1); }, []);
  const cursor = pages[page];
  const replyCursor = replyPages[replyPage];
  const threadId = dialog?.kind === 'thread' ? dialog.postId : null;
  const fetchKey = JSON.stringify([circle, cursor, refresh, hasProfile]);
  const threadKey = JSON.stringify([threadId, replyCursor, refresh]);
  const loading = loadedKey !== fetchKey;
  const threadLoading = threadId !== null && threadLoadedKey !== threadKey;
  const tab = selectedTab === 'moderation' && snapshot && !snapshot.moderation ? 'conversations' : selectedTab;

  useEffect(() => {
    const abort = new AbortController();
    const current = ++latestRequest.current;
    requestSnapshot({ ...(circle ? { circle } : {}), cursor, limit: 30 }, undefined, abort.signal)
      .then(data => { if (current !== latestRequest.current) return; setSnapshot(data); setSignedOut(false); setError(''); })
      .catch(cause => {
        if (abort.signal.aborted || current !== latestRequest.current) return;
        setError(errorMessage(cause));
        if (cause instanceof CommunityApiError && (cause.status === 401 || cause.status === 403)) { setSnapshot(null); setSignedOut(cause.status === 401); }
      })
      .finally(() => { if (!abort.signal.aborted && current === latestRequest.current) setLoadedKey(fetchKey); });
    return () => abort.abort();
  }, [circle, cursor, fetchKey]);

  useEffect(() => { const focus = () => reload(); window.addEventListener('focus', focus); return () => window.removeEventListener('focus', focus); }, [reload]);

  useEffect(() => {
    if (!threadId) return;
    const abort = new AbortController();
    requestSnapshot({ post: threadId, replyCursor, limit: 50 }, undefined, abort.signal)
      .then(data => { if (abort.signal.aborted) return; setThread(data); setThreadError(''); if (!data.profileReady || data.membership?.status !== 'approved') { setSnapshot(data); setDialog(null); } })
      .catch(cause => { if (!abort.signal.aborted) { setThread(null); setThreadError(errorMessage(cause)); } })
      .finally(() => { if (!abort.signal.aborted) setThreadLoadedKey(threadKey); });
    return () => abort.abort();
  }, [threadId, replyCursor, threadKey]);

  const joinedCircles = CIRCLES.filter(item => snapshot?.joinedCircles.includes(item.id));
  const membership = snapshot?.membership;
  const approved = membership?.status === 'approved';
  const moderation = snapshot?.moderation;
  const openReports = snapshot?.reports.filter(item => item.status === 'open') || [];
  const pendingMembers = moderation?.members.filter(member => member.status === 'pending') || [];
  const careReports = moderation?.reports.filter(report => report.status === 'open') || [];
  const visiblePosts = useMemo(() => (snapshot?.posts || []).filter(post =>
    (responseFilter === 'all' || post.responsePreference === responseFilter) &&
    (!search.trim() || `${post.body} ${post.author}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  ), [snapshot, responseFilter, search]);
  const currentThreadPost = thread?.posts.find(post => post.id === threadId);
  const currentReplies = thread?.replies.filter(reply => reply.postId === threadId) || [];

  function chooseCircle(value: string) { setCircle(value); setPages([undefined]); setPage(0); setSearch(''); setError(''); }
  function openDialog(next: DialogState) {
    setDialogError(''); setReason(''); setReportReason('harassment'); setReportDetails('');
    if (next.kind === 'compose') { setPostCircle(circle || joinedCircles[0]?.id || ''); setShareConsent(false); }
    if (next.kind === 'thread') { setThread(null); setThreadError(''); setThreadLoadedKey(null); setReplyBody(''); setReplyConsent(false); setReplyPages([undefined]); setReplyPage(0); }
    setDialog(next);
  }
  function closeDialog() { if (!busy) { setDialog(null); setDialogError(''); } }

  async function mutate(action: CommunityAction, success: string, keepDialog = false): Promise<boolean> {
    if (busy) return false;
    setBusy(true); setDialogError(''); setError('');
    try {
      const data = await requestSnapshot({}, action);
      if (circle || cursor) {
        setSnapshot(await requestSnapshot({ ...(circle ? { circle } : {}), cursor, limit: 30 }));
      } else setSnapshot(data);
      if (!keepDialog) setDialog(null);
      setRefresh(value => value + 1);
      notify(success);
      return true;
    } catch (cause) {
      const message = errorMessage(cause);
      if (dialog) setDialogError(message); else setError(message);
      if (cause instanceof CommunityApiError && (cause.status === 401 || cause.status === 403)) reload();
      return false;
    } finally { setBusy(false); }
  }

  async function submitApplication(event: FormEvent) {
    event.preventDefault();
    if (!applicationConsent) return;
    if (await mutate({ action: 'apply', application: application.trim(), consent: true }, 'Your membership request has been sent for review.')) { setApplication(''); setApplicationConsent(false); }
  }

  async function submitPost(event: FormEvent) {
    event.preventDefault();
    if (!shareConsent) return;
    if (await mutate({ action: 'post', circleId: postCircle, body: postBody.trim(), responsePreference: postResponse, quiet, shareConsent: true }, 'Your thought is shared with the circle.')) {
      setPostBody(''); setShareConsent(false); setQuiet(false); setPostResponse('listen'); setPages([undefined]); setPage(0); setCircle(postCircle); setSearch(''); setResponseFilter('all');
    }
  }

  async function submitReply(event: FormEvent) {
    event.preventDefault();
    if (!replyConsent || !threadId) return;
    if (await mutate({ action: 'reply', postId: threadId, body: replyBody.trim(), shareConsent: true }, 'Your reply is shared with the circle.', true)) { setReplyBody(''); setReplyConsent(false); setReplyPages([undefined]); setReplyPage(0); }
  }

  function actionsFor(targetType: ContentTarget, item: CommunityPost | CommunityReply) {
    return <details><summary aria-label={`Options for ${item.own ? 'your' : 'this'} ${targetType}`}><MoreHorizontal size={20} aria-hidden="true" /></summary><div className="community-actions-menu">
      {item.own ? <button type="button" onClick={() => openDialog({ kind: 'delete', targetType, targetId: item.id })}><Trash2 aria-hidden="true" />Delete my {targetType}</button> : <>
        <button type="button" onClick={() => openDialog({ kind: 'report', targetType, targetId: item.id })}><Flag aria-hidden="true" />Report {targetType}</button>
        <button type="button" onClick={() => openDialog({ kind: 'block', targetType, targetId: item.id })}><ShieldOff aria-hidden="true" />Block this member</button>
      </>}
      {moderation && <button type="button" onClick={() => openDialog({ kind: 'content', targetType, targetId: item.id, decision: 'hide', preview: item.body })}><EyeOff aria-hidden="true" />Hide as moderator</button>}
    </div></details>;
  }

  function postCard(post: CommunityPost) {
    const postCircleInfo = CIRCLES.find(item => item.id === post.circleId);
    return <article className="community-post" key={post.id}>
      <div className="community-post-header"><span className={`community-avatar ${post.quiet ? 'quiet' : ''}`} aria-hidden="true">{post.quiet ? <Flower2 size={20} strokeWidth={1.5} /> : post.author.slice(0, 1).toUpperCase()}</span><div className="community-author"><strong>{post.author}{post.own && <span>you</span>}</strong><p>{postCircleInfo?.title || 'Your circle'} · <time dateTime={post.createdAt} title={dateLabel(post.createdAt, true)}>{dateLabel(post.createdAt)}</time></p></div>{actionsFor('post', post)}</div>
      <ResponseLabel value={post.responsePreference} /><p className="community-post-body">{post.body}</p>
      <div className="community-post-footer"><button type="button" onClick={() => openDialog({ kind: 'thread', postId: post.id })}>{post.responsePreference === 'no-replies' ? <><Leaf aria-hidden="true" />Read quietly</> : <><MessageCircle aria-hidden="true" />{post.replyCount ? `${post.replyCount} ${post.replyCount === 1 ? 'reply' : 'replies'}` : 'Offer a little company'}<ArrowRight size={14} aria-hidden="true" /></>}</button><span><LockKeyhole size={13} aria-hidden="true" />Circle members</span></div>
    </article>;
  }

  function memberCard(member: ModeratorMember) {
    const isSelf = member.id === membership?.id;
    return <article className="community-review-card" key={member.id}>
      <div className="community-review-head"><div><h3>{member.displayName}</h3><p>Requested {dateLabel(member.createdAt, true)}{member.role === 'moderator' ? ' · Moderator' : ''}{isSelf ? ' · You' : ''}</p></div><span className={`community-status community-status-${member.status}`}>{STATUS_LABELS[member.status]}</span></div>
      <div className="community-review-copy"><strong>Her introduction</strong>{member.application || 'Member added by the operator.'}</div>
      {member.decisionNote && <p className="community-review-note"><strong>Latest decision: </strong>{member.decisionNote}</p>}
      {!isSelf && member.role !== 'moderator' && <div className="community-review-actions">
        {member.status !== 'approved' && <button className="btn btn-primary" type="button" disabled={busy} onClick={() => openDialog({ kind: 'member', member, status: 'approved' })}><UserCheck size={16} aria-hidden="true" />{member.status === 'suspended' ? 'Restore membership' : 'Approve membership'}</button>}
        {member.status === 'pending' && <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => openDialog({ kind: 'member', member, status: 'declined' })}>Decline request</button>}
        {member.status === 'approved' && <button className="btn btn-secondary community-danger-btn" type="button" disabled={busy} onClick={() => openDialog({ kind: 'member', member, status: 'suspended' })}><ShieldOff size={15} aria-hidden="true" />Pause membership</button>}
      </div>}
    </article>;
  }

  function moderatorReport(report: ModeratorReport) {
    const targetMember = moderation?.members.find(member => member.id === report.target?.authorMemberId);
    return <article className="community-review-card" key={report.id}>
      <div className="community-review-head"><div><h3>{REPORT_LABELS[report.reason] || 'Community report'}</h3><p>Reported by {report.reporter} · {dateLabel(report.createdAt, true)}</p></div><span className={`community-status ${report.status === 'open' ? 'community-status-pending' : ''}`}>{REPORT_STATUS[report.status]}</span></div>
      {report.details && <p className="community-review-note"><strong>Reporter’s note: </strong>{report.details}</p>}
      {report.target ? <div className="community-review-copy"><strong>{report.targetType === 'reply' ? 'Reported reply' : 'Reported post'} · {report.target.author}{report.target.quiet ? ' · posted as a quiet voice' : ''} · {report.target.state}</strong>{report.target.body}</div> : <p className="community-review-note">The reported content is no longer available. The report remains in the review record.</p>}
      {report.resolution && <p className="community-review-note"><strong>Resolution: </strong>{report.resolution}</p>}
      <div className="community-review-actions">
        {report.target && report.target.state !== 'deleted' && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => openDialog({ kind: 'content', targetType: report.targetType, targetId: report.targetId, decision: report.target?.state === 'hidden' ? 'restore' : 'hide', preview: report.target?.body })}>{report.target.state === 'hidden' ? <><Eye size={15} aria-hidden="true" />Restore content</> : <><EyeOff size={15} aria-hidden="true" />Hide content</>}</button>}
        {targetMember && targetMember.status === 'approved' && targetMember.role !== 'moderator' && targetMember.id !== membership?.id && <button type="button" className="btn btn-secondary community-danger-btn" disabled={busy} onClick={() => openDialog({ kind: 'member', member: targetMember, status: 'suspended' })}>Pause member</button>}
        {report.status === 'open' && <>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => openDialog({ kind: 'resolve', report, decision: 'actioned' })}>Record action taken</button>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => openDialog({ kind: 'resolve', report, decision: 'dismissed' })}>Close without action</button>
        </>}
      </div>
    </article>;
  }

  const dialogTitle = dialog?.kind === 'compose' ? 'A thought for your circle.'
    : dialog?.kind === 'thread' ? 'A little company.'
    : dialog?.kind === 'report' ? 'Tell us what feels wrong.'
    : dialog?.kind === 'block' ? 'Make a little more space.'
    : dialog?.kind === 'unblock' ? 'Unblock this member?'
    : dialog?.kind === 'delete' ? `Delete your ${dialog.targetType}?`
    : dialog?.kind === 'member' ? (dialog.status === 'approved' ? 'Welcome this member.' : dialog.status === 'declined' ? 'Decline this request.' : 'Pause this membership.')
    : dialog?.kind === 'content' ? (dialog.decision === 'hide' ? 'Hide this content.' : 'Restore this content.')
    : 'Complete the review.';

  return <section className="community-view" aria-label="Member community">
    <header className="community-heading"><div><p className="eyebrow">A LITTLE MORE TOGETHER</p><h1>Good company.<br />Room to be you.</h1><p>Thoughtful conversations, shared experiences, and a place to grow at your own pace.</p></div><div className="community-heading-actions">{membership && <span className={`community-status community-status-${membership.status}`}><ShieldCheck aria-hidden="true" />{moderation ? 'Care team' : STATUS_LABELS[membership.status]}</span>}<button type="button" className="community-icon-button" aria-label="Refresh community" onClick={reload} disabled={loading || busy}><RefreshCw className={loading ? 'community-spinner' : ''} aria-hidden="true" /></button></div></header>

    {error && <ErrorNotice message={error} retry={reload} />}
    {loading && !snapshot ? <div className="community-loading" role="status"><LoaderCircle size={31} className="community-spinner" aria-hidden="true" /><p>Making a little room for you…</p></div> : signedOut ? <Empty icon={<LockKeyhole aria-hidden="true" />} title="Your community starts with you." action={<a className="btn btn-primary" href="/signin-with-chatgpt?return_to=%2F%23community">Sign in with ChatGPT <ArrowRight size={16} aria-hidden="true" /></a>}>Sign in to set up your chosen name and request a place in the member community.</Empty> : snapshot && (!snapshot.profileReady || !hasProfile) ? <>
      <WelcomeGarden title="A name that feels like you." description="Begin with a chosen name and our community agreement. Then you can request membership in the shared circles." action={<button type="button" className="btn btn-primary" onClick={onSetupProfile}>Set up my space <ArrowRight size={16} aria-hidden="true" /></button>} />
      <CommunityPillars />
    </> : snapshot && !approved ? <>
      {membership && <div className="community-application-status"><span className={`community-status community-status-${membership.status}`}><Clock3 aria-hidden="true" />{STATUS_LABELS[membership.status]}</span><h2>{membership.status === 'pending' ? 'Your introduction is with the care team.' : membership.status === 'suspended' ? 'Your community access is paused.' : 'A note about your request.'}</h2><p>{membership.status === 'pending' ? 'Your request is waiting for a moderator’s review. You can check back here for the decision. Shared circle conversations open after approval.' : membership.status === 'suspended' ? 'You can still use your private space and wellbeing tools. Shared conversations are unavailable while your membership is paused.' : 'You can read the decision below. A moderator can reconsider the request; you can continue using your private space in the meantime.'}</p>{membership.decisionNote && <div className="community-decision"><strong>From the care team</strong>{membership.decisionNote}</div>}{membership.status === 'pending' && <button type="button" className="btn btn-secondary" onClick={reload} disabled={loading}><RefreshCw size={16} aria-hidden="true" />Check for an update</button>}</div>}
      {!membership ? <>
        {!membership && <WelcomeGarden title="Come as you are. Join with care." description="A community for women aged 18 and over. Membership is reviewed before shared conversations open, so everyone begins with the same commitment to care." />}
        <div className="community-application-grid"><form className="community-panel" onSubmit={submitApplication}><p className="eyebrow">YOUR LITTLE INTRODUCTION</p><h2>What brings you here?</h2><p>A few words about what you hope to find or share. A real name, photograph, and personal history are not required.</p><label className="community-label" htmlFor="community-application">What would you like from this community?</label><textarea id="community-application" value={application} onChange={event => setApplication(event.target.value)} minLength={10} maxLength={1000} rows={5} required placeholder="I’d love a place to talk honestly, meet other women, and celebrate the little wins…" /><div className="community-count"><span>Share only what feels comfortable.</span><span>{application.length}/1,000</span></div><label className="community-check"><input type="checkbox" checked={applicationConsent} onChange={event => setApplicationConsent(event.target.checked)} required /><span>I am joining as a woman aged 18 or over, and I agree to respect privacy, boundaries, and each person’s chosen support style.<small>Trans women are welcome. This agreement and review do not verify someone’s identity or gender.</small></span></label><div className="community-form-footer"><p>Your introduction is visible to moderators who review membership.</p><button type="submit" className="btn btn-primary" disabled={busy || !applicationConsent || application.trim().length < 10}>{busy ? 'Sending…' : 'Request membership'}<ArrowRight size={16} aria-hidden="true" /></button></div></form><aside className="community-panel"><p className="eyebrow">ONE GENTLE STEP AT A TIME</p><h2>How we begin.</h2><ol className="community-steps"><li><span className="community-step-number"><Check size={15} aria-hidden="true" /></span><div><strong>A chosen name</strong><p>Your private profile is ready. You choose how to show up.</p></div></li><li><span className="community-step-number">2</span><div><strong>A thoughtful review</strong><p>A moderator reviews your introduction and community agreement.</p></div></li><li><span className="community-step-number">3</span><div><strong>Your kind of company</strong><p>After approval, join a circle and share when you feel ready.</p></div></li></ol><p className="community-privacy-note"><LockKeyhole aria-hidden="true" />Your earlier private posts stay in your private space.</p></aside></div>
      </> : <div className="community-welcome-actions"><button type="button" className="btn btn-secondary" onClick={() => onNavigate('living')}><Heart size={16} aria-hidden="true" />Visit my private space</button><button type="button" className="btn btn-secondary" onClick={() => onNavigate('quiet')}><Leaf size={16} aria-hidden="true" />Take a quiet moment</button></div>}
      <CommunityPillars />
    </> : snapshot && approved ? <>
      <nav className="community-tabs" role="tablist" aria-label="Community sections" onKeyDown={moveTabFocus}>
        <button type="button" className="community-tab" role="tab" tabIndex={tab === 'conversations' ? 0 : -1} aria-selected={tab === 'conversations'} onClick={() => setTab('conversations')}><MessagesSquare aria-hidden="true" />Conversations</button>
        <button type="button" className="community-tab" role="tab" tabIndex={tab === 'reports' ? 0 : -1} aria-selected={tab === 'reports'} onClick={() => setTab('reports')}><Flag aria-hidden="true" />My reports{openReports.length > 0 && <span className="community-tab-badge">{openReports.length}</span>}</button>
        <button type="button" className="community-tab" role="tab" tabIndex={tab === 'boundaries' ? 0 : -1} aria-selected={tab === 'boundaries'} onClick={() => setTab('boundaries')}><ShieldCheck aria-hidden="true" />My boundaries</button>
        {moderation && <button type="button" className="community-tab" role="tab" tabIndex={tab === 'moderation' ? 0 : -1} aria-selected={tab === 'moderation'} onClick={() => setTab('moderation')}><HandHeart aria-hidden="true" />Care desk{pendingMembers.length + careReports.length > 0 && <span className="community-tab-badge">{pendingMembers.length + careReports.length}</span>}</button>}
      </nav>
      <div role="tabpanel" aria-label={tab === 'moderation' ? 'Care desk' : tab === 'boundaries' ? 'My boundaries' : tab === 'reports' ? 'My reports' : 'Circle conversations'}>
      {tab === 'conversations' && <>
        <div className="community-live-note"><LockKeyhole aria-hidden="true" /><p><strong>A shared space for approved members.</strong> New posts and replies are visible to approved members in the same circle. Your earlier private posts remain in your private space.</p></div>
        <div className="community-feed-layout"><div className="community-feed-main">
          <div className="community-section-heading"><div><h2>{circle ? CIRCLES.find(item => item.id === circle)?.title : 'Around our circles.'}</h2><p>No perfect words required. Start with what feels true.</p></div><button type="button" className="btn btn-primary" disabled={!joinedCircles.length || busy} onClick={() => openDialog({ kind: 'compose' })}><Plus size={17} aria-hidden="true" />Share a thought</button></div>
          {!joinedCircles.length ? <Empty icon={<UsersRound aria-hidden="true" />} title="Find a circle that feels like you." action={<button className="btn btn-primary" type="button" onClick={() => onNavigate('circles')}>Explore circles <ArrowRight size={16} aria-hidden="true" /></button>}>Join a circle to see its conversations and share your own thoughts. You can leave whenever you like.</Empty> : <>
            <div className="community-toolbar"><label><span>Look through this page</span><div className="community-search"><Search aria-hidden="true" /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="A word, a thought, a chosen name…" aria-label="Search conversations on this page" /></div></label><label><span>Your circles</span><select value={circle} onChange={event => chooseCircle(event.target.value)}><option value="">All my circles</option>{joinedCircles.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label></div>
            <div className="community-feed-filter"><label className="community-visually-hidden" htmlFor="community-response-filter">Filter this page by support style</label><select id="community-response-filter" value={responseFilter} onChange={event => setResponseFilter(event.target.value)}><option value="all">Every support style</option>{RESPONSE_OPTIONS.map(option => <option value={option.id} key={option.id}>{option.label}</option>)}</select><span>{loading ? 'Refreshing conversations…' : `${visiblePosts.length} ${visiblePosts.length === 1 ? 'conversation' : 'conversations'} on this page`}</span></div>
            {visiblePosts.length ? <div className="community-post-list" aria-busy={loading}>{visiblePosts.map(postCard)}</div> : <Empty icon={<Sprout aria-hidden="true" />} title={search || responseFilter !== 'all' ? 'A little quiet here.' : 'Every circle starts with a hello.'} action={search || responseFilter !== 'all' ? <button type="button" className="btn btn-secondary" onClick={() => { setSearch(''); setResponseFilter('all'); }}>Clear page filters</button> : <button className="btn btn-primary" type="button" onClick={() => openDialog({ kind: 'compose' })}>Start a conversation <ArrowRight size={16} aria-hidden="true" /></button>}>{search || responseFilter !== 'all' ? 'No conversations on this page match those filters. Try a different word, clear the filters, or visit another page.' : 'There are no visible conversations here yet. Share a small introduction, a question, or something worth celebrating.'}</Empty>}
            {(page > 0 || snapshot.nextCursor) && <div className="community-pagination"><button type="button" className="btn btn-secondary" disabled={page === 0 || loading} onClick={() => setPage(value => value - 1)}><ChevronLeft size={16} aria-hidden="true" />Newer</button><span>Page {page + 1}</span><button type="button" className="btn btn-secondary" disabled={!snapshot.nextCursor || loading} onClick={() => { setPages(value => [...value.slice(0, page + 1), snapshot.nextCursor || undefined]); setPage(value => value + 1); }}>Earlier <ChevronRight size={16} aria-hidden="true" /></button></div>}
          </>}
        </div><aside className="community-aside"><div className="community-aside-card"><HeartHandshake aria-hidden="true" /><h3>We listen first.</h3><p>Check the support style before you reply. Sometimes being understood is enough.</p><ol><li>Respect a request for listening or quiet.</li><li>Speak from your own experience.</li><li>Leave identifying details out of shared stories.</li></ol><button type="button" className="text-button" onClick={() => onNavigate('safety')}>Our community promise <ArrowRight size={15} aria-hidden="true" /></button></div><div className="community-aside-card rose"><Leaf aria-hidden="true" /><h3>You can take a pause.</h3><p>There is no need to keep up with every conversation. Your pace belongs to you.</p><button type="button" className="text-button" onClick={() => onNavigate('quiet')}>Visit the quiet room <ArrowRight size={15} aria-hidden="true" /></button></div></aside></div>
      </>}
      {tab === 'reports' && <><div className="community-section-heading"><div><h2>Your concerns deserve care.</h2><p>Only your reports appear here. Moderators can review them; the reported member cannot see who submitted a report.</p></div></div>{snapshot.reports.length ? <div className="community-report-list">{snapshot.reports.map(report => <article className="community-report-card" key={report.id}><div className="community-report-top"><div><h3>{REPORT_LABELS[report.reason] || 'Community concern'}</h3><p>{report.targetType === 'reply' ? 'Reply' : 'Post'} reported · {dateLabel(report.createdAt, true)}</p></div><span className={`community-status ${report.status === 'open' ? 'community-status-pending' : ''}`}>{REPORT_STATUS[report.status]}</span></div><p>{report.details || 'You submitted this concern without an additional note.'}</p>{report.resolution && <div className="community-decision"><strong>Review note</strong>{report.resolution}</div>}</article>)}</div> : <Empty icon={<Flag aria-hidden="true" />} title="No reports from you." >If a conversation feels wrong, use its options menu to send a concern to the moderators. You do not need to confront someone first.</Empty>}<p className="community-small-note">Reports are reviewed when a moderator is available. Her Haven does not provide emergency monitoring or an immediate response service.</p></>}
      {tab === 'boundaries' && <><div className="community-section-heading"><div><h2>A little room to feel comfortable.</h2><p>Blocking keeps shared posts and replies between you and that member out of view. Your block list stays private. A moderator’s work may require access to reported content.</p></div></div>{snapshot.blocks.length ? <div className="community-boundary-list">{snapshot.blocks.map(block => <div className="community-boundary" key={block.id}><ShieldOff aria-hidden="true" /><div><strong>{block.label}</strong><p>Blocked {dateLabel(block.createdAt)} · shared conversations hidden</p></div><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => openDialog({ kind: 'unblock', id: block.id, label: block.label })}>Unblock</button></div>)}</div> : <Empty icon={<ShieldCheck aria-hidden="true" />} title="Your boundaries are yours." >You have not blocked any members. If you need space, use the options menu on a shared post or reply.</Empty>}<p className="community-privacy-note"><LockKeyhole aria-hidden="true" />Blocking cannot remove screenshots or copies someone has already made. Share only what feels comfortable.</p><OwnContributions items={snapshot.ownContent} busy={busy} onDelete={(targetType, targetId) => openDialog({ kind: 'delete', targetType, targetId })} /></>}
      {tab === 'moderation' && moderation && <>
        <div className="community-care-header"><HandHeart aria-hidden="true" /><div><h2>The care desk.</h2><p>Review thoughtfully, explain decisions, and keep the shared space respectful. Every moderation decision is recorded.</p></div></div>
        <nav className="community-care-tabs" role="tablist" aria-label="Moderation sections" onKeyDown={moveTabFocus}><button type="button" role="tab" tabIndex={careTab === 'applications' ? 0 : -1} aria-selected={careTab === 'applications'} onClick={() => setCareTab('applications')}>Introductions <span>{pendingMembers.length}</span></button><button type="button" role="tab" tabIndex={careTab === 'reports' ? 0 : -1} aria-selected={careTab === 'reports'} onClick={() => setCareTab('reports')}>Reports <span>{careReports.length}</span></button><button type="button" role="tab" tabIndex={careTab === 'content' ? 0 : -1} aria-selected={careTab === 'content'} onClick={() => setCareTab('content')}>Hidden content <span>{moderation.hiddenContent.length}</span></button><button type="button" role="tab" tabIndex={careTab === 'members' ? 0 : -1} aria-selected={careTab === 'members'} onClick={() => setCareTab('members')}>Members</button><button type="button" role="tab" tabIndex={careTab === 'audit' ? 0 : -1} aria-selected={careTab === 'audit'} onClick={() => setCareTab('audit')}>Decision record</button></nav>
        <p className="community-small-note" style={{ marginTop: 0, marginBottom: 18 }}>Each care-desk list shows up to the 100 most recent records. Counts apply to the records loaded in this view.</p>
        <div role="tabpanel" aria-label={careTab === 'applications' ? 'Membership introductions' : careTab === 'content' ? 'Hidden community content' : careTab === 'audit' ? 'Moderation decision record' : careTab === 'members' ? 'Community members' : 'Community reports'}>
          {careTab === 'applications' && (pendingMembers.length ? <div className="community-review-list">{pendingMembers.map(memberCard)}</div> : <Empty icon={<UserCheck aria-hidden="true" />} title="No introductions waiting." >New membership requests will appear here. Signing in or setting up a profile does not automatically approve membership.</Empty>)}
          {careTab === 'reports' && (moderation.reports.length ? <><p className="community-small-note" style={{ marginTop: 0, marginBottom: 17 }}>Reporter identities and quiet-post attribution below are for moderation only. Hide content or pause a membership where needed, then record the report outcome separately.</p><div className="community-review-list">{[...moderation.reports].sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open')).map(moderatorReport)}</div></> : <Empty icon={<ShieldCheck aria-hidden="true" />} title="No reports to review." >Concerns from members will appear here with the reported content and relevant context.</Empty>)}
          {careTab === 'content' && (moderation.hiddenContent.length ? <><p className="community-small-note" style={{ marginTop: 0, marginBottom: 17 }}>Hidden posts and replies stay out of member conversations. Review the content and record a reason before restoring it.</p><div className="community-review-list">{moderation.hiddenContent.map(content => <article className="community-review-card" key={`${content.targetType}-${content.id}`}><div className="community-review-head"><div><h3>{content.author}</h3><p>{content.targetType === 'reply' ? 'Reply' : 'Post'} · {CIRCLES.find(item => item.id === content.circleId)?.title} · hidden {dateLabel(content.updatedAt)}{content.quiet ? ' · posted as a quiet voice' : ''}</p></div><span className="community-status community-status-hidden"><EyeOff aria-hidden="true" />Hidden</span></div><div className="community-review-copy">{content.body}</div><div className="community-review-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => openDialog({ kind: 'content', targetType: content.targetType, targetId: content.id, decision: 'restore', preview: content.body })}><Eye size={15} aria-hidden="true" />Review and restore</button></div></article>)}</div></> : <Empty icon={<Eye aria-hidden="true" />} title="No hidden content to review.">Posts or replies hidden by a moderator appear here, including those that were hidden without a member report.</Empty>)}
          {careTab === 'members' && <><div className="community-member-filter"><label className="community-visually-hidden" htmlFor="community-member-filter">Filter members by status</label><select id="community-member-filter" value={memberFilter} onChange={event => setMemberFilter(event.target.value)}><option value="all">Every membership status</option><option value="approved">Approved</option><option value="pending">Awaiting review</option><option value="suspended">Paused</option><option value="declined">Declined</option></select><span>{moderation.members.filter(member => memberFilter === 'all' || member.status === memberFilter).length} in this view</span></div><div className="community-review-list">{moderation.members.filter(member => memberFilter === 'all' || member.status === memberFilter).map(memberCard)}</div>{!moderation.members.some(member => memberFilter === 'all' || member.status === memberFilter) && <Empty icon={<UsersRound aria-hidden="true" />} title="No members in this view." >Choose another membership status to see the rest of your community.</Empty>}<p className="community-small-note">Moderator access is assigned by the operator outside this dashboard. A moderator cannot change their own membership here.</p></>}
          {careTab === 'audit' && (moderation.audit.length ? <ol className="community-audit">{moderation.audit.map(entry => <li key={entry.id}><span className="community-audit-icon"><CheckCircle2 aria-hidden="true" /></span><div><strong>{entry.action.replaceAll('-', ' ')} · {entry.targetType.replaceAll('-', ' ')}</strong><p>{entry.reason}</p><time dateTime={entry.createdAt}>{entry.actor} · {dateLabel(entry.createdAt, true)}</time></div></li>)}</ol> : <Empty icon={<CheckCircle2 aria-hidden="true" />} title="The record starts with a decision." >Membership reviews, content actions, and report outcomes will be recorded here with the reason and moderator.</Empty>)}
        </div>
      </>}
      </div>
    </> : !loading && !error ? <Empty icon={<RefreshCw aria-hidden="true" />} title="Let’s reconnect." action={<button className="btn btn-primary" type="button" onClick={reload}>Try again</button>}>Your community could not be loaded just now.</Empty> : null}

    {snapshot && snapshot.ownContent.length > 0 && (!approved || !snapshot.profileReady || !hasProfile) && <OwnContributions items={snapshot.ownContent} busy={busy} onDelete={(targetType, targetId) => openDialog({ kind: 'delete', targetType, targetId })} />}

    {dialog && <CommunityDialog title={dialogTitle} busy={busy} onClose={closeDialog}>
      {dialog.kind === 'compose' && <form onSubmit={submitPost}><p className="community-dialog-intro">A little or a lot. You choose what to share, and how you would like others to respond.</p><label className="community-label" htmlFor="community-post-circle">A place for this thought</label><select id="community-post-circle" value={postCircle} onChange={event => setPostCircle(event.target.value)} required>{joinedCircles.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}</select><label className="community-label" htmlFor="community-post-body">What’s on your mind?</label><textarea id="community-post-body" value={postBody} onChange={event => setPostBody(event.target.value)} rows={5} minLength={3} maxLength={4000} required placeholder={CIRCLES.find(item => item.id === postCircle)?.prompt || 'Begin wherever you are…'} /><div className="community-count"><span>Leave out names, addresses, and identifying details.</span><span>{postBody.length}/4,000</span></div><fieldset className="community-response-fieldset"><legend>How would you like us to respond?</legend><div className="community-support-grid">{RESPONSE_OPTIONS.map(option => <label className={`community-support-choice ${postResponse === option.id ? 'is-selected' : ''}`} key={option.id}><input type="radio" name="community-support" value={option.id} checked={postResponse === option.id} onChange={() => setPostResponse(option.id)} /><span><strong>{option.label}</strong><small>{option.detail}</small></span></label>)}</div></fieldset><label className="community-check"><input type="checkbox" checked={quiet} onChange={event => setQuiet(event.target.checked)} /><span>Use “A quiet voice” on this post.<small>Your chosen name is hidden from other members on this post. Moderators can identify the account when reviewing concerns.</small></span></label><label className="community-check"><input type="checkbox" checked={shareConsent} onChange={event => setShareConsent(event.target.checked)} required /><span>I understand this post will be shared with approved members who have joined this circle.</span></label>{dialogError && <ErrorNotice message={dialogError} />}<div className="community-dialog-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={closeDialog}>Keep thinking</button><button type="submit" className="btn btn-primary" disabled={busy || !shareConsent || postBody.trim().length < 3 || !postCircle}>{busy ? 'Sharing…' : 'Share with my circle'}<Send size={16} aria-hidden="true" /></button></div></form>}

      {dialog.kind === 'thread' && <>
        {threadLoading && !thread && <div className="community-loading" role="status"><LoaderCircle className="community-spinner" size={26} aria-hidden="true" /><p>Opening the conversation…</p></div>}
        {threadError && <ErrorNotice message={threadError} retry={reload} />}
        {currentThreadPost && <><div className="community-thread-post"><div className="community-post-header"><span className={`community-avatar ${currentThreadPost.quiet ? 'quiet' : ''}`} aria-hidden="true">{currentThreadPost.quiet ? <Flower2 size={20} /> : currentThreadPost.author.slice(0, 1).toUpperCase()}</span><div className="community-author"><strong>{currentThreadPost.author}{currentThreadPost.own && <span>you</span>}</strong><p>{CIRCLES.find(item => item.id === currentThreadPost.circleId)?.title} · {dateLabel(currentThreadPost.createdAt, true)}</p></div>{actionsFor('post', currentThreadPost)}</div><ResponseLabel value={currentThreadPost.responsePreference} /><p className="community-post-body">{currentThreadPost.body}</p></div>
          <div className="community-thread-heading"><h3>Here with you.</h3><span>{currentThreadPost.replyCount} {currentThreadPost.replyCount === 1 ? 'reply' : 'replies'}</span></div>
          <div className="community-replies" aria-busy={threadLoading}>{currentReplies.map(reply => <article key={reply.id} className="community-reply"><div className="community-post-header"><span className={`community-avatar ${reply.author === 'A quiet voice' ? 'quiet' : ''}`} aria-hidden="true">{reply.author === 'A quiet voice' ? <Flower2 size={17} /> : reply.author.slice(0, 1).toUpperCase()}</span><div className="community-author"><strong>{reply.author}{reply.own && <span>you</span>}</strong><p>{dateLabel(reply.createdAt, true)}</p></div>{actionsFor('reply', reply)}</div><p className="community-post-body">{reply.body}</p></article>)}</div>
          {!currentReplies.length && <p className="community-hint">{currentThreadPost.responsePreference === 'no-replies' ? 'This thought has space to exist quietly.' : 'No replies here yet. A gentle response can be a good beginning.'}</p>}
          {(replyPage > 0 || thread?.nextReplyCursor) && <div className="community-pagination"><button type="button" className="btn btn-secondary" disabled={replyPage === 0 || threadLoading} onClick={() => setReplyPage(value => value - 1)}><ChevronLeft size={15} aria-hidden="true" />Previous</button><span>Reply page {replyPage + 1}</span><button type="button" className="btn btn-secondary" disabled={!thread?.nextReplyCursor || threadLoading} onClick={() => { setReplyPages(value => [...value.slice(0, replyPage + 1), thread?.nextReplyCursor || undefined]); setReplyPage(value => value + 1); }}>More <ChevronRight size={15} aria-hidden="true" /></button></div>}
          {currentThreadPost.responsePreference === 'no-replies' ? <div className="community-no-replies"><Leaf aria-hidden="true" /><p>She has asked for no replies for now. Let’s give this thought some room.</p></div> : <form className="community-reply-form" onSubmit={submitReply}><label className="community-label" htmlFor="community-reply">A thoughtful response</label><p className="community-hint" style={{ marginBottom: 10 }}>{RESPONSE_OPTIONS.find(option => option.id === currentThreadPost.responsePreference)?.detail}</p><textarea id="community-reply" rows={3} value={replyBody} onChange={event => setReplyBody(event.target.value)} maxLength={2000} required placeholder={currentThreadPost.responsePreference === 'listen' ? 'Offer understanding. There is no need to fix anything.' : 'Share gently, in your own words…'} /><div className="community-count"><span>Keep her support preference in mind.</span><span>{replyBody.length}/2,000</span></div><label className="community-check"><input type="checkbox" checked={replyConsent} onChange={event => setReplyConsent(event.target.checked)} required /><span>I’m ready to share this reply with the circle.</span></label>{dialogError && <ErrorNotice message={dialogError} />}<div className="community-dialog-actions"><button type="submit" className="btn btn-primary" disabled={busy || !replyConsent || !replyBody.trim()}>{busy ? 'Sharing…' : 'Share my reply'}<Send size={15} aria-hidden="true" /></button></div></form>}
        </>}
      </>}

      {dialog.kind === 'report' && <form onSubmit={async event => { event.preventDefault(); await mutate({ action: 'report', targetType: dialog.targetType, targetId: dialog.targetId, reason: reportReason, details: reportDetails.trim() }, 'Your concern has been sent to the moderator review queue.'); }}><p className="community-dialog-intro">You do not need to confront someone to raise a concern. The reported member will not see your identity in the report.</p><label className="community-label" htmlFor="community-report-reason">What is the concern?</label><select id="community-report-reason" value={reportReason} onChange={event => setReportReason(event.target.value)}>{Object.entries(REPORT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><label className="community-label" htmlFor="community-report-details">Anything you want to add? <span className="community-hint">Optional</span></label><textarea id="community-report-details" rows={4} value={reportDetails} onChange={event => setReportDetails(event.target.value)} maxLength={2000} placeholder="A little context can help. Share only what feels comfortable." /><p className="community-privacy-note"><ShieldCheck aria-hidden="true" />Moderators can read your report and relevant account details. Reports are not an emergency service.</p>{dialogError && <ErrorNotice message={dialogError} />}<div className="community-dialog-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={closeDialog}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send my concern'}<Flag size={15} aria-hidden="true" /></button></div></form>}

      {dialog.kind === 'block' && <><p className="community-dialog-intro">Blocking hides shared posts and replies between you and this member. They will not receive a notification. You can change this in My boundaries.</p><p className="community-privacy-note"><LockKeyhole aria-hidden="true" />For a quiet post, the account is blocked without revealing the chosen name. Moderators may still review reported content.</p>{dialogError && <ErrorNotice message={dialogError} />}<div className="community-dialog-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={closeDialog}>Keep as it is</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => mutate({ action: 'block', targetType: dialog.targetType, targetId: dialog.targetId }, 'This member is blocked. You can manage this in My boundaries.')}>{busy ? 'Saving…' : 'Block this member'}<ShieldOff size={15} aria-hidden="true" /></button></div></>}

      {dialog.kind === 'unblock' && <><p className="community-dialog-intro">Shared conversations with {dialog.label} can become visible again when you belong to the same circle.</p>{dialogError && <ErrorNotice message={dialogError} />}<div className="community-dialog-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={closeDialog}>Keep blocked</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => mutate({ action: 'unblock', id: dialog.id }, 'The block has been removed.')}>{busy ? 'Saving…' : 'Unblock member'}</button></div></>}

      {dialog.kind === 'delete' && <><p className="community-dialog-intro">Your {dialog.targetType} will be removed from shared conversations.{dialog.targetType === 'post' ? ' Replies on it will no longer be available in the circle.' : ''}</p><p className="community-danger-note">This cannot be undone here. A moderation report or decision record may remain if one already exists.</p>{dialogError && <ErrorNotice message={dialogError} />}<div className="community-dialog-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={closeDialog}>Keep it</button><button type="button" className="btn btn-danger" disabled={busy} onClick={() => mutate({ action: dialog.targetType === 'post' ? 'delete-post' : 'delete-reply', id: dialog.targetId }, `Your shared ${dialog.targetType} has been removed.`)}>{busy ? 'Removing…' : `Delete my ${dialog.targetType}`}<Trash2 size={15} aria-hidden="true" /></button></div></>}

      {dialog.kind === 'member' && <form onSubmit={async event => { event.preventDefault(); await mutate({ action: 'review-member', memberId: dialog.member.id, status: dialog.status, reason: reason.trim() }, dialog.status === 'approved' ? 'Membership approved.' : dialog.status === 'declined' ? 'The request has been declined with your note.' : 'Membership is paused.'); }}><p className="community-dialog-intro">{dialog.status === 'approved' ? `${dialog.member.displayName} will be able to read and contribute in the circles she joins.` : dialog.status === 'declined' ? `${dialog.member.displayName} will see your note with the membership decision.` : `${dialog.member.displayName} will lose access to shared conversations while her membership is paused. She will see your note.`}</p><label className="community-label" htmlFor="community-member-reason">Decision note</label><textarea id="community-member-reason" value={reason} onChange={event => setReason(event.target.value)} minLength={3} maxLength={1000} rows={4} required placeholder="Explain the decision clearly and respectfully…" /><p className="community-hint">This note is visible to the member and recorded in the moderator decision record.</p>{dialogError && <ErrorNotice message={dialogError} />}<div className="community-dialog-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={closeDialog}>Cancel</button><button type="submit" className={`btn ${dialog.status === 'approved' ? 'btn-primary' : 'btn-danger'}`} disabled={busy || reason.trim().length < 3}>{busy ? 'Saving…' : dialog.status === 'approved' ? 'Approve membership' : dialog.status === 'declined' ? 'Decline request' : 'Pause membership'}</button></div></form>}

      {dialog.kind === 'content' && <form onSubmit={async event => { event.preventDefault(); await mutate({ action: 'moderate-content', targetType: dialog.targetType, targetId: dialog.targetId, decision: dialog.decision, reason: reason.trim() }, dialog.decision === 'hide' ? 'Content is hidden from circle conversations.' : 'Content has been restored.'); }}><p className="community-dialog-intro">{dialog.decision === 'hide' ? `This ${dialog.targetType} will be hidden from members while the concern is addressed.` : `This ${dialog.targetType} will be visible again to eligible circle members.`} The moderation record keeps the reason for this decision.</p>{dialog.preview && <div className="community-review-target"><strong>Content being reviewed</strong><p>{dialog.preview}</p></div>}<label className="community-label" htmlFor="community-content-reason">Reason for this decision</label><textarea id="community-content-reason" value={reason} onChange={event => setReason(event.target.value)} minLength={3} maxLength={1000} rows={3} required placeholder="Record what you reviewed and why this action is appropriate…" />{dialogError && <ErrorNotice message={dialogError} />}<div className="community-dialog-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={closeDialog}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy || reason.trim().length < 3}>{busy ? 'Saving…' : dialog.decision === 'hide' ? 'Hide content' : 'Restore content'}</button></div></form>}

      {dialog.kind === 'resolve' && <form onSubmit={async event => { event.preventDefault(); await mutate({ action: 'resolve-report', id: dialog.report.id, decision: dialog.decision, reason: reason.trim() }, 'The report outcome has been recorded.'); }}><p className="community-dialog-intro">{dialog.decision === 'actioned' ? 'Record the action you have already taken. Closing the report does not hide content or change membership by itself.' : 'Explain why this report is being closed without further action.'}</p><label className="community-label" htmlFor="community-resolution">A note for the person who raised the concern</label><textarea id="community-resolution" value={reason} onChange={event => setReason(event.target.value)} minLength={3} maxLength={1000} rows={4} required placeholder="Explain the outcome without sharing someone else’s private information…" /><p className="community-hint">The reporter can read this note. It is also saved in the moderation record.</p>{dialogError && <ErrorNotice message={dialogError} />}<div className="community-dialog-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={closeDialog}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy || reason.trim().length < 3}>{busy ? 'Saving…' : 'Complete review'}</button></div></form>}
    </CommunityDialog>}
  </section>;
}

function WelcomeGarden({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="community-welcome"><div className="community-welcome-copy"><p className="eyebrow">CONNECTION, WITH CARE</p><h2>{title}</h2><p>{description}</p>{action && <div className="community-welcome-actions">{action}</div>}</div><div className="community-garden" aria-hidden="true"><span className="community-garden-ring" /><span className="community-garden-ring" /><span className="community-garden-spark">✦</span><span className="community-garden-icon"><Flower2 /></span><small>Good things grow<br />when we feel at home.</small></div></div>;
}

function CommunityPillars() {
  return <div className="community-pillars"><div className="community-pillar"><UserCheck aria-hidden="true" /><div><strong>Membership with care</strong><p>Shared conversations open after a moderator approves your request.</p></div></div><div className="community-pillar"><HeartHandshake aria-hidden="true" /><div><strong>You choose the support</strong><p>Ask for listening, ideas, shared experiences, or a little quiet.</p></div></div><div className="community-pillar"><ShieldCheck aria-hidden="true" /><div><strong>Your boundaries matter</strong><p>Report a concern, block a member, or step away when you need to.</p></div></div></div>;
}

function OwnContributions({ items, busy, onDelete }: { items: CommunitySnapshot['ownContent']; busy: boolean; onDelete: (type: ContentTarget, id: string) => void }) {
  return <section className="community-own-section" aria-label="Your shared contributions"><div className="community-section-heading"><div><p className="eyebrow">YOUR WORDS, YOUR CHOICE</p><h2>Your shared contributions.</h2><p>You can remove your shared posts and replies here, including when you have left a circle or your membership is paused.</p></div></div>{items.length ? <div className="community-own-list">{items.map(item => <details className="community-own-item" key={`${item.targetType}-${item.id}`}><summary><span><strong>{item.targetType === 'reply' ? 'Your reply' : 'Your post'}{item.state === 'hidden' && <span className="community-status community-status-hidden">Hidden by moderator</span>}</strong><small>{dateLabel(item.createdAt, true)}</small></span><ChevronDown size={18} aria-hidden="true" /></summary><div className="community-own-body"><p>{item.body}</p><button type="button" className="btn btn-secondary community-danger-btn" disabled={busy} onClick={() => onDelete(item.targetType, item.id)}><Trash2 size={15} aria-hidden="true" />Delete my {item.targetType}</button></div></details>)}</div> : <p className="community-small-note">You have no shared contributions to manage yet. Your earlier private posts remain in your private space.</p>}{items.length >= 100 && <p className="community-small-note">Showing your 100 most recent contributions. Older contributions appear as items are removed.</p>}</section>;
}
