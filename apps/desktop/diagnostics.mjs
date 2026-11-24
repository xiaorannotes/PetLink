import {redact} from './chat.mjs';
// Keep a strict allow-list: chat history and settings never enter the export.
export function diagnostics(hub,apiKey){const {aggregate,sessions,typing}=hub.store.snapshot();return redact({port:hub.port,aggregate,sessions,typing,chat:{apiKey:'***'},log:hub.store.log},[apiKey]);}
