/// <reference types="vite/client" />
import type { HubApi } from '../shared/ai';

declare global {
  interface Window {
    hub?: HubApi;
  }
}
