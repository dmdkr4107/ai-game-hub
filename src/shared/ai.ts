import type {GameConfig, GameLibrarySnapshot, GameMode, GameResult} from './games';
import type {FreeCandidate, FreeProject, FreeProjectSummary, FreeResult} from './free-games';

export interface AiModel {
  id: string;
  label: string;
  downloadBytes: number;
  license: string;
  installed: boolean;
  recommended: boolean;
}

export interface AiHardware {
  cpu: string;
  logicalCores: number;
  ramBytes: number;
  vramBytes: number | null;
  freeDiskBytes: number | null;
  modelDirectory: string;
}

export interface AiEnvironment {
  runtime: 'ready' | 'unavailable';
  hardware: AiHardware;
  models: AiModel[];
}

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type AiEvent =
  | { type: 'chatDelta'; id: string; text: string }
  | { type: 'pullProgress'; id: string; completed: number | null; total: number | null; stage: string };

export type AiResult =
  | { status: 'done' | 'cancelled' }
  | { status: 'error'; code?: string };

export type GameIdeaResult =
  | { status: 'done'; config: GameConfig }
  | { status: 'cancelled' }
  | { status: 'error'; code?: string };

export type SetupResource = 'ollama' | 'godot' | 'godot-folder';

export interface HubApi {
  getAppInfo(): Promise<{ version: string; phase: number; internalOnly: boolean }>;
  openSetupResource(kind: SetupResource): Promise<boolean>;
  getAiEnvironment(): Promise<AiEnvironment>;
  listGames(): Promise<GameLibrarySnapshot>;
  createGame(request: {mode: GameMode; prompt: string}): Promise<GameResult>;
  extractGameIdea(request: {id: string; mode: GameMode; messages: AiChatMessage[]; model: string}): Promise<GameIdeaResult>;
  createConfiguredGame(request: {mode: GameMode; config: GameConfig}): Promise<GameResult>;
  updateGame(request: {id: string; prompt: string}): Promise<GameResult>;
  restoreGame(id: string): Promise<GameResult>;
  playGame(id: string): Promise<GameResult>;
  stopGame(): Promise<GameResult>;
  listFreeProjects(): Promise<FreeProjectSummary[]>;
  loadFreeProject(id: string): Promise<FreeResult<{project: FreeProject}>>;
  generateFreeGame(request: {id: string; prompt: string; projectId?: string; repairToken?: string}): Promise<FreeResult<{candidate: FreeCandidate}>>;
  commitFreeGame(token: string): Promise<FreeResult<{project: FreeProject}>>;
  discardFreeGame(token: string): Promise<boolean>;
  restoreFreeGame(id: string): Promise<FreeResult<{project: FreeProject}>>;
  exportFreeGame(id: string): Promise<FreeResult<{fileName: string}>>;
  startAiChat(request: { id: string; model: string; messages: AiChatMessage[] }): Promise<AiResult>;
  installAiModel(request: { id: string; model: string; consent: boolean }): Promise<AiResult>;
  cancelAiOperation(id: string): Promise<boolean>;
  onAiEvent(handler: (event: AiEvent) => void): () => void;
}
