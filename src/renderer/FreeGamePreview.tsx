import {useEffect, useRef, useState} from 'react';
import type {Language} from './i18n/messages';
import './free-game-preview.css';

const previewUrl = 'hub-free://play/index.html';
const setupDeadline = 8_000;
const strings = {
  ko: {
    focus: '게임에 키보드 포커스', restart: '게임 다시 시작',
    loading: '게임을 실행하고 있습니다.', ready: '미리보기가 열렸습니다.',
    inputHelp: '게임 화면을 클릭하거나 포커스 버튼을 눌러 조작을 확인하세요.',
    focused: '키보드 입력이 게임으로 전달됩니다. Esc로 게임 조작을 벗어날 수 있습니다.',
    error: '게임 실행이 중단됐습니다. 다시 시작하거나 AI에게 수정을 요청해 주세요.',
  },
  en: {
    focus: 'Focus the game', restart: 'Restart game',
    loading: 'Starting the game.', ready: 'The preview is open.',
    inputHelp: 'Click the game or use the focus button to try its controls.',
    focused: 'Keyboard input goes to the game. Press Esc to return to the controls.',
    error: 'The game stopped running. Restart it or ask AI for a fix.',
  },
} as const;

type PreviewProps = {
  code: string;
  title: string;
  language: Language;
  onReady: () => void;
  onError: () => void;
};

function PreviewRun({code, title, language, onReady, onError, restart}: PreviewProps & {restart: () => void}) {
  const copy = strings[language];
  const iframe = useRef<HTMLIFrameElement>(null);
  const focusButton = useRef<HTMLButtonElement>(null);
  const lifecycle = useRef<{port?: MessagePort; deadline?: ReturnType<typeof setTimeout>; state: 'loading' | 'ready' | 'error'}>({
    state: 'loading',
  });
  const callbacks = useRef({onReady, onError});
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [hasKeyboardFocus, setHasKeyboardFocus] = useState(false);

  useEffect(() => { callbacks.current = {onReady, onError}; }, [onReady, onError]);
  useEffect(() => {
    const activeRun = lifecycle.current;
    if (activeRun.state === 'loading') activeRun.deadline = setTimeout(fail, setupDeadline);
    return () => {
      clearTimeout(activeRun.deadline);
      activeRun.port?.close();
      activeRun.port = undefined;
    };
  }, []);

  function fail() {
    const activeRun = lifecycle.current;
    if (activeRun.state === 'error') return;
    clearTimeout(activeRun.deadline);
    activeRun.port?.close();
    activeRun.state = 'error';
    setHasKeyboardFocus(false);
    setStatus('error');
    callbacks.current.onError();
  }

  function sendGame() {
    const activeRun = lifecycle.current;
    const target = iframe.current?.contentWindow;
    if (!target || activeRun.port || activeRun.state !== 'loading') return;
    const channel = new MessageChannel();
    activeRun.port = channel.port1;
    channel.port1.onmessage = ({data}) => {
      if (data === 'error') return fail();
      if (data === 'canvas-focused') return setHasKeyboardFocus(true);
      if (data === 'canvas-blurred') return setHasKeyboardFocus(false);
      if (data === 'leave-focus') {
        setHasKeyboardFocus(false);
        focusButton.current?.focus({preventScroll: true});
        return;
      }
      if (data !== 'ready' || activeRun.state !== 'loading') return;
      clearTimeout(activeRun.deadline);
      activeRun.state = 'ready';
      setStatus('ready');
      callbacks.current.onReady();
    };
    // A sandboxed frame has an opaque origin. Only this frame receives the private port.
    try {
      target.postMessage({type: 'hub-free:start', code}, '*', [channel.port2]);
    } catch {
      channel.port2.close();
      fail();
    }
  }

  return (
    <div className="free-game-preview" data-free-game-state={status} data-keyboard-focus={hasKeyboardFocus}>
      <div className="free-game-preview-actions">
        <button type="button" id="focus-free-game" className="game-quiet-button" ref={focusButton}
          disabled={status !== 'ready'} onClick={() => {
            iframe.current?.focus({preventScroll: true});
            lifecycle.current.port?.postMessage('focus-canvas');
          }}>{copy.focus}</button>
        <button type="button" id="restart-free-game" className="game-quiet-button" onClick={restart}>{copy.restart}</button>
      </div>
      {status !== 'error' && (
        <iframe
          id="free-game-frame"
          ref={iframe}
          src={previewUrl}
          title={title}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          onLoad={sendGame}
          onError={fail}
        />
      )}
      <p className="free-game-preview-status" role="status">
        {copy[status]} {status === 'ready' && (hasKeyboardFocus ? copy.focused : copy.inputHelp)}
      </p>
    </div>
  );
}

export default function FreeGamePreview(props: PreviewProps) {
  const [run, setRun] = useState(0);
  return <PreviewRun key={run + ':' + props.code} {...props} restart={() => setRun(count => count + 1)}/>;
}
