/// <reference types="vite/client" />
interface Window { hub?: { getAppInfo: () => Promise<{version:string;phase:number;internalOnly:boolean}> }; }
