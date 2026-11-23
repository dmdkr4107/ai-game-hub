import type {GameConfig} from '../shared/games';
import type {Language} from './i18n/messages';
import './game-settings.css';

export const gameSettingsText = {
  ko: {
    manual: '직접 설정', prompt: '문장으로 만들기', chat: '채팅에서 가져온 설정', form: '게임 설정',
    title: '제목', stars: '모을 별', difficulty: '난이도', theme: '배경 테마', mobility: '이동과 점프',
    difficulties: {easy: '쉬움', normal: '보통', hard: '어려움'},
    themes: {night: '밤하늘', forest: '숲', space: '우주'},
    movement: {steady: '느린 이동', standard: '기본 이동', swift: '빠른 이동과 높은 점프'},
    extractBusy: '대화에서 게임 설정을 정리하고 있습니다.',
    extractError: '대화에서 설정을 가져오지 못했습니다. 다시 시도하거나 제작 화면에서 직접 설정해 주세요.',
    extractAction: '설정 정리 중지',
    extracted: '대화에서 가져온 설정입니다. 2D·3D와 아래 설정을 확인하거나 수정한 뒤 게임을 만드세요.',
    save: '이 설정으로 만들기', building: '게임을 만들고 검증하고 있습니다.',
  },
  en: {
    manual: 'Set options directly', prompt: 'Describe a game', chat: 'Options from chat', form: 'Game options',
    title: 'Title', stars: 'Stars to collect', difficulty: 'Difficulty', theme: 'Theme', mobility: 'Movement and jumping',
    difficulties: {easy: 'Easy', normal: 'Normal', hard: 'Hard'},
    themes: {night: 'Night sky', forest: 'Forest', space: 'Space'},
    movement: {steady: 'Slower movement', standard: 'Standard movement', swift: 'Faster movement and higher jumps'},
    extractBusy: 'Extracting game options from the conversation.',
    extractError: 'Game options could not be extracted. Try again or set the options directly in the game studio.',
    extractAction: 'Stop extracting options',
    extracted: 'Options from your conversation. Review or change the format and settings before creating your game.',
    save: 'Create with these options', building: 'Building and verifying your game.',
  },
} as const;

export function GameSettings({config, language, disabled, onChange}: {
  config: GameConfig;
  language: Language;
  disabled: boolean;
  onChange: (config: GameConfig) => void;
}) {
  const t = gameSettingsText[language];
  const choices = [
    {key: 'difficulty', label: t.difficulty, items: t.difficulties},
    {key: 'theme', label: t.theme, items: t.themes},
    {key: 'mobility', label: t.mobility, items: t.movement},
  ] as const;
  return (
    <fieldset className="game-settings" disabled={disabled}>
      <legend>{t.form}</legend>
      <label className="game-settings-title" htmlFor="configured-game-title">
        {t.title}
        <input id="configured-game-title" value={config.title} maxLength={80} required
          onChange={event => onChange({...config, title: event.target.value})}/>
      </label>
      <label htmlFor="configured-game-stars">
        {t.stars}
        <select id="configured-game-stars" value={config.stars}
          onChange={event => onChange({...config, stars: Number(event.target.value)})}>
          {Array.from({length: 8}, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
        </select>
      </label>
      {choices.map(({key, label, items}) => (
        <label key={key} htmlFor={'configured-game-' + key}>
          {label}
          <select id={'configured-game-' + key} value={config[key]}
            onChange={event => {
              const value = event.target.value;
              if (Object.hasOwn(items, value)) onChange({...config, [key]: value});
            }}>
            {Object.entries(items).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
          </select>
        </label>
      ))}
    </fieldset>
  );
}
