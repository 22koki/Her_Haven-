"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  Coffee,
  Copy,
  Flower2,
  Heart,
  HeartHandshake,
  Leaf,
  LockKeyhole,
  MessageCircle,
  Palette,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";

export type ExploreViewProps = {
  notify: (message: string) => void;
  onNavigate: (view: string) => void;
  onCompose: () => void;
};

const scripts = [
  {
    id: "boundary",
    label: "Set a boundary",
    title: "A little space is allowed.",
    text: "I care about you, and I want to be honest about what I can manage right now. I don’t have the capacity for this today. Could we find another time, or a smaller way I can help?",
    note: "You can be kind and still be clear. Change any words that don’t sound like you.",
  },
  {
    id: "support",
    label: "Ask for support",
    title: "You don’t have to carry it alone.",
    text: "I’ve had a lot on my mind lately. Do you have some space to listen? I’m not looking for solutions right now; a little company and understanding would mean a lot.",
    note: "It’s okay to say what kind of support would help, and to check the other person’s capacity.",
  },
  {
    id: "work",
    label: "Find clarity at work",
    title: "A clear question is a good start.",
    text: "I’d like to make sure we’re aligned on expectations. Could we clarify the priorities, the timeline, and what success would look like for this task? That will help me plan my work and flag anything I need support with.",
    note: "Use this as a starting point, and adapt it to your role and the conversation you want to have.",
  },
] as const;

const resourceGuides = [
  {
    id: "appointment",
    Icon: HeartHandshake,
    color: "rose",
    label: "BODY & WELLBEING",
    title: "Before your next appointment",
    description: "A few questions to help you explain what matters to you.",
    questions: [
      "What would I most like to understand by the end of this appointment?",
      "What have I noticed, when did it start, and how is it affecting my day?",
      "What questions do I want to ask about the options, next steps, and follow-up?",
    ],
    footer: "An appointment preparation prompt, not medical advice. Your clinician can advise on your own care.",
  },
  {
    id: "salary",
    Icon: MessageCircle,
    color: "sage",
    label: "WORK & GROWTH",
    title: "Prepare for a pay conversation",
    description: "Put your contributions and questions into your own words.",
    questions: [
      "What responsibilities have I taken on, and what examples show my contribution?",
      "What would I like to ask about the role’s pay range or review process?",
      "What next step or follow-up date would help make the conversation concrete?",
    ],
    footer: "A conversation planning tool. Adapt it to your circumstances and workplace.",
  },
  {
    id: "money",
    Icon: Leaf,
    color: "sand",
    label: "EVERYDAY MONEY",
    title: "A kinder money check-in",
    description: "Make room for an honest look, without comparing yourself.",
    questions: [
      "What is one money question I would like to understand better?",
      "Which upcoming costs would I like to plan for?",
      "What is one manageable next step I can choose for myself?",
    ],
    footer: "For personal reflection and general education, not individual financial advice.",
  },
];

export function ResourcesView({ notify, onCompose }: ExploreViewProps) {
  const [selected, setSelected] = useState(0);
  const [draft, setDraft] = useState<string>(scripts[0].text);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const currentScript = scripts[selected];

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  function chooseScript(index: number) {
    setSelected(index);
    setDraft(scripts[index].text);
    setCopied(false);
  }

  async function copyScript() {
    if (!draft.trim()) {
      notify("Add a few words first, then you can copy them.");
      textareaRef.current?.focus();
      return;
    }
    let didCopy = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(draft);
        didCopy = true;
      }
    } catch {
      // Browsers can deny clipboard access; the selected text remains usable.
    }
    if (!didCopy) {
      textareaRef.current?.focus();
      textareaRef.current?.select();
      try {
        didCopy = document.execCommand("copy");
      } catch {
        didCopy = false;
      }
    }
    if (didCopy) {
      setCopied(true);
      notify("Copied. Make it yours before you send it.");
    } else {
      notify("Your words are selected. Use your device’s copy command.");
    }
  }

  return (
    <div className="exp-view exp-resources">
      <header className="page-heading exp-heading">
        <p className="eyebrow">A LITTLE HELP, WHEN YOU NEED IT</p>
        <h1>Find your next little step.</h1>
        <p className="muted">Useful words, thoughtful questions, and room to figure things out at your own pace.</p>
      </header>

      <section className="exp-script panel" aria-labelledby="exp-script-heading">
        <div className="exp-script-intro">
          <span className="exp-icon-bubble exp-rose"><MessageCircle size={23} aria-hidden="true" /></span>
          <div>
            <p className="eyebrow">LEND ME THE WORDS</p>
            <h2 id="exp-script-heading" className="section-title">When you know the feeling,<br />but not quite what to say.</h2>
          </div>
        </div>
        <div className="exp-choice-row" role="group" aria-label="Choose a conversation">
          {scripts.map((script, index) => (
            <button className={`exp-choice ${selected === index ? "is-selected" : ""}`} key={script.id} type="button" aria-pressed={selected === index} onClick={() => chooseScript(index)}>{script.label}</button>
          ))}
        </div>
        <div className="exp-script-editor">
          <label htmlFor="exp-script-draft">{currentScript.title}</label>
          <textarea id="exp-script-draft" ref={textareaRef} value={draft} maxLength={4000} onChange={(event) => { setDraft(event.target.value); setCopied(false); }} rows={5} spellCheck />
          <p className="exp-small muted">{currentScript.note}</p>
          <div className="exp-editor-footer">
            <button className="text-button exp-reset-script" type="button" onClick={() => { setDraft(currentScript.text); setCopied(false); }}><RotateCcw size={15} aria-hidden="true" /> Reset wording</button>
            <button className="btn btn-primary" type="button" onClick={copyScript}>{copied ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}{copied ? "Copied" : "Copy my words"}</button>
          </div>
        </div>
        <p className="exp-script-privacy"><LockKeyhole size={13} aria-hidden="true" /> These edits stay in this page; they aren’t saved to your account.</p>
      </section>

      <div className="exp-section-top">
        <div><p className="eyebrow">KEEP WHAT HELPS</p><h2 className="section-title">A few useful starting points</h2></div>
        <span className="exp-small muted">Open a guide to explore</span>
      </div>
      <div className="exp-guide-grid">
        {resourceGuides.map(({ id, Icon, color, label, title, description, questions, footer }) => (
          <details className="exp-guide panel" key={id}>
            <summary>
              <span className={`exp-icon-bubble exp-${color}`}><Icon size={22} aria-hidden="true" /></span>
              <span className="eyebrow">{label}</span>
              <h3>{title}</h3>
              <p className="muted">{description}</p>
              <span className="exp-guide-link">Explore the questions <ChevronDown size={17} aria-hidden="true" /></span>
            </summary>
            <div className="exp-guide-content">
              <ol>{questions.map((question) => <li key={question}>{question}</li>)}</ol>
              <p className="exp-small muted">{footer}</p>
            </div>
          </details>
        ))}
      </div>
      <section className="exp-soft-note">
        <Heart size={21} aria-hidden="true" />
        <div><h3>You can ask the small questions, too.</h3><p className="muted">There’s no perfect way to begin a conversation.</p></div>
        <button className="text-button" type="button" onClick={onCompose}>Try a post <ArrowRight size={16} aria-hidden="true" /></button>
      </section>
    </div>
  );
}

type JoyCategory = "all" | "creative" | "cosy" | "curious";

const joyPrompts: Array<{ category: Exclude<JoyCategory, "all">; title: string; body: string; note: string }> = [
  { category: "cosy", title: "Give an ordinary moment a soundtrack.", body: "Choose one song you love. Make a drink, sit somewhere comfortable, and let this one song be enough.", note: "No perfect playlist required." },
  { category: "creative", title: "Make something wonderfully unnecessary.", body: "Draw a tiny creature on a scrap of paper. Give her a name and a wildly specific hobby.", note: "Artistic talent is entirely optional." },
  { category: "curious", title: "Go on a tiny colour hunt.", body: "Choose a colour. Look around and find three things wearing it. Which one have you never really noticed before?", note: "Your current room is a perfectly good adventure." },
  { category: "cosy", title: "Build your five-minute book nook.", body: "Find a comfortable spot and read a page of something you enjoy. You’re allowed to reread a favourite.", note: "There is no reading target to meet." },
  { category: "creative", title: "Write a postcard from an imaginary holiday.", body: "Where are you? What is the most ridiculous thing you’ve eaten? Who is the slightly suspicious hotel cat?", note: "Two sentences can be an entire little escape." },
  { category: "curious", title: "Let yourself follow a small curiosity.", body: "Pick a question you’ve always wondered about. It can be as tiny as why a favourite word sounds the way it does.", note: "You don’t have to turn it into a new skill." },
];

const joyCategories: Array<{ id: JoyCategory; title: string }> = [
  { id: "all", title: "A little of everything" },
  { id: "creative", title: "Make something" },
  { id: "cosy", title: "Get cosy" },
  { id: "curious", title: "Stay curious" },
];

const joyCorners = [
  { id: "books", Icon: BookOpen, color: "sage", eyebrow: "THE BOOK NOOK", title: "One page is a lovely start.", description: "Revisit a favourite story, pick a poem, or make a list of the books you’d lend a friend.", activity: "Read a page just for the pleasure of it." },
  { id: "kitchen", Icon: Coffee, color: "sand", eyebrow: "LITTLE EVERYDAY RITUALS", title: "Make the ordinary yours.", description: "Use your favourite cup, give a snack a fancy name, or set a little table just for yourself.", activity: "Turn one everyday moment into a little ritual." },
  { id: "creative", Icon: Palette, color: "rose", eyebrow: "THE CREATIVE CORNER", title: "It doesn’t need to be good.", description: "A doodle, a paper flower, a tiny story. You can enjoy making something without showing anyone.", activity: "Make something for the fun of making it." },
];

export function JoyView({ notify, onNavigate }: ExploreViewProps) {
  const [category, setCategory] = useState<JoyCategory>("all");
  const [promptIndex, setPromptIndex] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const availablePrompts = useMemo(() => joyPrompts.filter((prompt) => category === "all" || prompt.category === category), [category]);
  const prompt = availablePrompts[promptIndex % availablePrompts.length];

  function chooseActivity(activity: string) {
    setChosen(activity);
    notify("A little idea for this visit. There’s no pressure to finish it.");
  }

  return (
    <div className="exp-view exp-joy">
      <header className="page-heading exp-heading">
        <p className="eyebrow">A LITTLE LIGHTNESS</p>
        <h1>Joy belongs here, too.</h1>
        <p className="muted">Something playful, something cosy, something just because. Pick what feels like you.</p>
      </header>
      <section className="exp-joy-deck" aria-labelledby="exp-joy-heading">
        <div className="exp-joy-ornament" aria-hidden="true"><Flower2 size={92} strokeWidth={1.1} /><span className="exp-ornament-spark"><Sparkles size={25} strokeWidth={1.3} /></span></div>
        <div className="exp-joy-deck-content">
          <p className="eyebrow">YOUR LITTLE JOY OF THE MOMENT</p>
          <div className="exp-choice-row" role="group" aria-label="Choose a kind of joy">
            {joyCategories.map((item) => <button key={item.id} className={`exp-choice ${category === item.id ? "is-selected" : ""}`} type="button" aria-pressed={category === item.id} onClick={() => { setCategory(item.id); setPromptIndex(0); }}>{item.title}</button>)}
          </div>
          <div className="exp-joy-prompt" aria-live="polite" aria-atomic="true">
            <h2 id="exp-joy-heading">{prompt.title}</h2>
            <p>{prompt.body}</p>
            <span className="exp-small">{prompt.note}</span>
          </div>
          <div className="exp-joy-actions">
            <button className="btn btn-primary" type="button" onClick={() => chooseActivity(prompt.title)}><Heart size={16} aria-hidden="true" /> I’ll try this</button>
            <button className="text-button" type="button" onClick={() => setPromptIndex((index) => index + 1)}>Another little idea <ArrowRight size={16} aria-hidden="true" /></button>
          </div>
        </div>
      </section>

      {chosen && <div className="exp-chosen" role="status"><span className="exp-icon-bubble exp-sage"><Check size={19} aria-hidden="true" /></span><div><span className="eyebrow">FOR THIS VISIT</span><p>{chosen}</p></div><button className="text-button" type="button" onClick={() => setChosen(null)}>Let it go</button></div>}

      <div className="exp-section-top"><div><p className="eyebrow">FOLLOW YOUR CURIOSITY</p><h2 className="section-title">A corner for your kind of happy</h2></div></div>
      <div className="exp-joy-corners">
        {joyCorners.map(({ id, Icon, color, eyebrow, title, description, activity }) => <article className="exp-joy-corner panel" key={id}><span className={`exp-icon-bubble exp-${color}`}><Icon size={24} aria-hidden="true" /></span><p className="eyebrow">{eyebrow}</p><h3>{title}</h3><p className="muted">{description}</p><button className="text-button" type="button" onClick={() => chooseActivity(activity)}>Make a little room <ArrowRight size={16} aria-hidden="true" /></button></article>)}
      </div>
      <div className="exp-joy-ending"><Leaf size={17} aria-hidden="true" /><p>More in the mood for doing nothing?</p><button className="text-button" type="button" onClick={() => onNavigate("quiet")}>The Quiet Room is open <ArrowRight size={15} aria-hidden="true" /></button></div>
    </div>
  );
}

export function QuietView({ onNavigate }: ExploreViewProps) {
  const [duration, setDuration] = useState(60);
  const [remaining, setRemaining] = useState(60);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const deadlineRef = useRef(0);

  useEffect(() => {
    if (!running) return;
    deadlineRef.current = Date.now() + remaining * 1000;
    const interval = window.setInterval(() => {
      const next = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setRemaining(next);
      if (next === 0) {
        setRunning(false);
        setFinished(true);
      }
    }, 250);
    return () => window.clearInterval(interval);
    // A new deadline is needed only on start/resume, never on each timer tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  function reset(nextDuration = duration) {
    setRunning(false);
    setFinished(false);
    setDuration(nextDuration);
    setRemaining(nextDuration);
  }

  const minutes = Math.floor(remaining / 60);
  const seconds = String(remaining % 60).padStart(2, "0");
  const circumference = 2 * Math.PI * 94;
  const progress = remaining / duration;
  const status = finished ? "Your moment is yours to finish. Stay a little longer, or continue your day." : running ? "Nothing to catch up on. Just a little space for you." : remaining < duration ? "Paused. You can continue whenever you like." : "Take a moment, without having to make anything of it.";

  return (
    <div className="exp-view exp-quiet">
      <header className="page-heading exp-heading">
        <p className="eyebrow">THE QUIET ROOM</p>
        <h1>You can simply be here.</h1>
        <p className="muted">No conversation to keep up with. No task to complete. Just a little breathing room.</p>
      </header>
      <section className="exp-pause-panel" aria-labelledby="exp-pause-heading">
        <div className="exp-pause-side-note"><Leaf size={19} strokeWidth={1.5} aria-hidden="true" /><p>Notice one small thing around you.<br />You don’t need to change anything.</p></div>
        <div className="exp-pause-center">
          <h2 id="exp-pause-heading" className="exp-small">A moment to yourself</h2>
          <div className="exp-timer">
            <svg viewBox="0 0 220 220" aria-hidden="true"><circle className="exp-timer-track" cx="110" cy="110" r="94" /><circle className="exp-timer-progress" cx="110" cy="110" r="94" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} transform="rotate(-90 110 110)" /></svg>
            <div className="exp-timer-inner"><Flower2 size={29} strokeWidth={1.2} aria-hidden="true" /><span className="exp-time" role="timer" aria-live="off" aria-label={`${minutes} minutes ${remaining % 60} seconds remaining`}>{minutes}:{seconds}</span><span className="exp-small">{finished ? "at your own pace" : "a little space"}</span></div>
          </div>
          <div className="exp-choice-row exp-duration" role="group" aria-label="Choose pause duration">{[60, 120].map((seconds) => <button key={seconds} className={`exp-choice ${duration === seconds ? "is-selected" : ""}`} type="button" aria-pressed={duration === seconds} onClick={() => reset(seconds)}>{seconds / 60} {seconds === 60 ? "minute" : "minutes"}</button>)}</div>
          <div className="exp-timer-actions"><button className="btn btn-primary" type="button" onClick={() => { if (finished) { setRemaining(duration); setFinished(false); } setRunning((value) => !value); }}>{running ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}{running ? "Pause" : finished ? "Another moment" : remaining < duration ? "Continue" : "Begin my pause"}</button><button className="exp-icon-button" type="button" aria-label="Reset pause timer" onClick={() => reset()}><RotateCcw size={18} aria-hidden="true" /></button></div>
          <p className="exp-timer-status" role="status" aria-live="polite">{status}</p>
        </div>
        <div className="exp-pause-side-note exp-pause-right"><Heart size={19} strokeWidth={1.5} aria-hidden="true" /><p>There is no right way to feel.<br />You’re free to leave at any time.</p></div>
      </section>
      <div className="exp-quiet-bottom"><p>Would a little company feel helpful?</p><div><button className="text-button" type="button" onClick={() => onNavigate("circles")}>Explore the circles <ArrowRight size={15} aria-hidden="true" /></button><button className="text-button" type="button" onClick={() => onNavigate("safety")}>Support & safety <ArrowRight size={15} aria-hidden="true" /></button></div></div>
    </div>
  );
}

const communityPromises = [
  { Icon: MessageCircle, title: "Listen to what she asks for.", text: "Respect the response preference on each post. Listening can be enough; advice should be welcome." },
  { Icon: HeartHandshake, title: "Make room for different lives.", text: "No shaming bodies, income, relationships, backgrounds, or choices. Disagree with care, without attacking a person." },
  { Icon: LockKeyhole, title: "Keep other people’s stories theirs.", text: "Don’t repost conversations, share identifying details, or pressure someone to reveal more." },
  { Icon: Leaf, title: "Let participation be a choice.", text: "Quiet reading, taking a break, and changing your mind are all welcome. Nobody owes a reply or a disclosure." },
];

export function SafetyView({ onNavigate }: ExploreViewProps) {
  return (
    <div className="exp-view exp-safety">
      <header className="page-heading exp-heading"><p className="eyebrow">OUR SHARED SPACE</p><h1>Care, with clear boundaries.</h1><p className="muted">What this space is for, what you control, and what to expect from this first version.</p></header>
      <section className="exp-alpha-note" aria-labelledby="exp-alpha-heading"><span className="exp-icon-bubble exp-sage"><ShieldCheck size={25} aria-hidden="true" /></span><div><p className="eyebrow">PRIVATE ALPHA</p><h2 id="exp-alpha-heading">A place to explore the experience.</h2><p>Conversations marked “Example” are fictional. Anything you create in this version is private to your signed-in account. You’re trying the community features; you are not posting to a live group of members.</p><p>Reports are saved to your preview review queue. There is no staffed moderation or emergency response service in this alpha.</p></div></section>

      <section className="exp-safety-grid" aria-label="Membership and privacy">
        <article className="panel exp-safety-card"><UsersRound size={24} aria-hidden="true" /><h2>A community for adult women</h2><p>The intended community is for women aged 18 and over, including trans women. Joining uses self-declaration; it does not verify someone’s age, gender, or intentions.</p><p>Respectful behaviour and consistent moderation will be essential when the community opens.</p></article>
        <article className="panel exp-safety-card"><LockKeyhole size={24} aria-hidden="true" /><h2>Your name, your choice</h2><p>Use a chosen display name. Your ChatGPT sign-in identifies your account; it is not shown as your community identity.</p><p>Hiding your profile on a post is not complete anonymity. The service still associates your own posts with your account.</p></article>
      </section>

      <div className="exp-section-top"><div><p className="eyebrow">HOW WE SHOW UP</p><h2 className="section-title">A few things we ask of each other</h2></div></div>
      <section className="exp-promises" aria-label="Community conduct">{communityPromises.map(({ Icon, title, text }) => <article key={title}><span className="exp-icon-bubble exp-cream"><Icon size={20} aria-hidden="true" /></span><div><h3>{title}</h3><p className="muted">{text}</p></div></article>)}</section>

      <section className="exp-safety-faq" aria-label="Safety questions">
        <details className="panel"><summary>What can I do if something feels uncomfortable?<ChevronDown size={18} aria-hidden="true" /></summary><p>You can block a profile and report a post using its menu. In this alpha, these controls apply to your own preview, and reports go to your preview review queue. They do not contact a live moderator.</p></details>
        <details className="panel"><summary>Can someone copy what they see?<ChevronDown size={18} aria-hidden="true" /></summary><p>Rules can prohibit copying and reposting, but a website cannot guarantee that nobody will take a screenshot or photograph a screen. Share only what you feel comfortable sharing, and avoid identifying details about yourself or someone else.</p></details>
        <details className="panel"><summary>Does a quick exit erase my browsing history?<ChevronDown size={18} aria-hidden="true" /></summary><p>No. A quick exit changes what is on the screen. It does not erase browser history or prevent device monitoring. The Safety Net Project explains these limits and offers practical technology-safety information.</p><a href="https://www.techsafety.org/exit-from-this-website-quickly" target="_blank" rel="noreferrer noopener" className="text-button">Read the Safety Net guidance <ArrowUpRight size={16} aria-hidden="true" /></a></details>
        <details className="panel"><summary>Is this professional or emergency support?<ChevronDown size={18} aria-hidden="true" /></summary><p>No. Her Haven’s alpha offers a community experience to explore and general resources. It does not provide therapy, medical care, legal advice, financial advice, or emergency monitoring. If you need urgent help, use an appropriate local emergency or support service rather than waiting for a reply here.</p></details>
      </section>

      <section className="exp-safety-resources panel"><div><p className="eyebrow">READ AT YOUR OWN PACE</p><h2 className="section-title">Understand your digital space.</h2><p className="muted">Independent information you can explore when it is useful to you.</p></div><a href="https://chile.unwomen.org/en/articles/explainer/online-safety-101-what-every-woman-and-girl-should-know" target="_blank" rel="noreferrer noopener"><span><strong>Online safety 101</strong><span className="exp-small muted">UN Women · information about digital abuse and online safety</span></span><ArrowUpRight size={19} aria-hidden="true" /></a><a href="https://www.techsafety.org/exit-from-this-website-quickly" target="_blank" rel="noreferrer noopener"><span><strong>Quick-exit tools and their limits</strong><span className="exp-small muted">Safety Net Project · technology safety and privacy</span></span><ArrowUpRight size={19} aria-hidden="true" /></a></section>
      <div className="exp-safety-ending"><Heart size={18} aria-hidden="true" /><p>You deserve to understand a space before sharing in it.</p><button className="text-button" type="button" onClick={() => onNavigate("settings")}>My privacy choices <ArrowRight size={16} aria-hidden="true" /></button></div>
    </div>
  );
}
