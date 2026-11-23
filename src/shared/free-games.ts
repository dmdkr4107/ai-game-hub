export interface FreeProjectSummary {
  id: string;
  title: string;
  updatedAt: number;
  canRestore: boolean;
}

export interface FreeProject extends FreeProjectSummary {
  code: string;
  turns: {prompt: string; summary: string}[];
}

export interface FreeCandidate {
  token: string;
  title: string;
  summary: string;
  code: string;
}

export type FreeResult<T> =
  | ({status: 'done'} & T)
  | {status: 'error'; code: string}
  | {status: 'cancelled'};
