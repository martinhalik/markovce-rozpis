// Stand-in for arctic's Google OAuth client. "Google" is the e2e server's
// /__e2e/google page, where the test types an email address; that address
// comes back as the authorization code and becomes the ID token's claims.
// Everything after the redirect (state check, user upsert, auto-join,
// session cookie) is the real api/auth/callback.js.
export const generateState = () => Math.random().toString(36).slice(2);
export const generateCodeVerifier = () => 'e2e-verifier';

export const decodeIdToken = (email) => ({
    sub: `e2e-${email}`,
    email,
    email_verified: true,
    name: email.split('@')[0],
});

export class Google {
    constructor(clientId, clientSecret, redirectURI) {
        this.redirectURI = redirectURI;
    }

    createAuthorizationURL(state) {
        const url = new URL('/__e2e/google', this.redirectURI);
        url.searchParams.set('state', state);
        return url;
    }

    async validateAuthorizationCode(code) {
        return { idToken: () => code };
    }
}
