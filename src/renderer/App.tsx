import {useEffect, useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import GameLibrary, {useGameStudio} from './GameLibrary';
import FreeStudio from './FreeStudio';
import LocalChat from './LocalChat';
import ScenePreview from './ScenePreview';
import {getMessages, type Language, type PageId} from './i18n/messages';
import './first-use.css';

type IconName = PageId | 'spark' | 'arrow' | 'chevron' | 'shield' | 'globe' | 'cube' | 'check' | 'info' | 'bolt' | 'moon';
function Icon({name,size=20,className=''}:{name:IconName;size?:number;className?:string}) {
  const common = {width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round' as const,strokeLinejoin:'round' as const,className};
  const paths:Record<IconName,ReactNode> = {
    home:<><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></>,
    create:<><path d="m12 3 1.9 6.1L20 11l-6.1 1.9L12 19l-1.9-6.1L4 11l6.1-1.9z"/><path d="m19 17 1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/></>,
    games:<><rect x="2" y="7" width="20" height="12" rx="5"/><path d="M8 10.5v5m-2.5-2.5h5M16 12h.01M18.5 15h.01"/></>,
    settings:<><path d="M10.8 3h2.4l.6 2.1a7 7 0 0 1 1.7.8l2-.9 1.7 1.7-.9 2a7 7 0 0 1 .8 1.7l2.1.6v2.4l-2.1.6a7 7 0 0 1-.8 1.7l.9 2-1.7 1.7-2-.9a7 7 0 0 1-1.7.8l-.6 2.1h-2.4l-.6-2.1a7 7 0 0 1-1.7-.8l-2 .9-1.7-1.7.9-2a7 7 0 0 1-.8-1.7L3 13.2v-2.4l2.1-.6a7 7 0 0 1 .8-1.7l-.9-2 1.7-1.7 2 .9a7 7 0 0 1 1.7-.8z"/><circle cx="12" cy="12" r="3"/></>,
    spark:<><path d="m12 2 2.1 7.9L22 12l-7.9 2.1L12 22l-2.1-7.9L2 12l7.9-2.1z"/></>,
    arrow:<><path d="M5 12h14m-6-6 6 6-6 6"/></>,
    chevron:<><path d="m9 18 6-6-6-6"/></>,
    shield:<><path d="M12 2 4 6v6c0 5 3.2 8 8 10 4.8-2 8-5 8-10V6z"/><path d="m9 12 2 2 4-4"/></>,
    globe:<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-6 6-6 12 0 18M12 3c6 6 6 12 0 18"/></>,
    cube:<><path d="m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10"/></>,
    check:<><path d="m5 12 4 4L19 6"/></>,
    info:<><circle cx="12" cy="12" r="10"/><path d="M12 11v6M12 7h.01"/></>,
    bolt:<><path d="m13 2-9 12h7l-1 8 10-12h-7z"/></>,
    moon:<><path d="M20.7 13.1A9 9 0 0 1 10.9 3.3 9 9 0 1 0 20.7 13.1z"/></>,
  };
  return <svg {...common} aria-hidden="true">{paths[name]}</svg>;
}

const creationText = {
  ko: {
    title: 'AI와 대화하며 내 게임을 만드세요',
    intro: '한 문장으로 게임을 구상하고, 같은 화면에서 플레이한 뒤 대화로 다듬을 수 있어요.',
    open: '빈 게임에서 시작',
    reopen: '제작 대화 열기',
    library: '내 게임 보기',
    saved: '자유 제작 게임 열기',
    setup: '로컬 AI 설정',
    setupDescription: 'Ollama 연결 상태와 이 PC에서 사용할 모델을 확인합니다.',
  },
  en: {
    title: 'Build your own game with AI',
    intro: 'Describe your game in a sentence, play it in the same window, and refine it in the conversation.',
    open: 'Start from a blank game',
    reopen: 'Open the game conversation',
    library: 'Open My Games',
    saved: 'Open free-form games',
    setup: 'Local AI settings',
    setupDescription: 'Check the Ollama connection and manage models on this PC.',
  },
} as const;

function Logo({tagline}: {tagline: string}) {
  return <div className="brand-lockup"><div className="logo-icon"><span className="logo-core"><Icon name="spark" size={22}/></span></div><div className="brand-type"><strong>AI GAME HUB</strong><small>{tagline}</small></div></div>;
}

function readPreference(key: 'language' | 'reduce-motion') {
  try {
    return localStorage.getItem('ai-game-hub:' + key);
  } catch {
    return null;
  }
}

function writePreference(key: 'language' | 'reduce-motion', value: string) {
  try {
    localStorage.setItem('ai-game-hub:' + key, value);
  } catch {
    // Preferences still work for this session when storage is unavailable.
  }
}

export default function App() {
  const [page,setPage] = useState<PageId>('home');
  const [language,setLanguage] = useState<Language>(() => readPreference('language') === 'en' ? 'en' : 'ko');
  const [reduceMotion,setReduceMotion] = useState(() => {
    const preference = readPreference('reduce-motion');
    return preference === 'true' || (preference !== 'false' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  });
  const [appVersion,setAppVersion] = useState('');
  const [freeOpened, setFreeOpened] = useState(false);
  const [showAiSetup, setShowAiSetup] = useState(false);
  const focusView = useRef<string | null>(null);
  const freeVisible = page === 'create' && !showAiSetup;
  const t = getMessages(language);
  const studio = useGameStudio(page === 'games');
  const creation = creationText[language];
  const version = appVersion ? 'v' + appVersion : '—';

  useEffect(() => {
    writePreference('language', language);
    document.documentElement.lang=language;
    document.title=`AI Game Hub — ${t.internal}`;
  },[language,t.internal]);
  useEffect(() => { window.hub?.getAppInfo().then(info=>setAppVersion(info.version)).catch(()=>{}); },[]);
  useEffect(() => {
    writePreference('reduce-motion', String(reduceMotion));
    document.documentElement.classList.toggle('reduce-motion',reduceMotion);
  },[reduceMotion]);
  const nav: PageId[] = ['home', 'create', 'games', 'settings'];
  useLayoutEffect(() => {
    document.getElementById('main-content')?.scrollTo({top: 0, behavior: 'instant'});
    if (focusView.current) {
      document.getElementById(focusView.current)?.focus({preventScroll: true});
      focusView.current = null;
    }
  }, [page, showAiSetup]);

  function navigate(next: PageId) {
    if (next === 'create') setFreeOpened(true);
    setShowAiSetup(false);
    setPage(next);
  }

  function openFreeStudio() {
    focusView.current = 'free-studio-title';
    navigate('create');
  }

  function openAiSetup() {
    focusView.current = 'local-chat-title';
    setShowAiSetup(true);
    setPage('create');
  }

  return <div className="app-layout">
    <aside className="sidebar" aria-label={t.navTitle}>
      <Logo tagline={t.tagline}/>
      <div className="sidebar-body">
        <div className="nav-label">{t.workspace}</div>
        <nav className="nav-list" aria-label={t.navTitle}>
          {nav.map(item=><button type="button" key={item} className={'nav-item '+(page===item?'active':'')} aria-current={page===item?'page':undefined} aria-label={t[item]} onClick={() => navigate(item)}><span className="nav-item-icon"><Icon name={item} size={19}/></span><span className="nav-text">{t[item]}</span>{page===item&&<span className="nav-active-bar"/>}</button>)}
        </nav>
      </div>
    </aside>

    <div className="main-container">
      <header className="topbar"><div className="breadcrumbs"><span>{t.workspace}</span><Icon name="chevron" size={14}/><strong>{t[page]}</strong></div><div className="top-actions"><span className="top-help"><Icon name="shield" size={15}/>{t.internal}</span></div></header>
      <main className="content" id="main-content" tabIndex={-1}>
        {page === 'home' && (
          <section className="home-hero">
            <div className="hero-copy">
              <h1>{creation.title}</h1>
              <p>{creation.intro}</p>
              <div className="first-use-actions">
                <button id="open-free-studio" type="button" className="primary-button" onClick={openFreeStudio}>
                  {freeOpened ? creation.reopen : creation.open}<Icon name="arrow" size={18}/>
                </button>
                <button type="button" className="secondary-button" onClick={() => navigate('games')}>
                  {creation.library}
                </button>
              </div>
            </div>
            <div className="first-use-hero-art" aria-hidden="true">
              <ScenePreview mode="2d" label="" />
            </div>
          </section>
        )}

        {freeOpened && <FreeStudio language={language} visible={freeVisible} onOpenAi={openAiSetup}/>}
        {page === 'create' && showAiSetup && (
          <LocalChat language={language} visible onBack={openFreeStudio} setupOnly/>
        )}

        {page==='games'&&<>
          <div className="page-heading"><div className="eyebrow"><span className="eyebrow-line"/>{t.libraryEyebrow}</div><h1>{t.gamesTitle}</h1><p>{t.gamesDesc}</p></div>
          <div className="first-use-actions"><button className="secondary-button" type="button" onClick={openFreeStudio}>
            {creation.saved}<Icon name="arrow" size={17}/>
          </button></div>
          <GameLibrary studio={studio} language={language} empty={
            <div className="library-empty">
              <div className="library-empty-art" aria-hidden="true">
                <div className="library-empty-ring ring-outer"/><div className="library-empty-ring ring-inner"/>
                <div className="library-empty-box"><Icon name="games" size={50}/></div>
                <span className="library-spark spark-a">✦</span><span className="library-spark spark-b">✧</span>
              </div>
              <h2>{t.emptyTitle}</h2>
              <p>{t.emptyDesc}</p>
              <button type="button" className="secondary-button" onClick={openFreeStudio}>{t.start}<Icon name="arrow" size={17}/></button>
            </div>
          }/>
        </>}

        {page==='settings'&&<>
          <div className="page-heading"><div className="eyebrow"><span className="eyebrow-line"/>{t.settingsEyebrow}</div><h1>{t.settingsTitle}</h1><p>{t.settingsDesc}</p></div>
          <div className="settings-grid"><section className="settings-main"><div className="settings-group-title">{t.generalSection}</div><div className="setting-card"><div className="setting-icon"><Icon name="globe" size={21}/></div><div className="setting-copy"><strong>{t.language}</strong><p>{t.languageDesc}</p></div><select aria-label={t.language} value={language} onChange={e=>setLanguage(e.target.value as Language)}><option value="ko">한국어</option><option value="en">English</option></select></div><div className="setting-card"><div className="setting-icon"><Icon name="moon" size={21}/></div><div className="setting-copy"><strong>{t.appearance}</strong><p>{t.appearanceDesc}</p></div><span className="static-control"><Icon name="check" size={13}/>{t.darkTheme}</span></div><div className="setting-card"><div className="setting-icon"><Icon name="bolt" size={21}/></div><div className="setting-copy"><strong>{t.reducedMotion}</strong><p>{t.motionDesc}</p></div><button type="button" className={'toggle '+(reduceMotion?'on':'')} role="switch" aria-checked={reduceMotion} aria-label={t.reducedMotion} onClick={()=>setReduceMotion(v=>!v)}><span/></button></div><div className="setting-card"><div className="setting-icon"><Icon name="create" size={21}/></div><div className="setting-copy"><strong>{creation.setup}</strong><p>{creation.setupDescription}</p></div><button type="button" className="game-quiet-button" id="open-ai-setup" onClick={openAiSetup}>{creation.setup}</button></div><div className="settings-group-title lower">{t.aboutSection}</div><div className="setting-card"><div className="setting-icon"><Icon name="info" size={21}/></div><div className="setting-copy"><strong>{t.appInfo}</strong><p>AI Game Hub · {version}</p></div><span className="static-control">{t.currentPhase}</span></div><div className="setting-card"><div className="setting-icon"><Icon name="shield" size={21}/></div><div className="setting-copy"><strong>{t.security}</strong><p>{t.securityDesc}</p></div></div></section><aside className="settings-side"><div className="settings-info-illustration"><span className="settings-info-spark">✦</span><div><Icon name="cube" size={57}/></div><span className="settings-info-spark tiny">✧</span></div><span className="settings-side-label">AI GAME HUB · {t.alphaBadge}</span><h3>{t.settingsAsideTitle}</h3><p>{t.settingsAsideDesc}</p><div className="side-info-divider"/><div className="side-info-row"><span>{t.currentPhase}</span><strong>03 / 05</strong></div><div className="side-info-row"><span>{t.info1}</span><strong>{version}</strong></div><div className="side-info-row"><span>{t.info3}</span><strong>{t.internalOnly}</strong></div></aside></div>
        </>}
      </main>
      <footer className="app-footer"><span>© AI Game Hub · {t.internalOnly}</span><span>{t.footer}</span></footer>
    </div>
  </div>;
}
