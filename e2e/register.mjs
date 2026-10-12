// Preload for e2e/server.mjs: swap the two outside services for local
// stand-ins (see hooks.mjs). Never used by the deployed app.
import { register } from 'node:module';

register('./hooks.mjs', import.meta.url);
