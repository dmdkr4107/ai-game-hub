import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import type { AiChatMessage, AiEnvironment, AiEvent, AiResult } from '../shared/ai';
import { getLocalAiMessages } from './i18n/local-ai';
import type { Language } from './i18n/messages';

const maxMessage = 4_000;
const maxContext = 12_000;
const maxPreviousTurns = 5;
const maxDisplayedTurns = 30;
const maxStoredReply = 12_000;
const historyStorageKey = 'ai-game-hub:chat-history';

type Model = AiEnvironment['models'][number];
type Turn = {
  id: string;
  prompt: string;
  output: string;
  status: 'running' | AiResult['status'];
};
type Job = { id: string; kind: 'chat' | 'pull'; cancelling?: boolean };
type JobStatus = Pick<Job, 'kind'> & {
  status: 'running' | 'cancelling' | AiResult['status'];
  code?: string;
};
type DownloadProgress = Extract<AiEvent, { type: 'pullProgress' }>;
type StoredTurn = Pick<Turn, 'prompt' | 'output'>;

function hasCompletedReply(turn: Turn) {
  return turn.status === 'done' && Boolean(turn.output.trim());
}

function isStoredTurn(value: unknown): value is StoredTurn {
  return typeof value === 'object' && value !== null &&
    'prompt' in value && typeof value.prompt === 'string' && value.prompt.length <= maxMessage && Boolean(value.prompt.trim()) &&
    'output' in value && typeof value.output === 'string' && value.output.length <= maxStoredReply && Boolean(value.output.trim());
}

function readChatHistory(): Turn[] | null {
  try {
    const raw = localStorage.getItem(historyStorageKey);
    if (raw === null || raw.length > 3_000_000) return null;
    const entries: unknown = JSON.parse(raw);
    if (!Array.isArray(entries) || entries.length > maxDisplayedTurns || !entries.every(isStoredTurn)) return null;
    return entries.map(({ prompt, output }, index) => ({ id: `saved-${index}`, prompt, output, status: 'done' }));
  } catch {
    return null;
  }
}

function recentMessages(turns: Turn[], prompt = ''): AiChatMessage[] {
  const messages: AiChatMessage[] = prompt ? [{ role: 'user', content: prompt }] : [];
  let remaining = maxContext - prompt.length;
  let included = 0;
  for (let index = turns.length - 1; index >= 0 && included < maxPreviousTurns; index -= 1) {
    const turn = turns[index];
    if (!hasCompletedReply(turn)) continue;
    const output = turn.output.trim().slice(0, maxMessage);
    const length = turn.prompt.length + output.length;
    if (length > remaining) break;
    messages.unshift({ role: 'user', content: turn.prompt }, { role: 'assistant', content: output });
    included += 1;
    remaining -= length;
  }
  return messages;
}

function formatBytes(bytes: number | null, language: Language, unknown: string, estimatedDownload = false) {
  if (bytes === null) return unknown;
  const unit = estimatedDownload ? 1_000_000_000 : 1024 ** 3;
  const amount = new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(bytes / unit);
  return amount + (estimatedDownload ? ' GB' : ' GiB');
}

export default function LocalChat({ language, visible, onBack, onUseGameIdea, usingGameIdea, gameIdeaFeedback, setupOnly = false }: {
  language: Language;
  visible: boolean;
  onBack: () => void;
  onUseGameIdea?: (messages: AiChatMessage[], model: string) => void;
  usingGameIdea?: boolean;
  gameIdeaFeedback?: ReactNode;
  setupOnly?: boolean;
}) {
  const t = getLocalAiMessages(language);
  const api = typeof window.hub?.getAiEnvironment === 'function' ? window.hub : undefined;
  const [environment, setEnvironment] = useState<AiEnvironment | null>(null);
  const [checking, setChecking] = useState(Boolean(api));
  const [choice, setChoice] = useState('');
  const [draft, setDraft] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [initialHistory] = useState(() => setupOnly ? null : readChatHistory());
  const [turns, setTurns] = useState<Turn[]>(() => initialHistory ?? []);
  const [saveHistory, setSaveHistory] = useState(initialHistory !== null);
  const [historyError, setHistoryError] = useState(false);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [consentModel, setConsentModel] = useState<Model | null>(null);
  const [runtimeLinkError, setRuntimeLinkError] = useState(false);
  const pending = useRef<Job | null>(null);
  const scanSequence = useRef(0);
  const transcript = useRef<HTMLDivElement>(null);
  const consentHeading = useRef<HTMLHeadingElement>(null);
  const keepConversationButton = useRef<HTMLButtonElement>(null);
  const downloadButton = useRef<HTMLButtonElement>(null);
  const followLatest = useRef(true);

  const writeHistory = useCallback((next: Turn[] | null) => {
    try {
      if (next === null) {
        localStorage.removeItem(historyStorageKey);
      } else {
        const entries = next.filter(hasCompletedReply).map(({ prompt, output }) => ({ prompt, output }));
        localStorage.setItem(historyStorageKey, JSON.stringify(entries));
      }
      setHistoryError(false);
      return true;
    } catch {
      setHistoryError(true);
      return false;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!api) return;
    const sequence = ++scanSequence.current;
    setChecking(true);
    try {
      const response = await api.getAiEnvironment();
      if (sequence === scanSequence.current) setEnvironment(response);
    } catch {
      if (sequence === scanSequence.current) setEnvironment(null);
    } finally {
      if (sequence === scanSequence.current) setChecking(false);
    }
  }, [api]);

  useEffect(() => {
    if (!api) return;
    const unsubscribe = api.onAiEvent(event => {
      const job = pending.current;
      if (!job || job.id !== event.id) return;
      if (event.type === 'chatDelta' && job.kind === 'chat') {
        setTurns(previous => previous.map(turn => (
          turn.id === event.id ? { ...turn, output: turn.output + event.text } : turn
        )));
      } else if (event.type === 'pullProgress' && job.kind === 'pull') {
        setProgress(event);
      }
    });
    void refresh();
    return () => {
      scanSequence.current += 1;
      unsubscribe();
      const job = pending.current;
      pending.current = null;
      if (job) void api.cancelAiOperation(job.id).catch(() => {});
    };
  }, [api, refresh]);

  useEffect(() => {
    const area = transcript.current;
    if (visible && area && followLatest.current) area.scrollTop = area.scrollHeight;
  }, [turns, visible]);

  useEffect(() => {
    if (saveHistory && turns.at(-1)?.status !== 'running') writeHistory(turns);
  }, [saveHistory, turns, writeHistory]);

  useEffect(() => {
    if (consentModel) consentHeading.current?.focus();
  }, [consentModel]);

  useEffect(() => {
    if (confirmReset) keepConversationButton.current?.focus();
  }, [confirmReset]);

  const models = environment?.models ?? [];
  const recommended = models.find(model => model.recommended);
  const automatic = (setupOnly ? recommended : undefined)
    ?? models.filter(model => model.installed).at(-1)
    ?? recommended
    ?? models[0];
  const model = models.find(candidate => candidate.id === choice) ?? automatic;
  const ready = !checking && environment?.runtime === 'ready';
  const busy = jobStatus?.status === 'running' || jobStatus?.status === 'cancelling';
  const canDraft = ready && !!model?.installed;
  const canChat = canDraft && !busy && !usingGameIdea;
  const recent = turns.at(-1);
  const canRetry = recent?.status === 'error' || recent?.status === 'cancelled';
  const hasGameIdea = turns.some(hasCompletedReply);

  function begin(kind: Job['kind']) {
    if (!api || pending.current) return null;
    const job = { id: crypto.randomUUID(), kind };
    pending.current = job;
    setProgress(null);
    setJobStatus({ kind, status: 'running' });
    return job;
  }

  function finish(job: Job, result: AiResult) {
    if (pending.current?.id !== job.id) return false;
    pending.current = null;
    setJobStatus({ kind: job.kind, status: result.status, code: result.status === 'error' ? result.code : undefined });
    return true;
  }

  async function send(prompt: string, retryId?: string) {
    if (!api || !model || !canChat || !prompt) return;
    const job = begin('chat');
    if (!job) return;
    if (!retryId) setDraft('');
    followLatest.current = true;
    const messages = recentMessages(turns, prompt);
    const turn: Turn = { id: job.id, prompt, output: '', status: 'running' };
    setTurns(previous => retryId
      ? previous.map(old => old.id === retryId ? turn : old)
      : [...previous, turn].slice(-maxDisplayedTurns));

    let result: AiResult;
    try {
      result = await api.startAiChat({ id: job.id, model: model.id, messages });
    } catch {
      result = { status: 'error', code: 'unavailable' };
    }
    if (!finish(job, result)) return;
    setTurns(previous => previous.map(old => old.id === job.id ? { ...old, status: result.status } : old));
    if (result.status === 'error' && ['unavailable', 'not-installed', 'model-conflict'].includes(result.code ?? '')) {
      await refresh();
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConfirmReset(false);
    void send(draft.trim());
  }

  function onDraftKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey ||
        event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    if (canChat && draft.trim()) event.currentTarget.form?.requestSubmit();
  }

  function resetConversation() {
    if (busy) return;
    if (saveHistory && !writeHistory([])) return;
    setTurns([]);
    setJobStatus(null);
    setConfirmReset(false);
    followLatest.current = true;
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function download() {
    if (!api || !model || !consentModel || model.id !== consentModel.id || !ready || model.installed) return;
    const job = begin('pull');
    if (!job) return;
    setConsentModel(null);
    let result: AiResult;
    try {
      result = await api.installAiModel({ id: job.id, model: model.id, consent: true });
    } catch {
      result = { status: 'error', code: 'unavailable' };
    }
    if (finish(job, result)) await refresh();
  }

  async function stop() {
    const job = pending.current;
    if (!api || !job || job.cancelling) return;
    job.cancelling = true;
    setJobStatus({ kind: job.kind, status: 'cancelling' });
    let stopping = false;
    try {
      stopping = await api.cancelAiOperation(job.id);
    } catch {
      // The original promise reports the operation outcome.
    }
    if (!stopping && pending.current?.id === job.id) {
      job.cancelling = false;
      setJobStatus({ kind: job.kind, status: 'running' });
    }
  }

  async function openRuntimeDownload() {
    if (!api) return;
    try {
      setRuntimeLinkError(!(await api.openSetupResource('ollama')));
    } catch {
      setRuntimeLinkError(true);
    }
  }

  const errorMessages: Readonly<Record<string, string>> = t.errors;
  const stageMessages: Readonly<Record<string, string>> = t.stages;
  let statusText: string = t.idle;
  if (jobStatus?.status === 'error') {
    statusText = jobStatus.code && Object.hasOwn(errorMessages, jobStatus.code) ? errorMessages[jobStatus.code] : t.taskError;
  } else if (jobStatus?.status === 'running') {
    statusText = jobStatus.kind === 'chat' ? t.chatting : t.downloading;
  } else if (jobStatus?.status === 'done') {
    statusText = jobStatus.kind === 'chat' ? t.chatDone : t.pullDone;
  } else if (jobStatus?.status === 'cancelling') {
    statusText = t.cancelling;
  } else if (jobStatus?.status === 'cancelled') {
    statusText = t.cancelled;
  }

  const hardware = environment?.hardware;
  const stage = progress ? stageMessages[progress.stage] ?? t.downloading : t.stages.preparing;
  const percent = progress?.total && progress.completed !== null
    ? Math.min(100, Math.max(0, Math.round(progress.completed * 100 / progress.total)))
    : undefined;
  const downloadProgress = busy && jobStatus?.kind === 'pull' && (
    <div className="ai-download-progress">
      <label id="local-model-stage" htmlFor="local-model-progress">{stage}{percent === undefined ? '' : ' · ' + percent + '%'}</label>
      <progress id="local-model-progress" max={100} value={percent}/>
    </div>
  );
  const operationStatus = (
    <p className="ai-task-status" id="local-ai-status" role="status" data-status={jobStatus?.status ?? 'idle'}>{statusText}</p>
  );
  const cancelButton = busy && (
    <button className="ai-quiet-button" id="cancel-local-ai" type="button" disabled={jobStatus?.status === 'cancelling'}
      onClick={() => void stop()}>{t.stop}</button>
  );

  return (
    <section className="local-chat" id="local-chat" aria-labelledby="local-chat-title">
      <header className="ai-view-heading">
        <div>
          <h2 id="local-chat-title" tabIndex={-1}>{setupOnly ? t.setupTitle : t.title}</h2>
          <p>{setupOnly ? t.setupIntro : t.intro}</p>
        </div>
        <button className="ai-quiet-button" id="back-to-idea" type="button" onClick={onBack}>{t.back}</button>
      </header>

      <div className={setupOnly ? 'ai-workspace ai-workspace-setup' : 'ai-workspace'}>
        <aside className="ai-card ai-setup" aria-labelledby="local-ai-hardware">
          <div className="ai-setup-heading">
            <h3 id="local-ai-hardware">{t.hardware}</h3>
            {api && <button className="ai-quiet-button" id="refresh-local-ai" type="button" disabled={checking || busy || !!consentModel} onClick={() => void refresh()}>{t.scan}</button>}
          </div>
          <p className={'ai-runtime ' + (ready ? 'ready' : '')} role="status">
            {!api ? (setupOnly ? t.setupDesktopOnly : t.desktopOnly) : checking ? t.checking : ready ? t.connected : t.unavailable}
          </p>
          {api && !checking && !ready && <p className="ai-help">{t.installRuntime}</p>}
          {setupOnly && api && !checking && !ready && (
            <button className="ai-quiet-button" type="button" onClick={() => void openRuntimeDownload()}>
              {t.downloadRuntime}
            </button>
          )}
          {setupOnly && !ready && runtimeLinkError && <p className="ai-help" role="alert">{t.runtimeLinkError}</p>}
          {hardware && (
            <dl className="ai-specs">
              <dt>CPU</dt><dd>{hardware.cpu} · {hardware.logicalCores} {t.logicalCores}</dd>
              <dt>{t.memory}</dt><dd>{formatBytes(hardware.ramBytes, language, t.unknown)}</dd>
              <dt>{t.graphicsMemory}</dt><dd>{formatBytes(hardware.vramBytes, language, t.unknown)}</dd>
              <dt>{t.disk}</dt><dd>{formatBytes(hardware.freeDiskBytes, language, t.unknown)}</dd>
            </dl>
          )}
          {models.length > 0 && (
            <div className="ai-model-controls">
              <label htmlFor="local-ai-model">{setupOnly ? t.setupModel : t.model}</label>
              <select
                id="local-ai-model"
                value={models.some(candidate => candidate.id === choice) ? choice : ''}
                disabled={!ready || busy || usingGameIdea}
                onChange={event => {
                  setChoice(event.target.value);
                  setConsentModel(null);
                }}
              >
                <option value="">{setupOnly ? t.setupAutomatic : t.automatic}</option>
                {models.map(candidate => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.label} · {candidate.installed ? t.installed : t.notInstalled}{candidate.recommended ? " · " + t.recommended : ""}
                  </option>
                ))}
              </select>
              {model && (
                <p className="ai-model-summary">
                  {setupOnly ? t.setupSelected : t.selected} · <strong>{model.label}</strong>
                  {model.recommended && <span>{t.recommended}</span>}
                </p>
              )}
              {ready && model && !model.installed && !consentModel && (
                <button ref={downloadButton} className="ai-quiet-button" id="request-model-install" type="button" disabled={busy || usingGameIdea} onClick={() => setConsentModel(model)}>
                  {t.download}
                </button>
              )}
            </div>
          )}

          {consentModel && (
            <section className="ai-consent" id="model-download-consent" aria-labelledby="model-download-title">
              <h4 id="model-download-title" tabIndex={-1} ref={consentHeading}>{t.consentTitle}</h4>
              <p className="ai-help">{t.consentHelp}</p>
              <dl className="ai-specs">
                <dt>{setupOnly ? t.setupModel : t.model}</dt><dd>{consentModel.label}</dd>
                <dt>{t.downloadSize}</dt><dd>{formatBytes(consentModel.downloadBytes, language, t.unknown, true)}</dd>
                <dt>{t.modelDirectory}</dt><dd>{hardware?.modelDirectory || t.unknown}</dd>
                <dt>{t.license}</dt><dd>{consentModel.license}</dd>
              </dl>
              <div className="ai-controls">
                <button className="primary-button" id="confirm-model-install" type="button" disabled={!ready || busy || model?.installed} onClick={() => void download()}>{t.confirm}</button>
                <button className="ai-quiet-button" id="dismiss-model-install" type="button" onClick={() => {
                  setConsentModel(null);
                  requestAnimationFrame(() => downloadButton.current?.focus());
                }}>{t.dismiss}</button>
              </div>
            </section>
          )}
          {setupOnly && <>
            {downloadProgress}
            {cancelButton}
            {operationStatus}
          </>}
        </aside>

        {!setupOnly && <section className="ai-card ai-conversation" aria-labelledby="local-ai-transcript-title">
          <div className="chat-tools">
            <h3 id="local-ai-transcript-title">{t.transcript}</h3>
            {turns.length > 0 && !confirmReset && (
              <button className="ai-quiet-button" id="reset-local-chat" type="button" disabled={busy || usingGameIdea}
                onClick={() => setConfirmReset(true)}>{t.resetConversation}</button>
            )}
          </div>
          <label className="chat-storage" htmlFor="save-local-chat-history">
            <input id="save-local-chat-history" type="checkbox" checked={saveHistory}
              aria-describedby="local-chat-storage-help" onChange={event => {
                const checked = event.currentTarget.checked;
                if (writeHistory(checked ? turns : null)) setSaveHistory(checked);
              }}/>
            {t.saveHistory}
          </label>
          <p className="ai-help" id="local-chat-storage-help">{t.storageHelp}</p>
          {historyError && <p className="ai-help chat-storage-error" role="alert">{t.storageError}</p>}
          {confirmReset && (
            <div className="chat-reset" role="group" aria-label={t.resetQuestion}>
              <span>{t.resetQuestion}</span>
              <button className="ai-quiet-button" id="confirm-chat-reset" type="button" disabled={busy} onClick={resetConversation}>{t.resetConversation}</button>
              <button className="ai-quiet-button" ref={keepConversationButton} type="button" onClick={() => {
                setConfirmReset(false);
                requestAnimationFrame(() => document.getElementById('reset-local-chat')?.focus());
              }}>{t.keepConversation}</button>
            </div>
          )}
          <div
            ref={transcript}
            className="ai-transcript"
            id="local-chat-transcript"
            tabIndex={0}
            aria-labelledby="local-ai-transcript-title"
            onScroll={event => {
              const area = event.currentTarget;
              followLatest.current = area.scrollHeight - area.scrollTop - area.clientHeight < 32;
            }}
          >
            {turns.length === 0 && (
              <div className="ai-empty">
                <p>{t.empty}</p>
                {canDraft && <button className="ai-quiet-button" id="use-chat-example" type="button" disabled={!!draft.trim()} onClick={() => {
                  setDraft(t.examplePrompt);
                  inputRef.current?.focus();
                }}>{t.tryExample}</button>}
              </div>
            )}
            {turns.map(turn => (
              <div className="ai-turn" key={turn.id}>
                <article className="ai-message user"><strong>{t.user}</strong><p>{turn.prompt}</p></article>
                {turn.output && <article className="ai-message assistant"><strong>{t.assistant}</strong><p>{turn.output}</p></article>}
                {(turn.status === 'cancelled' || turn.status === 'error') && <p className="ai-partial">{t.partial}</p>}
              </div>
            ))}
          </div>
          {hasGameIdea && (
            <div className="chat-idea-action">
              <button className="ai-quiet-button" id="use-local-chat-idea" type="button"
                disabled={!canChat || !!consentModel || confirmReset} aria-describedby="use-local-chat-idea-help"
                onClick={() => {
                  if (model) onUseGameIdea?.(recentMessages(turns), model.id);
                }}>{usingGameIdea ? t.preparingGameIdea : t.useGameIdea}</button>
              <p className="ai-help" id="use-local-chat-idea-help">{t.useGameIdeaHelp}</p>
              {gameIdeaFeedback && <div className="chat-idea-feedback">{gameIdeaFeedback}</div>}
            </div>
          )}

          <form className="ai-compose" onSubmit={submit}>
            <label htmlFor="local-chat-prompt">{t.prompt}</label>
            <textarea
              id="local-chat-prompt"
              ref={inputRef}
              aria-describedby={canDraft ? 'local-chat-help local-chat-shortcuts' : 'local-chat-help'}
              placeholder={t.placeholder}
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={onDraftKeyDown}
              maxLength={maxMessage}
              disabled={!canDraft}
            />
            <p className="ai-help" id="local-chat-help">{ready && !model?.installed ? t.noModel : t.privacy}</p>
            {canDraft && <p className="ai-help chat-shortcuts" id="local-chat-shortcuts">{t.shortcuts}</p>}
            <div className="ai-controls">
              <button className="primary-button" id="send-local-chat" type="submit" disabled={!canChat || !draft.trim()}>{t.send}</button>
              {cancelButton}
              {canRetry && !busy && (
                <button className="ai-quiet-button" id="retry-local-chat" type="button" disabled={!canChat} onClick={() => void send(recent.prompt, recent.id)}>{t.retry}</button>
              )}
            </div>
          </form>

          {downloadProgress}
          {operationStatus}
        </section>}
      </div>
    </section>
  );
}
