import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { GameLibrarySnapshot, GameMode, GameProject, GameResult } from '../shared/games';
import {gameSettingsText} from './GameSettings';
import { getMessages, type Language } from './i18n/messages';
import './game-library.css';

type GameAction = 'create' | 'update' | 'restore' | 'play' | 'stop';
type Activity = { action: GameAction; id?: string };
type Completed = Activity & { result: GameResult };
type Studio = ReturnType<typeof useGameStudio>;
type StudioText = ReturnType<typeof getMessages>['gameStudio'];

const libraryCopy = {
  ko: {
    search: '게임 제목 검색', mode: '게임 형식', allModes: '모든 형식',
    noResults: '조건에 맞는 게임이 없습니다.', clearFilters: '검색 조건 지우기',
    cancelPreparation: '실행 준비 취소', cancellingPreparation: '취소 중…',
    restoreQuestion: '이전 버전으로 복원할까요?',
    restoreHelp: '제목, 수집 목표, 난이도, 테마, 이동 설정이 이전 저장 상태로 돌아갑니다.',
    confirmRestore: '복원하기', keepCurrent: '현재 버전 유지',
    playFocus: '게임에 키보드 포커스',
    controls: '이동 · 방향키 / WASD, 점프 · Space, 다시 시작 · R, 닫기 · Esc',
    ready: '게임이 준비됐습니다.',
    webTemplate: 'Godot Web 실행 템플릿이 필요합니다. 설정 방법은 README의 Windows Godot 설정에서 확인하세요.',
    exportTimeout: '게임 준비 시간이 초과됐습니다. 다른 작업을 잠시 멈춘 뒤 다시 실행해 주세요.',
  },
  en: {
    search: 'Search game titles', mode: 'Game format', allModes: 'All formats',
    noResults: 'No games match these filters.', clearFilters: 'Clear filters',
    cancelPreparation: 'Cancel preparation', cancellingPreparation: 'Cancelling…',
    restoreQuestion: 'Restore the previous version?',
    restoreHelp: 'The title, collection target, difficulty, theme, and movement options will return to their previous values.',
    confirmRestore: 'Restore', keepCurrent: 'Keep current version',
    playFocus: 'Focus the game',
    controls: 'Move · Arrow keys / WASD, jump · Space, restart · R, close · Esc',
    ready: 'Game ready.',
    webTemplate: 'Godot’s Web export template is required for play. See Windows Godot setup in the README.',
    exportTimeout: 'Game preparation timed out. Pause other work and try playing again.',
  },
} as const;
type LibraryCopy = typeof libraryCopy[Language];

const gameOrigin = 'hub-game://play';
const previewPattern = /^hub-game:\/\/play\/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\/index\.html$/;

export function useGameStudio(libraryVisible: boolean) {
  const api = typeof window.hub?.listGames === 'function' ? window.hub : undefined;
  const [snapshot, setSnapshot] = useState<GameLibrarySnapshot | null>(null);
  const [listError, setListError] = useState(false);
  const [pending, setPending] = useState<Activity | null>(null);
  const [completed, setCompleted] = useState<Completed | null>(null);
  const current = useRef<Activity | null>(null);
  const refreshToken = useRef(0);
  const cancelRequest = useRef<Promise<GameResult> | null>(null);
  const [cancellingPreview, setCancellingPreview] = useState(false);

  const refresh = useCallback(async () => {
    if (!api) return;
    const token = ++refreshToken.current;
    try {
      const library = await api.listGames();
      if (refreshToken.current === token) {
        setSnapshot(library);
        setListError(false);
      }
    } catch {
      if (refreshToken.current === token) setListError(true);
    }
  }, [api]);

  useEffect(() => {
    if (!libraryVisible) return;
    void refresh();
  }, [libraryVisible, refresh]);

  const playingId = snapshot?.playingId;
  useEffect(() => {
    if (!libraryVisible || !playingId) return;
    const timer = window.setInterval(() => void refresh(), 800);
    return () => window.clearInterval(timer);
  }, [libraryVisible, playingId, refresh]);

  const cancelPreparing = useCallback(() => {
    if (!api || current.current?.action !== 'play' || cancelRequest.current) return;
    setCancellingPreview(true);
    cancelRequest.current = Promise.resolve().then(() => api.stopGame()).catch(
      (): GameResult => ({ status: 'error', code: 'unavailable' }),
    );
  }, [api]);

  const run = useCallback(async (activity: Activity, invoke: () => Promise<GameResult>) => {
    if (!api || current.current) return;
    current.current = activity;
    setPending(activity);
    setCompleted(null);
    let result: GameResult;
    try {
      result = await invoke();
    } catch {
      result = { status: 'error', code: 'unavailable' };
    }
    await refresh();
    if (activity.action === 'play' && cancelRequest.current) {
      const stopResult = await cancelRequest.current;
      if (stopResult.status === 'done') result = { status: 'cancelled' };
      await refresh();
    }
    current.current = null;
    cancelRequest.current = null;
    setCancellingPreview(false);
    setPending(null);
    setCompleted({ ...activity, result });
    return result;
  }, [api, refresh]);

  const stoppedOnLeave = useRef<string | null>(null);
  useEffect(() => {
    if (!libraryVisible && pending?.action === 'play') cancelPreparing();
    if (libraryVisible || !playingId) {
      stoppedOnLeave.current = null;
    } else if (api && !pending && stoppedOnLeave.current !== playingId) {
      stoppedOnLeave.current = playingId;
      void run({action: 'stop', id: playingId}, () => api.stopGame());
    }
  }, [api, cancelPreparing, libraryVisible, pending, playingId, run]);

  return { api, snapshot, listError, pending, completed, refresh, run, cancelPreparing, cancellingPreview };
}

export function GameStatus({ studio, text, scope, copy, pendingMessage }: {
  studio: Studio; text: StudioText; scope: 'create' | 'library'; copy?: LibraryCopy; pendingMessage?: string;
}) {
  const activity = studio.pending ?? studio.completed;
  const relevant = activity && (scope === 'library' ? activity.action !== 'create' : activity.action === 'create');
  let message: string | undefined;
  let error = false;
  if (relevant && studio.pending) message = pendingMessage ?? text.pending[studio.pending.action];
  if (relevant && studio.completed) {
    const { action, result } = studio.completed;
    if (result.status === 'done') {
      message = text.completed[action];
    } else if (result.status === 'cancelled') {
      message = text.cancelled;
    } else {
      const errors: Readonly<Record<string, string>> = text.errors;
      message = (result.code === 'web-export-timeout' && copy
        ? copy.exportTimeout
        : result.code && Object.hasOwn(errors, result.code) ? errors[result.code] : undefined)
        ?? text.errors.unavailable;
      error = true;
    }
  }

  return <p
    id={scope === 'create' ? 'game-create-status' : 'game-library-status'}
    className={error ? 'game-operation-status is-error' : 'game-operation-status'}
    role="status"
  >{message}</p>;
}

function GameProjectCard({ game, studio, text, copy, language }: {
  game: GameProject; studio: Studio; text: StudioText; copy: LibraryCopy; language: Language;
}) {
  const settings = gameSettingsText[language];
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [confirmingRestore, setConfirmingRestore] = useState(false);
  const restoreButton = useRef<HTMLButtonElement>(null);
  const keepVersion = useRef<HTMLButtonElement>(null);
  const editingField = useRef<HTMLTextAreaElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const { api, pending, snapshot } = studio;
  const playing = snapshot?.playingId === game.id;
  const disabled = !api || !!pending;
  const canPlay = snapshot?.previewReady ?? snapshot?.engineReady;
  const fieldId = 'edit-game-' + game.id;

  useEffect(() => {
    if (editing) editingField.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (confirmingRestore) keepVersion.current?.focus();
  }, [confirmingRestore]);

  function closeRestore() {
    setConfirmingRestore(false);
    restoreButton.current?.focus();
  }

  async function restorePrevious() {
    if (!api) return;
    const result = await studio.run({action: 'restore', id: game.id}, () => api.restoreGame(game.id));
    if (result?.status === 'done') {
      setConfirmingRestore(false);
      requestAnimationFrame(() => editButton.current?.focus());
    }
  }

  function closeEditor() {
    setEditing(false);
    editButton.current?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!api || !prompt.trim()) return;
    const result = await studio.run({ action: 'update', id: game.id }, () => api.updateGame({ id: game.id, prompt: prompt.trim() }));
    if (result?.status === 'done') {
      setPrompt('');
      setEditing(false);
      requestAnimationFrame(() => editButton.current?.focus());
    }
  }

  return <article className="game-project" data-game-id={game.id} aria-label={game.title}>
    <div className="game-project-heading">
      <div>
        <h2>{game.title}</h2>
        <p>{text.starCount(game.stars)} · {text.difficulties[game.difficulty]} · {settings.themes[game.theme]} · {settings.movement[game.mobility]}</p>
      </div>
      <span className="preview-chip">{game.mode.toUpperCase()}</span>
    </div>
    <div className="game-project-actions">
      {playing ? (
        <button className="game-quiet-button game-stop" type="button" disabled={disabled} onClick={() => api && void studio.run({ action: 'stop', id: game.id }, () => api.stopGame())}>{text.stop}</button>
      ) : (
        <button
          className="primary-button game-play"
          id={'play-game-' + game.id}
          type="button"
          disabled={disabled || !canPlay || !!snapshot?.playingId}
          onClick={() => api && void studio.run({ action: 'play', id: game.id }, () => api.playGame(game.id))}
        >{text.play}</button>
      )}
      <button ref={editButton} className="game-quiet-button game-edit" type="button" disabled={disabled || playing} aria-expanded={editing}
        onClick={() => {
          setConfirmingRestore(false);
          if (editing) closeEditor();
          else setEditing(true);
        }}>{text.edit}</button>
      {game.canRestore && <button ref={restoreButton} className="game-quiet-button game-restore" type="button" disabled={disabled || playing}
        aria-expanded={confirmingRestore}
        onClick={() => {
          if (confirmingRestore) closeRestore();
          else {
            setEditing(false);
            setConfirmingRestore(true);
          }
        }}>{text.restore}</button>}
    </div>
    {confirmingRestore && game.canRestore && <div className="game-restore-confirmation">
      <strong>{copy.restoreQuestion}</strong>
      <p>{copy.restoreHelp}</p>
      <div className="game-project-actions">
        <button ref={keepVersion} className="game-quiet-button" type="button" disabled={disabled} onClick={closeRestore}>{copy.keepCurrent}</button>
        <button className="primary-button" id="confirm-game-restore" type="button" disabled={disabled || playing}
          onClick={() => void restorePrevious()}>{copy.confirmRestore}</button>
      </div>
    </div>}
    {editing && <form className="game-update-form" onSubmit={submit}>
      <label htmlFor={fieldId}>{text.editLabel}</label>
      <textarea ref={editingField} id={fieldId} className="game-update-prompt" maxLength={1000}
        value={prompt} onChange={event => setPrompt(event.target.value)} placeholder={text.editPlaceholder} disabled={disabled}/>
      <div className="game-project-actions">
        <button type="submit" className="primary-button game-update" disabled={disabled || playing || !prompt.trim()}>{text.applyEdit}</button>
        <button type="button" className="game-quiet-button" onClick={closeEditor} disabled={disabled}>{text.closeEdit}</button>
      </div>
    </form>}
  </article>;
}

function EmbeddedGame({ game, url, studio, text, copy }: { game: GameProject; url: string; studio: Studio; text: StudioText; copy: LibraryCopy }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const { api, run } = studio;
  const id = game.id;

  const stop = useCallback(async () => {
    if (api) await run({action: 'stop', id}, () => api.stopGame());
  }, [api, id, run]);

  async function retry() {
    if (!api) return;
    const stopped = await run({action: 'stop', id}, () => api.stopGame());
    if (stopped?.status === 'done') await run({action: 'play', id}, () => api.playGame(id));
  }

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const heading = title.current;
    panel.current?.scrollIntoView({block: 'start'});
    heading?.focus({preventScroll: true});

    const timer = window.setTimeout(() => setState('error'), 45_000);
    const receive = (event: MessageEvent) => {
      if (event.origin !== gameOrigin || event.source !== element.contentWindow) return;
      if (event.data?.type === 'ai-hub-game-ready') {
        window.clearTimeout(timer);
        setState('ready');
      } else if (event.data?.type === 'ai-hub-game-error') {
        window.clearTimeout(timer);
        setState('error');
      } else if (event.data?.type === 'ai-hub-game-exit') {
        void stop();
      }
    };
    window.addEventListener('message', receive);
    element.src = url;
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('message', receive);
    };
  }, [stop, url]);

  return <section id="game-preview" ref={panel} className="game-preview" data-state={state} aria-labelledby="game-preview-title">
    <div className="game-preview-header">
      <h2 id="game-preview-title" ref={title} tabIndex={-1}>{game.title}</h2>
      <div className="game-preview-controls">
        {state === 'ready' && <button className="game-quiet-button" type="button"
          onClick={() => frame.current?.focus({preventScroll: true})}>{copy.playFocus}</button>}
        <button className="game-quiet-button" id="close-game-preview" type="button" disabled={!!studio.pending}
          onClick={() => void stop()}>{text.previewClose}</button>
      </div>
    </div>
    <p className="game-preview-help" id="game-preview-controls-help">{copy.controls}</p>
    <div className="game-preview-stage">
      <iframe id="game-preview-frame" ref={frame} title={text.previewTitle(game.title)}
        sandbox="allow-scripts allow-same-origin" tabIndex={state === 'ready' ? 0 : -1}
        aria-describedby="game-preview-controls-help"
        className={state === 'ready' ? 'is-ready' : undefined}
        aria-hidden={state !== 'ready'}
        onError={() => setState('error')}/>
      {state !== 'ready' && <div className="game-preview-overlay">
        <p role="status">{state === 'error' ? text.previewLoadError : text.previewLoading}</p>
        {state === 'error' && <button className="primary-button" id="retry-game-preview" type="button"
          disabled={!!studio.pending} onClick={() => void retry()}>{text.previewRetry}</button>}
      </div>}
    </div>
    {state === 'ready' && <p className="screen-reader-game-status" role="status">{copy.ready}</p>}
  </section>;
}

export default function GameLibrary({ studio, language, empty }: { studio: Studio; language: Language; empty: ReactNode }) {
  const t = getMessages(language);
  const text = t.gameStudio;
  const copy = libraryCopy[language];
  const [query, setQuery] = useState('');
  const [format, setFormat] = useState<'all' | GameMode>('all');
  const games = studio.snapshot?.games;
  const search = query.trim().normalize('NFC').toLocaleLowerCase(language);
  const filteredGames = games?.filter(game => (format === 'all' || game.mode === format) &&
    game.title.normalize('NFC').toLocaleLowerCase(language).includes(search));
  const canPreview = studio.snapshot?.previewReady ?? studio.snapshot?.engineReady;
  const previewUrl = studio.snapshot?.previewUrl;
  const previewId = studio.snapshot?.playingId;
  const previewGame = games?.find(game => game.id === previewId);
  const recentPreview = useRef<string | null>(null);
  useEffect(() => {
    if (!previewId && recentPreview.current) {
      const returnTarget = document.getElementById('play-game-' + recentPreview.current) ??
        document.getElementById('game-title-filter');
      returnTarget?.focus();
    }
    recentPreview.current = previewId ?? null;
  }, [previewId]);
  return <section id="game-library" aria-label={t.gamesTitle}>
    <div className="library-info">
      <div>{t.librarySummary}</div>
      {games && <span>{games.length} {t.projects}</span>}
    </div>
    <GameStatus studio={studio} text={text} scope="library" copy={copy}/>
    {studio.pending?.action === 'play' && <button className="game-quiet-button game-cancel-preparing" type="button"
      id="cancel-game-preparation" disabled={studio.cancellingPreview} onClick={studio.cancelPreparing}>
      {studio.cancellingPreview ? copy.cancellingPreparation : copy.cancelPreparation}
    </button>}
    {previewGame && (previewUrl && previewPattern.test(previewUrl)
      ? <EmbeddedGame key={previewUrl} game={previewGame} url={previewUrl} studio={studio} text={text} copy={copy}/>
      : <p className="game-operation-status is-error" role="status">{text.previewLoadError}</p>)}
    {!studio.api ? <p className="game-operation-status" role="status">{text.desktopOnly}</p> : studio.listError ? (
      <div className="game-project">
        <p className="game-operation-status is-error" role="status">{text.loadError}</p>
        <button className="game-quiet-button" type="button" onClick={() => void studio.refresh()}>{text.reload}</button>
      </div>
    ) : !games ? (
      <p className="game-operation-status" role="status">{text.loading}</p>
    ) : games.length === 0 ? empty : <>
      {canPreview === false && <div className="game-engine-notice game-setup-inline">
        <span>{studio.snapshot?.engineReady ? copy.webTemplate : text.engineNotice}</span>
        <button className="game-quiet-button" type="button" disabled={!!studio.pending}
          onClick={() => void studio.refresh()}>{text.reload}</button>
      </div>}
      <div className="game-library-filter">
        <label>{copy.search}
          <input id="game-title-filter" type="search" value={query} onChange={event => setQuery(event.target.value)}/>
        </label>
        <label>{copy.mode}
          <select id="game-mode-filter" value={format} onChange={event => setFormat(event.target.value as typeof format)}>
            <option value="all">{copy.allModes}</option>
            <option value="2d">2D</option>
            <option value="3d">3D</option>
          </select>
        </label>
      </div>
      {filteredGames?.length === 0 ? <div className="game-project game-no-results">
        <p role="status">{copy.noResults}</p>
        <button className="game-quiet-button" type="button" onClick={() => { setQuery(''); setFormat('all'); }}>
          {copy.clearFilters}
        </button>
      </div> : <div className="game-project-list">
        {filteredGames?.map(game => <GameProjectCard key={game.id} game={game} studio={studio} text={text} copy={copy} language={language}/>)}
      </div>}
    </>}
  </section>;
}
