export type GameMode = '2d' | '3d';
export type GameTheme = 'night' | 'forest' | 'space';
export type GameMobility = 'steady' | 'standard' | 'swift';

export interface GameConfig {
  title: string;
  stars: number;
  difficulty: 'easy' | 'normal' | 'hard';
  theme: GameTheme;
  mobility: GameMobility;
}

export interface GameProject extends GameConfig {
  id: string;
  mode: GameMode;
  canRestore: boolean;
}

export interface GameLibrarySnapshot {
  games: GameProject[];
  engineReady: boolean;
  previewReady?: boolean;
  playingId: string | null;
  previewUrl?: string | null;
}

export type GameResult =
  | { status: 'done'; game?: GameProject }
  | { status: 'cancelled' }
  | { status: 'error'; code?: string };
