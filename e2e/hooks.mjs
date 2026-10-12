// Module resolve hook: when the app's own code imports these packages, hand
// it the e2e stand-ins instead. node_modules keep the real packages.
const SHIMS = {
    '@vercel/postgres': new URL('./shims/postgres.mjs', import.meta.url).href,
    arctic: new URL('./shims/google.mjs', import.meta.url).href,
};

export async function resolve(specifier, context, next) {
    const fromApp = context.parentURL && !context.parentURL.includes('/node_modules/');
    if (fromApp && SHIMS[specifier]) return { url: SHIMS[specifier], shortCircuit: true };
    return next(specifier, context);
}
