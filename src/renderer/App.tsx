import {useEffect, useLayoutEffect, useState, type ReactNode} from 'react';
import {getMessages, type Language, type PageId} from './i18n/messages';

type IconName = PageId | 'spark' | 'arrow' | 'chevron' | 'shield' | 'globe' | 'cube' | 'check' | 'info' | 'book' | 'bolt' | 'layers' | 'monitor' | 'lock' | 'moon' | 'layout' | 'compass' | 'circle' | 'cpu' | 'wand' | 'plus' | 'external' | 'joystick' | 'lightbulb' | 'keyboard' | 'clock' | 'x';
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
    book:<><path d="M4 19V5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1 0-4h13M8 7h7M8 11h5"/></>,
    bolt:<><path d="m13 2-9 12h7l-1 8 10-12h-7z"/></>,
    layers:<><path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/></>,
    monitor:<><rect x="3" y="3" width="18" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/></>,
    lock:<><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></>,
    moon:<><path d="M20.7 13.1A9 9 0 0 1 10.9 3.3 9 9 0 1 0 20.7 13.1z"/></>,
    layout:<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/></>,
    compass:<><circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5z"/></>,
    circle:<><circle cx="12" cy="12" r="9"/></>,
    cpu:<><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 1v5m6-5v5M9 18v5m6-5v5M1 9h5m-5 6h5m12-6h5m-5 6h5"/></>,
    wand:<><path d="m3 21 12-12M12 3l1 3 3 1-3 1-1 3-1-3-3-1 3-1zm7 10 .5 2 2 .5-2 .5-.5 2-.5-2-2-.5 2-.5z"/></>,
    plus:<><path d="M12 5v14M5 12h14"/></>,
    external:<><path d="M13 4h7v7m0-7-9 9"/><path d="M20 14v6H4V4h6"/></>,
    joystick:<><path d="M12 14V5"/><circle cx="12" cy="4" r="2"/><path d="M6 14h12l2 7H4z"/></>,
    lightbulb:<><path d="M9 18h6m-5 3h4M8 14a7 7 0 1 1 8 0l-1 3H9z"/></>,
    keyboard:<><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M5 9h.01M9 9h.01M13 9h.01M17 9h.01M5 13h.01M9 13h.01M13 13h.01M17 13h.01M7 16h10"/></>,
    clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    x:<><path d="M18 6 6 18M6 6l12 12"/></>
  };
  return <svg {...common} aria-hidden="true">{paths[name]}</svg>;
}

function ConceptArtwork({variant='space'}:{variant?:'space'|'forest'|'builder'}) {
  return <div className={`concept-art concept-${variant}`} aria-hidden="true">
    <div className="concept-grid"/>
    <div className="concept-halo"/>
    <div className="concept-planet"/>
    <div className="concept-land land-one"/>
    <div className="concept-land land-two"/>
    <div className="concept-character"><div className="character-eye"/><div className="character-fin"/></div>
    <div className="concept-star star-one">✦</div><div className="concept-star star-two">✧</div><div className="concept-star star-three">✳</div>
  </div>;
}

function Logo() {
  return <div className="brand-lockup"><div className="logo-icon"><span className="logo-core"><Icon name="spark" size={22}/></span></div><div className="brand-type"><strong>AI GAME HUB</strong><small>IMAGINE. CREATE. PLAY.</small></div></div>;
}

export default function App() {
  const [page,setPage] = useState<PageId>('home');
  const [language,setLanguage] = useState<Language>('ko');
  const [prompt,setPrompt] = useState('');
  const [concept,setConcept] = useState<'2d'|'3d'>('2d');
  const [reduceMotion,setReduceMotion] = useState(false);
  const [appVersion,setAppVersion] = useState('0.1.0');
  const t = getMessages(language);

  useEffect(() => {
    document.documentElement.lang=language;
    document.title=`AI Game Hub — ${t.internal}`;
  },[language,t.internal]);
  useEffect(() => { window.hub?.getAppInfo().then(info=>setAppVersion(info.version)).catch(()=>{}); },[]);
  useEffect(() => { document.documentElement.classList.toggle('reduce-motion',reduceMotion); },[reduceMotion]);
  const nav:PageId[]=['home','create','games','settings'];
  useLayoutEffect(() => {
    document.getElementById('main-content')?.scrollTo({top: 0, behavior: 'instant'});
  }, [page]);

  const jump = (next: PageId) => {
    setPage(next);
    document.getElementById('main-content')?.focus({preventScroll: true});
  };

  return <div className="app-layout">
    <aside className="sidebar" aria-label={t.navTitle}>
      <Logo/>
      <div className="sidebar-body">
        <div className="nav-label">{t.workspace}</div>
        <nav className="nav-list" aria-label={t.navTitle}>
          {nav.map(item=><button type="button" key={item} className={'nav-item '+(page===item?'active':'')} aria-current={page===item?'page':undefined} aria-label={t[item]} onClick={()=>setPage(item)}><span className="nav-item-icon"><Icon name={item} size={19}/></span><span className="nav-text">{t[item]}</span>{page===item&&<span className="nav-active-bar"/>}</button>)}
        </nav>
        <div className="sidebar-divider"/>
        <div className="nav-label">{t.yourWorkspace}</div>
        <div className="sidebar-placeholder"><Icon name="layers" size={17}/><span>{t.noProjects}</span><span className="nav-coming">SOON</span></div>
      </div>
      <div className="sidebar-footer">
        <div className="sidebar-progress"><div className="progress-top"><span className="progress-overline">DEVELOPMENT</span><span>01 / 05</span></div><strong>{t.currentPhase}</strong><div className="progress-track"><span/></div><small>{t.prototypeNote}</small></div>
        <div className="side-account"><span className="account-monogram">AG</span><div><strong>{t.guestDev}</strong><small>{t.internalOnly}</small></div><span className="online-indicator"/></div>
      </div>
    </aside>

    <div className="main-container">
      <header className="topbar"><div className="breadcrumbs"><span>{t.workspace}</span><Icon name="chevron" size={14}/><strong>{t[page]}</strong></div><div className="top-actions"><span className="top-help"><Icon name="shield" size={15}/>{t.internal}</span><span className="top-phase">ALPHA · 01</span><span className="top-avatar">AG</span></div></header>
      <main className="content" id="main-content" tabIndex={-1}>
        {page==='home'&&<>
          <div className="welcome-heading"><div><div className="eyebrow"><span className="eyebrow-line"/>{t.welcomeEyebrow}</div><h1>{t.welcomeTitle}<span className="sparkle-inline">✦</span></h1><p>{t.welcomeSubtitle}</p></div><span className="date-label"><Icon name="clock" size={15}/>{t.phase} · v{appVersion}</span></div>
          <section className="home-hero"><div className="hero-noise"/><div className="hero-copy"><div className="hero-flag"><span className="flag-dot"/>{t.heroEyebrow}</div><h2>{t.heroTitleLine1}<br/><em>{t.heroTitleLine2}</em></h2><p>{t.heroText}</p><button type="button" className="primary-button hero-button" onClick={()=>jump('create')}>{t.start}<Icon name="arrow" size={18}/></button><div className="hero-disclaimer"><Icon name="info" size={13}/>{t.heroDisclaimer}</div></div><div className="hero-visual"><div className="hero-visual-outer"><div className="visual-orbit orbit-1"/><div className="visual-orbit orbit-2"/><div className="visual-orbit orbit-3"/><div className="visual-floating floating-a">✧</div><div className="visual-floating floating-b">✦</div><div className="visual-floating floating-c">✳</div><div className="visual-portal"><div className="visual-portal-inner"><div className="portal-mountain mountain-a"/><div className="portal-mountain mountain-b"/><div className="portal-floor"/><div className="portal-sun"/><div className="portal-player"/></div></div><div className="visual-chip chip-1"><Icon name="cube" size={15}/>3D</div><div className="visual-chip chip-2"><Icon name="bolt" size={15}/>CREATE</div></div></div></section>
          <div className="section-head"><div><span className="section-prefix">01 / {t.sectionDiscover}</span><h3>{t.discoverTitle}</h3><p>{t.discoverSub}</p></div><span className="section-muted">{t.stageOneBadge}</span></div>
          <div className="quick-grid"><button className="quick-card quick-create" type="button" onClick={()=>jump('create')}><span className="quick-icon accent-purple"><Icon name="wand" size={23}/></span><div className="quick-card-body"><strong>{t.quickCreate}</strong><p>{t.quickCreateDesc}</p></div><span className="quick-arrow"><Icon name="arrow" size={19}/></span></button><button className="quick-card quick-library" type="button" onClick={()=>jump('games')}><span className="quick-icon accent-blue"><Icon name="games" size={23}/></span><div className="quick-card-body"><strong>{t.collection}</strong><p>{t.collectionDesc}</p></div><span className="quick-arrow"><Icon name="arrow" size={19}/></span></button></div>
          <div className="section-head concept-heading"><div><span className="section-prefix">02 / {t.sectionInspiration}</span><h3>{t.conceptTitle}</h3><p>{t.conceptDescription}</p></div><span className="section-muted"><Icon name="info" size={14}/>{t.conceptDisclaimer}</span></div>
          <div className="concept-row"><article className="concept-tile"><ConceptArtwork variant="space"/><div className="concept-meta"><span>{t.conceptOneTag}</span><strong>{t.conceptOne}</strong><small>{t.conceptIllustration}</small></div></article><article className="concept-tile"><ConceptArtwork variant="forest"/><div className="concept-meta"><span>{t.conceptTwoTag}</span><strong>{t.conceptTwo}</strong><small>{t.conceptIllustration}</small></div></article><article className="concept-tile"><ConceptArtwork variant="builder"/><div className="concept-meta"><span>{t.conceptThreeTag}</span><strong>{t.conceptThree}</strong><small>{t.conceptIllustration}</small></div></article></div>
          <div className="foot-note"><span className="note-icon"><Icon name="shield" size={19}/></span><div><strong>{t.protectedTitle}</strong><p>{t.protectedDesc}</p></div><span className="foot-phase">PHASE 01</span></div>
        </>}

        {page==='create'&&<>
          <div className="page-heading"><div className="eyebrow"><span className="eyebrow-line"/>CREATE STUDIO / 01</div><h1>{t.createTitle}</h1><p>{t.createDesc}</p></div>
          <div className="studio-steps"><div className="step-item selected"><span>01</span><div><strong>{t.studioStepOne}</strong><small>{t.availableNow}</small></div></div><div className="step-connector"/><div className="step-item waiting"><span>02</span><div><strong>{t.studioStepTwo}</strong><small>{t.planned}</small></div></div><div className="step-connector"/><div className="step-item waiting"><span>03</span><div><strong>{t.studioStepThree}</strong><small>{t.planned}</small></div></div></div>
          <div className="studio-grid"><section className="studio-panel"><div className="panel-title-row"><div><span className="panel-kicker">YOUR IDEA</span><h2>{t.studioPromptTitle}</h2></div><span className="preview-label"><span className="preview-dot"/>{t.previewOnly}</span></div><div className="mode-heading">{t.modeTitle}</div><div className="choice-row"><button type="button" className={'choice-button '+(concept==='2d'?'chosen':'')} onClick={()=>setConcept('2d')} aria-pressed={concept==='2d'}><Icon name="layout" size={18}/>2D <Icon name="check" size={15} className="chosen-check"/></button><button type="button" className={'choice-button '+(concept==='3d'?'chosen':'')} onClick={()=>setConcept('3d')} aria-pressed={concept==='3d'}><Icon name="cube" size={18}/>3D <Icon name="check" size={15} className="chosen-check"/></button></div><div className="input-head"><label htmlFor="game-idea">{t.ideaLabel}</label><span>{prompt.length} / 1000</span></div><textarea id="game-idea" value={prompt} onChange={event=>setPrompt(event.target.value)} placeholder={t.placeholder} maxLength={1000} spellCheck={false}/><div className="idea-tip"><Icon name="lock" size={14}/>{t.demoMessage}</div><div className="studio-actions"><button type="button" disabled className="primary-button disabled-action">{t.promptButton}<Icon name="arrow" size={17}/></button><span>{t.needNextPhase}</span></div></section>
          <aside className="studio-side"><section className="side-preview"><div className="side-preview-header"><span className="panel-kicker">CONCEPT VIEW</span><span>{t.conceptNotGame}</span></div><ConceptArtwork variant={concept==='2d'?'space':'builder'}/><div className="side-preview-footer"><div><strong>{concept==='2d'?t.sampleGame2d:t.sampleGame3d}</strong><small>{t.visualMock}</small></div><span className="preview-chip">{concept.toUpperCase()}</span></div></section><div className="studio-helper"><span className="helper-bubble"><Icon name="lightbulb" size={19}/></span><div><strong>{t.studioTipTitle}</strong><p>{t.studioTipBody}</p></div></div></aside></div>
          <div className="ideas-section"><div className="section-head compact"><div><h3>{t.samplesTitle}</h3><p>{t.samplesSubtitle}</p></div><span className="section-muted">{t.selectToFill}</span></div><div className="example-grid">{[t.sample1,t.sample2,t.sample3].map((sample,i)=><button type="button" key={sample} className="example-card" onClick={()=>setPrompt(sample)}><span className={`example-symbol symbol-${i}`}><Icon name={i===0?'bolt':i===1?'cube':'joystick'} size={21}/></span><span>{sample}</span><Icon name="plus" size={18} className="example-plus"/></button>)}</div></div>
        </>}

        {page==='games'&&<>
          <div className="page-heading"><div className="eyebrow"><span className="eyebrow-line"/>YOUR LIBRARY / 01</div><h1>{t.gamesTitle}</h1><p>{t.gamesDesc}</p></div>
          <div className="library-info"><div><Icon name="layers" size={21}/><span>{t.librarySummary}</span></div><span>0 {t.projects}</span></div>
          <div className="library-empty"><div className="library-empty-art"><div className="library-empty-ring ring-outer"/><div className="library-empty-ring ring-inner"/><div className="library-empty-box"><Icon name="games" size={50}/></div><span className="library-spark spark-a">✦</span><span className="library-spark spark-b">✧</span></div><span className="library-overline">YOUR NEXT ADVENTURE STARTS HERE</span><h2>{t.emptyTitle}</h2><p>{t.emptyDesc}</p><button type="button" className="secondary-button" onClick={()=>jump('create')}>{t.start}<Icon name="arrow" size={17}/></button><span className="empty-reminder"><Icon name="info" size={14}/>{t.emptyReminder}</span></div>
          <div className="library-bottom"><div className="library-bottom-icon"><Icon name="shield" size={19}/></div><div><strong>{t.saveLaterTitle}</strong><p>{t.saveLaterBody}</p></div></div>
        </>}

        {page==='settings'&&<>
          <div className="page-heading"><div className="eyebrow"><span className="eyebrow-line"/>APP PREFERENCES / 01</div><h1>{t.settingsTitle}</h1><p>{t.settingsDesc}</p></div>
          <div className="settings-grid"><section className="settings-main"><div className="settings-group-title">{t.generalSection}</div><div className="setting-card"><div className="setting-icon"><Icon name="globe" size={21}/></div><div className="setting-copy"><strong>{t.language}</strong><p>{t.languageDesc}</p></div><select aria-label={t.language} value={language} onChange={e=>setLanguage(e.target.value as Language)}><option value="ko">한국어</option><option value="en">English</option></select></div><div className="setting-card"><div className="setting-icon"><Icon name="moon" size={21}/></div><div className="setting-copy"><strong>{t.appearance}</strong><p>{t.appearanceDesc}</p></div><span className="static-control"><Icon name="check" size={13}/>{t.darkTheme}</span></div><div className="setting-card"><div className="setting-icon"><Icon name="bolt" size={21}/></div><div className="setting-copy"><strong>{t.reducedMotion}</strong><p>{t.motionDesc}</p></div><button type="button" className={'toggle '+(reduceMotion?'on':'')} role="switch" aria-checked={reduceMotion} aria-label={t.reducedMotion} onClick={()=>setReduceMotion(v=>!v)}><span/></button></div><div className="settings-group-title lower">{t.aboutSection}</div><div className="setting-card"><div className="setting-icon"><Icon name="info" size={21}/></div><div className="setting-copy"><strong>{t.appInfo}</strong><p>AI Game Hub · v{appVersion}</p></div><span className="static-control">{t.currentPhase}</span></div><div className="setting-card"><div className="setting-icon"><Icon name="shield" size={21}/></div><div className="setting-copy"><strong>{t.security}</strong><p>{t.securityDesc}</p></div></div></section><aside className="settings-side"><div className="settings-info-illustration"><span className="settings-info-spark">✦</span><div><Icon name="cube" size={57}/></div><span className="settings-info-spark tiny">✧</span></div><span className="settings-side-label">AI GAME HUB · ALPHA</span><h3>{t.settingsAsideTitle}</h3><p>{t.settingsAsideDesc}</p><div className="side-info-divider"/><div className="side-info-row"><span>{t.currentPhase}</span><strong>01 / 05</strong></div><div className="side-info-row"><span>{t.info1}</span><strong>v{appVersion}</strong></div><div className="side-info-row"><span>{t.info3}</span><strong>{t.internalOnly}</strong></div></aside></div>
        </>}
      </main>
      <footer className="app-footer"><span>© AI Game Hub · {t.internalOnly}</span><span>{t.footer}</span></footer>
    </div>
  </div>;
}
