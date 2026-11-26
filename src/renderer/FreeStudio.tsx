import {useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent} from 'react';
import type {FreeProject, FreeProjectSummary} from '../shared/free-games';
import type {Language} from './i18n/messages';
import FreeGamePreview from './FreeGamePreview';
import './free-studio.css';

const promptLimit = 2_000;
const blankDraft = 'new';

const copy = {
  ko: {
    title: 'AI 자유 제작',
    intro: '원하는 게임의 규칙을 설명하고, 같은 창에서 플레이한 뒤 대화로 수정하세요.',
    new: '새 게임',
    saved: '저장된 자유 제작 게임',
    choose: '게임 선택',
    noSaved: '만든 게임은 이 PC에 저장돼요.',
    conversation: '제작 대화',
    emptyChat: '만들고 싶은 게임을 한 문장으로 말해 보세요.',
    firstLabel: '만들 게임 설명',
    editLabel: '바꾸고 싶은 점',
    firstExample: '예: 바람 방향이 계속 바뀌는 섬에서 종이비행기를 조종해 편지를 배달하는 게임',
    editExample: '예: 키 조작을 더 쉽게 하고, 배달을 세 번 끝내면 마지막 목적지가 열리게 해 줘.',
    create: '게임 만들기',
    edit: '수정 요청 보내기',
    cancel: '중지',
    preview: '게임 플레이',
    emptyPreview: '게임이 준비되면 여기에서 플레이할 수 있어요.',
    restore: '이전 버전 복원',
    export: 'HTML로 저장',
    exporting: 'HTML 파일을 저장하고 있어요.',
    exported: 'HTML 파일을 저장했습니다.',
    confirmRestore: '직전 버전으로 돌아갈까요?',
    keep: '현재 버전 유지',
    you: '나',
    ai: '제작 AI',
    prepare: '로컬 AI 준비',
    recheck: '다시 확인',
    checking: 'Ollama와 모델을 확인하고 있어요.',
    offline: 'Ollama를 실행해 주세요. 저장된 게임은 계속 플레이할 수 있어요.',
    unavailable: '로컬 AI의 준비 상태를 확인하지 못했습니다.',
    needsModel: '자유 제작에 사용할 Ollama 모델을 먼저 준비해 주세요.',
    desktop: 'Windows 데스크톱 앱에서 자유 제작을 이용할 수 있어요.',
    loadError: '저장된 게임 목록을 불러오지 못했습니다.',
    candidateError: '생성한 게임이 실행되지 않았어요.',
    candidateCanRepair: '생성한 게임이 실행되지 않았어요. 실행 오류 수정 요청을 눌러 코드를 고칠 수 있어요.',
    unchangedDraft: 'AI가 실행되지 않은 코드를 다시 보냈어요. 게임 만들기를 누르면 새 코드를 요청해요.',
    retry: '다시 불러오기',
    idle: '',
    loading: '게임을 여는 중입니다.',
    generating: '로컬 AI가 게임 코드를 작성하고 있어요. 모델과 게임에 따라 시간이 걸릴 수 있어요.',
    repairing: '로컬 AI가 실행에 실패한 코드를 수정하고 있어요.',
    repair: '실행 오류 수정 요청',
    verifying: '새 버전을 실행해 게임 화면이 표시되는지 확인하고 있어요.',
    saving: '실행이 확인된 버전을 이 PC에 저장하고 있어요.',
    estimatedProgress: '예상 진행률',
    restoring: '이전 버전을 복원하고 있어요.',
    stopping: '작업을 중지하고 있어요.',
    cancelled: '작업을 중지했습니다.',
    done: '게임을 저장했습니다.',
    savedWithPreviewError: '게임은 저장됐지만 플레이가 중단됐습니다. 다시 시작하거나 수정을 요청해 주세요.',
    restored: '이전 버전으로 복원했습니다.',
    error: '작업을 끝내지 못했습니다. 다시 시도해 주세요.',
    errors: {
      'invalid-request': '요청을 1자 이상 2,000자 이하로 적어 주세요.',
      'invalid-model': '지원되는 로컬 AI 모델을 준비해 주세요.',
      'needs-model': '지원되는 로컬 AI 모델을 먼저 설치해 주세요.',
      'not-installed': '선택한 로컬 AI 모델이 설치돼 있는지 확인해 주세요.',
      'model-conflict': '준비된 모델이 앱의 지원 모델과 일치하는지 확인해 주세요.',
      unavailable: 'Ollama에 연결하지 못했습니다. 실행 상태를 확인해 주세요.',
      busy: '다른 AI 작업이 실행 중이에요. 끝난 뒤 다시 시도해 주세요.',
      timeout: 'AI가 제한 시간 안에 게임을 만들지 못했습니다. 핵심 규칙 한두 개부터 요청해 보세요.',
      'response-limit': '코드가 허용 길이를 넘었습니다. 더 작은 게임으로 시작해 보세요.',
      'build-invalid': '실행할 수 있는 게임 코드를 받지 못했습니다. 요청을 짧게 하거나 다시 시도해 주세요.',
      'build-unchanged': 'AI가 실질적인 변경을 만들지 못해 기존 버전을 유지했습니다. 바뀌어야 할 동작을 적어 다시 요청해 주세요.',
      'not-found': '저장된 게임을 찾지 못했습니다. 목록을 다시 불러와 주세요.',
      'storage-error': '이 PC에서 게임을 읽거나 저장하지 못했습니다. 다시 시도해 주세요.',
      conflict: '게임의 저장 상태가 바뀌었습니다. 게임을 다시 열어 주세요.',
      expired: '만들어진 작업이 만료되었습니다. 다시 요청해 주세요.',
      'invalid-export-path': '파일 이름을 .html로 끝내 주세요.',
    },
  },
  en: {
    title: 'Create freely with AI',
    intro: 'Describe the rules you want, play in this window, then ask for changes.',
    new: 'New game',
    saved: 'Saved original games',
    choose: 'Choose a game',
    noSaved: 'Games you make are saved on this PC.',
    conversation: 'Game development conversation',
    emptyChat: 'Tell the AI what game you want to make in one sentence.',
    firstLabel: 'Describe the game',
    editLabel: 'What should change?',
    firstExample: 'For example: Steer a paper plane around an island with shifting winds to deliver letters.',
    editExample: 'For example: Make it easier to steer and unlock a final destination after three deliveries.',
    create: 'Build game',
    edit: 'Send change request',
    cancel: 'Stop',
    preview: 'Play your game',
    emptyPreview: 'When the game is ready, you can play it here.',
    restore: 'Restore previous version',
    export: 'Save as HTML',
    exporting: 'Saving the HTML file.',
    exported: 'HTML file saved.',
    confirmRestore: 'Return to the previous version?',
    keep: 'Keep current version',
    you: 'You',
    ai: 'Game AI',
    prepare: 'Set up local AI',
    recheck: 'Check again',
    checking: 'Checking Ollama and installed models.',
    offline: 'Start Ollama to build new games. You can still play your saved games.',
    unavailable: 'Could not check your local AI setup.',
    needsModel: 'Prepare an Ollama model to build a game.',
    desktop: 'Open the Windows desktop app to build games freely.',
    loadError: 'Could not load saved games.',
    candidateError: 'The generated game could not start.',
    candidateCanRepair: 'The generated game could not start. Use Ask AI to fix startup to try repairing the code.',
    unchangedDraft: 'The AI repeated the code that failed to start. Choose Build game to request a fresh draft.',
    retry: 'Reload',
    idle: '',
    loading: 'Opening game.',
    generating: 'The local AI is writing your game code. This can take a while depending on the model and game.',
    repairing: 'The local AI is repairing the code that failed to start.',
    repair: 'Ask AI to fix startup',
    verifying: 'Checking that the new version draws its game screen.',
    saving: 'Saving the verified version on this PC.',
    estimatedProgress: 'Estimated progress',
    restoring: 'Restoring the previous version.',
    stopping: 'Stopping.',
    cancelled: 'Operation stopped.',
    done: 'Game saved.',
    savedWithPreviewError: 'The game was saved, but playback stopped. Restart or ask for a fix.',
    restored: 'Previous version restored.',
    error: 'The operation could not finish. Try again.',
    errors: {
      'invalid-request': 'Enter a request between 1 and 2,000 characters.',
      'invalid-model': 'Prepare a supported local AI model.',
      'needs-model': 'Install a supported local AI model first.',
      'not-installed': 'Check that the selected local AI model is installed.',
      'model-conflict': 'Check that the installed model matches a supported model.',
      unavailable: 'Could not connect to Ollama. Check that it is running.',
      busy: 'Another AI operation is running. Try again after it finishes.',
      timeout: 'The AI could not finish in time. Start with one or two core rules.',
      'response-limit': 'The generated code was too long. Start with a smaller game.',
      'build-invalid': 'The AI did not return playable code. Shorten your request or try again.',
      'build-unchanged': 'The AI returned no meaningful change. Your current game was kept. Describe the behavior that should change and try again.',
      'not-found': 'Could not find the saved game. Reload the list.',
      'storage-error': 'Could not read or save the game on this PC. Try again.',
      conflict: 'The saved game changed. Open it again before making changes.',
      expired: 'The draft expired. Send your request again.',
      'invalid-export-path': 'Use a file name ending in .html.',
    },
  },
} as const;

type Stage = 'idle' | 'loading' | 'generating' | 'repairing' | 'verifying' | 'saving' | 'restoring' | 'stopping' | 'exporting';
type Readiness = 'checking' | 'ready' | 'offline' | 'needsModel' | 'unavailable';
type Status = 'cancelled' | 'done' | 'restored' | 'candidateError' | 'savedWithPreviewError' | 'exported';
type Preview = {key: string; title: string; code: string};
type Generation = {
  id: string;
  previous: FreeProject | null;
  draftKey: string;
  prompt: string;
  phase: 'generating' | 'verifying' | 'saving';
  token?: string;
  cancelRequested?: boolean;
  playbackStopped?: boolean;
};

function savedPreview(game: FreeProject): Preview {
  return {key: crypto.randomUUID(), code: game.code, title: game.title};
}

export default function FreeStudio({language, visible, onOpenAi}: {
  language: Language;
  visible: boolean;
  onOpenAi: () => void;
}) {
  const t = copy[language];
  const api = typeof window.hub?.listFreeProjects === 'function' ? window.hub : undefined;
  const [games, setGames] = useState<FreeProjectSummary[]>([]);
  const [listError, setListError] = useState(false);
  const [readiness, setReadiness] = useState<Readiness>('checking');
  const [project, setProject] = useState<FreeProject | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<Status | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const compose = useRef<HTMLTextAreaElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const restoreButton = useRef<HTMLButtonElement>(null);
  const transcript = useRef<HTMLOListElement>(null);
  const generation = useRef<Generation | null>(null);
  const failedDraft = useRef<{token: string; draftKey: string; prompt: string} | null>(null);
  const listSequence = useRef(0);
  const setupSequence = useRef(0);
  const projectOperation = useRef<symbol | null>(null);

  const draftKey = project?.id ?? blankDraft;
  const draft = drafts[draftKey] ?? '';
  const busy = stage !== 'idle';
  const canGenerate = Boolean(api && (readiness === 'ready' || readiness === 'unavailable'));

  const refreshList = useCallback(async () => {
    if (!api) return;
    const sequence = ++listSequence.current;
    setListError(false);
    try {
      const list = await api.listFreeProjects();
      if (sequence === listSequence.current) setGames(list);
    } catch {
      if (sequence === listSequence.current) setListError(true);
    }
  }, [api]);

  const inspectAi = useCallback(async () => {
    if (!api) return;
    const sequence = ++setupSequence.current;
    setReadiness('checking');
    try {
      const response = await api.getAiEnvironment();
      if (sequence !== setupSequence.current) return;
      setReadiness(response.runtime !== 'ready' ? 'offline'
        : response.models.some(model => model.installed) ? 'ready' : 'needsModel');
    } catch {
      if (sequence === setupSequence.current) setReadiness('unavailable');
    }
  }, [api]);

  useEffect(() => {
    if (!visible || !api) return;
    void refreshList();
    void inspectAi();
  }, [api, inspectAi, refreshList, visible]);

  useEffect(() => {
    return () => {
      const failed = failedDraft.current;
      failedDraft.current = null;
      if (failed) void api?.discardFreeGame(failed.token).catch(() => {});
      const work = generation.current;
      if (!work || work.phase === 'saving') return;
      generation.current = null;
      if (work.token) void api?.discardFreeGame(work.token).catch(() => {});
      else void api?.cancelAiOperation(work.id).catch(() => {});
    };
  }, [api]);

  useEffect(() => {
    if (stage === 'generating' || stage === 'repairing') {
      setProgress(5);
      let current = 5;
      const timer = setInterval(() => {
        current = Math.min(70, current + 5);
        setProgress(current);
      }, 2_000);
      return () => clearInterval(timer);
    }
    const stageProgress: Partial<Record<Stage, number>> = {
      loading: 15, verifying: 80, saving: 95, restoring: 70, stopping: 99, exporting: 70,
    };
    setProgress(stageProgress[stage] ?? 0);
  }, [stage]);

  useEffect(() => {
    if (!visible) return;
    const work = generation.current;
    if (work && stage === 'idle') setStage(work.phase);
  }, [stage, visible]);

  useEffect(() => {
    if (visible) return;
    listSequence.current += 1;
    setupSequence.current += 1;
  }, [visible]);

  useEffect(() => {
    if (confirmRestore) keepButton.current?.focus();
  }, [confirmRestore]);

  useEffect(() => {
    const area = transcript.current;
    if (visible && area) area.scrollTop = area.scrollHeight;
  }, [project?.turns, visible]);

  function clearActivity() {
    setErrorCode(null);
    setStatus(null);
    setConfirmRestore(false);
  }

  function releaseFailedDraft() {
    const failed = failedDraft.current;
    failedDraft.current = null;
    if (failed) void api?.discardFreeGame(failed.token).catch(() => {});
  }

  function setWorkingGame(game: FreeProject | null) {
    setProject(game);
    setPreview(game && savedPreview(game));
  }

  function recordGame(game: FreeProject) {
    const {id, title, updatedAt, canRestore} = game;
    listSequence.current += 1;
    setListError(false);
    setGames(current => [{id, title, updatedAt, canRestore}, ...current.filter(item => item.id !== id)]);
  }

  function startBlank() {
    if (generation.current || projectOperation.current) return;
    releaseFailedDraft();
    clearActivity();
    setWorkingGame(null);
    compose.current?.focus();
  }

  async function openGame(id: string, restore = false) {
    if (!api || generation.current || projectOperation.current) return;
    if (!id) {
      startBlank();
      return;
    }
    if (project?.id === id && !restore) return;
    releaseFailedDraft();
    const operation = Symbol();
    projectOperation.current = operation;
    clearActivity();
    setStage(restore ? 'restoring' : 'loading');
    try {
      const result = await (restore ? api.restoreFreeGame(id) : api.loadFreeProject(id));
      if (projectOperation.current !== operation) return;
      if (result.status === 'done') {
        setWorkingGame(result.project);
        if (restore) {
          recordGame(result.project);
          setStatus('restored');
        }
      } else if (result.status === 'error') {
        setErrorCode(result.code);
      }
    } catch {
      if (projectOperation.current === operation) setErrorCode('storage-error');
    } finally {
      if (projectOperation.current === operation) {
        projectOperation.current = null;
        setStage('idle');
      }
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void requestGame(draft.trim());
  }

  async function saveHtml() {
    if (!api || !project || generation.current || projectOperation.current) return;
    projectOperation.current = Symbol();
    setStage('exporting');
    try {
      const result = await api.exportFreeGame(project.id);
      if (result.status === 'done') {
        setErrorCode(null);
        setStatus('exported');
      } else if (result.status === 'error') {
        setErrorCode(result.code);
      }
    } catch {
      setErrorCode('storage-error');
    } finally {
      projectOperation.current = null;
      setStage('idle');
    }
  }

  async function requestGame(prompt: string, repairToken?: string) {
    if (!api || !canGenerate || !prompt || generation.current || projectOperation.current) return;
    if (repairToken) failedDraft.current = null;
    else releaseFailedDraft();
    const work: Generation = {id: crypto.randomUUID(), previous: project, draftKey, prompt, phase: 'generating'};
    generation.current = work;
    clearActivity();
    setStage(repairToken ? 'repairing' : 'generating');
    try {
      const result = await api.generateFreeGame({id: work.id, prompt, projectId: project?.id, repairToken});
      if (generation.current !== work) {
        if (result.status === 'done') void api.discardFreeGame(result.candidate.token).catch(() => {});
        return;
      }
      if (work.cancelRequested) {
        if (result.status === 'done') void api.discardFreeGame(result.candidate.token).catch(() => {});
        setStatus('cancelled');
      } else if (result.status === 'done') {
        const {token, title, code} = result.candidate;
        work.phase = 'verifying';
        work.token = token;
        setStage('verifying');
        setPreview({key: token, title, code});
        return;
      } else if (result.status === 'error') {
        setErrorCode(result.code);
      } else {
        setStatus('cancelled');
      }
    } catch {
      if (generation.current === work) {
        if (work.cancelRequested) setStatus('cancelled');
        else setErrorCode('unavailable');
      }
    }
    if (generation.current === work) {
      generation.current = null;
      setStage('idle');
    }
  }

  function onDraftKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey ||
        event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    if (!busy && canGenerate && draft.trim()) event.currentTarget.form?.requestSubmit();
  }

  function rejectCandidate(work: Generation, retainForRepair = false) {
    generation.current = null;
    if (work.token) {
      if (retainForRepair) failedDraft.current = {token: work.token, draftKey: work.draftKey, prompt: work.prompt};
      else void api?.discardFreeGame(work.token).catch(() => {});
    }
    setWorkingGame(work.previous);
    setStage('idle');
  }

  async function stop() {
    const work = generation.current;
    if (!api || !work) return;
    if (work.phase === 'verifying') {
      rejectCandidate(work);
      setStatus('cancelled');
      return;
    }
    if (work.phase !== 'generating' || work.cancelRequested) return;
    work.cancelRequested = true;
    setStage('stopping');
    try {
      await api.cancelAiOperation(work.id);
    } catch {
      // A candidate that races the stop request is discarded when generation returns.
    }
  }

  async function onPreviewReady(key: string) {
    const work = generation.current;
    if (!api || !work || work.phase !== 'verifying' || work.token !== key) {
      setStatus(current => current === 'savedWithPreviewError' ? 'done' : current);
      return;
    }
    work.phase = 'saving';
    setStage('saving');
    try {
      const result = await api.commitFreeGame(key);
      if (generation.current !== work) return;
      if (result.status === 'done') {
        setProject(result.project);
        recordGame(result.project);
        setDrafts(current => {
          const next = {...current};
          delete next[work.draftKey];
          return next;
        });
        setStatus(work.playbackStopped ? 'savedWithPreviewError' : 'done');
      } else {
        setErrorCode(result.status === 'error' ? result.code : 'storage-error');
        rejectCandidate(work);
      }
    } catch {
      if (generation.current !== work) return;
      setErrorCode('storage-error');
      rejectCandidate(work);
    }
    if (generation.current === work) {
      generation.current = null;
      setStage('idle');
    }
  }

  function onPreviewError(key: string) {
    const work = generation.current;
    if (!work || work.token !== key) return;
    if (work.phase === 'verifying') {
      rejectCandidate(work, true);
      setStatus('candidateError');
    } else if (work.phase === 'saving') {
      work.playbackStopped = true;
    }
  }

  if (!visible) return null;
  const knownErrors: Readonly<Record<string, string>> = t.errors;
  const failed = failedDraft.current;
  const canRepair = failed && failed.draftKey === draftKey && failed.prompt === draft.trim() && status === 'candidateError';
  const errorText = errorCode === 'build-unchanged' && !project ? t.unchangedDraft
    : errorCode && Object.hasOwn(knownErrors, errorCode) ? knownErrors[errorCode] : t.error;
  const activity = busy ? t[stage] : errorCode ? errorText : canRepair ? t.candidateCanRepair : status ? t[status] : '';
  const activityError = Boolean(errorCode || status === 'candidateError' || status === 'savedWithPreviewError');

  return (
    <section className="free-studio" id="free-studio" aria-labelledby="free-studio-title">
      <header className="free-studio-heading">
        <div>
          <h1 id="free-studio-title" tabIndex={-1}>{t.title}</h1>
          <p>{t.intro}</p>
        </div>
      </header>

      <div className="free-studio-toolbar">
        <button type="button" id="free-new-game" className="game-quiet-button" disabled={busy} onClick={startBlank}>{t.new}</button>
        <label className="free-project-selector" htmlFor="free-project-select">
          {t.saved}
          <select id="free-project-select" disabled={!api || busy || games.length === 0} value={project?.id ?? ''}
            onChange={event => void openGame(event.target.value)}>
            <option value="">{t.choose}</option>
            {games.map(game => <option key={game.id} value={game.id}>{game.title}</option>)}
          </select>
        </label>
        {api && games.length === 0 && !listError && <p>{t.noSaved}</p>}
        {project?.canRestore && (
          <button type="button" id="free-restore-game" className="game-quiet-button" ref={restoreButton}
            disabled={busy || confirmRestore} onClick={() => setConfirmRestore(true)}>{t.restore}</button>
        )}
        {project && <button type="button" id="free-export-game" className="game-quiet-button"
          disabled={busy || confirmRestore} onClick={() => void saveHtml()}>{t.export}</button>}
      </div>
      {listError && <div className="free-studio-notice">
        <p role="alert">{t.loadError}</p>
        <button type="button" className="game-quiet-button" disabled={busy} onClick={() => void refreshList()}>{t.retry}</button>
      </div>}
      {confirmRestore && project && (
        <div className="free-studio-notice" role="group" aria-label={t.confirmRestore}>
          <p>{t.confirmRestore}</p>
          <button type="button" id="free-confirm-restore" className="game-quiet-button"
            onClick={() => void openGame(project.id, true)}>{t.restore}</button>
          <button type="button" className="game-quiet-button" ref={keepButton} onClick={() => {
            setConfirmRestore(false);
            requestAnimationFrame(() => restoreButton.current?.focus());
          }}>{t.keep}</button>
        </div>
      )}
      {(!api || readiness !== 'ready') && (
        <div className="free-studio-notice">
          <p role="status">{api ? t[readiness === 'ready' ? 'checking' : readiness] : t.desktop}</p>
          {api && readiness !== 'checking' && <>
            <button type="button" className="game-quiet-button" onClick={onOpenAi}>{t.prepare}</button>
            <button type="button" id="free-recheck-ai" className="game-quiet-button" onClick={() => void inspectAi()}>{t.recheck}</button>
          </>}
        </div>
      )}

      <div className="free-studio-workspace">
        <section className="free-studio-panel free-dialogue" aria-labelledby="free-dialogue-title">
          <h2 id="free-dialogue-title">{t.conversation}</h2>
          {!project?.turns.length && <p className="free-studio-help">{t.emptyChat}</p>}
          {Boolean(project?.turns.length) && (
            <ol className="free-transcript" ref={transcript} tabIndex={0} aria-labelledby="free-dialogue-title">
              {project?.turns.map((turn, index) => (
                <li key={index}>
                  <p className="free-turn-user"><strong>{t.you}</strong>{turn.prompt}</p>
                  <p className="free-turn-assistant"><strong>{t.ai}</strong>{turn.summary}</p>
                </li>
              ))}
            </ol>
          )}
          <form className="free-compose" onSubmit={event => void submit(event)}>
            <div className="free-compose-header">
              <label htmlFor="free-game-prompt">{project ? t.editLabel : t.firstLabel}</label>
              <span>{draft.length} / {promptLimit}</span>
            </div>
            <textarea id="free-game-prompt" ref={compose} maxLength={promptLimit} value={draft}
              disabled={busy || !api} placeholder={project ? t.editExample : t.firstExample}
              onChange={event => {
                const value = event.target.value;
                setDrafts(current => ({...current, [draftKey]: value}));
              }} onKeyDown={onDraftKeyDown}/>
            <div className="free-compose-actions">
              <button type="submit" id="free-generate-game" className="primary-button"
                disabled={busy || !canGenerate || !draft.trim()}>{project ? t.edit : t.create}</button>
              {canRepair && <button type="button" id="free-repair-game" className="game-quiet-button"
                disabled={busy || !canGenerate} onClick={() => void requestGame(failed.prompt, failed.token)}>{t.repair}</button>}
              {(stage === 'generating' || stage === 'repairing' || stage === 'verifying' || stage === 'stopping') && (
                <button type="button" id="free-cancel-game" className="game-quiet-button" disabled={stage === 'stopping'}
                  onClick={() => void stop()}>{t.cancel}</button>
              )}
            </div>
          </form>
          <p role="status" className="free-studio-status" id="free-game-status" data-stage={stage}
            data-error={activityError}>{activity}</p>
          {busy && (
            <div className="free-generation-progress" role="progressbar" aria-label={t.estimatedProgress}
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
              <div className="free-generation-progress-track"><span style={{width: progress + '%'}}/></div>
              <strong>{t.estimatedProgress} {progress}%</strong>
            </div>
          )}
        </section>

        <section className="free-studio-panel free-play-panel" aria-labelledby="free-play-title">
          <h2 id="free-play-title">{preview?.title ?? t.preview}</h2>
          {preview ? (
            <div inert={stage === 'verifying' || stage === 'saving'}>
              <FreeGamePreview key={preview.key} code={preview.code} title={preview.title} language={language}
                onReady={() => void onPreviewReady(preview.key)} onError={() => onPreviewError(preview.key)}/>
            </div>
          ) : <div className="free-studio-empty-preview"><p>{t.emptyPreview}</p></div>}
        </section>
      </div>
    </section>
  );
}
