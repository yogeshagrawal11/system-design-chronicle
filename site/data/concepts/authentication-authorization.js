SD.concept({
  id: 'authentication-authorization',
  category: 'api',
  order: 9,
  icon: '🔐',
  title: 'Authentication & Authorization',
  tagline: 'AuthN proves who you are; AuthZ decides what you may do — sessions, JWTs, OAuth 2.0/OIDC, RBAC and ABAC.',
  summary:
    '**Authentication (AuthN)** answers *"who is this?"* — by checking a password, a passkey, an OTP or a token from a trusted identity provider. **Authorization (AuthZ)** answers *"is this identity allowed to do this action on this resource?"* Failing AuthN returns `401`; failing AuthZ returns `403`.\n\n' +
    'After the initial login, systems avoid re-checking passwords on every request by issuing a credential: either a **server-side session** (random id in a cookie, state in a store) or a **self-contained token** (a signed JWT the server can verify without a lookup).\n\n' +
    '**OAuth 2.0** is a *delegation* framework: it lets an app obtain a scoped **access token** to call an API on a user\'s behalf without seeing their password. **OpenID Connect (OIDC)** adds an **ID token** on top so the app also learns *who* logged in — this is what "Sign in with Google" is.\n\n' +
    'Authorization models range from simple **roles (RBAC)** to **attribute-based policies (ABAC)** and **relationship-based** systems like Google Zanzibar.',
  analogy:
    'A hotel. At check-in you show your passport (authentication) and receive a key card (session / token). The key card does not carry your passport, but every door reader trusts it. ' +
    'Which doors it opens — your room, the gym, but not the staff kitchen — is authorization. OAuth is the front desk issuing a limited card to a cleaner for *your* room only, for *today* only, without you handing over your own card.',
  sections: [
    {
      h: 'Sessions vs JWTs',
      md: '**Server-side session:** on login the server creates `session_id → {user_id, roles, expires}` in Redis/DB and sets `Set-Cookie: sid=...; HttpOnly; Secure; SameSite=Lax`. Each request looks up the id.\n\n' +
        '**JWT (JSON Web Token):** `base64(header).base64(payload).signature`, e.g. payload `{"sub":"u_42","scope":"orders:read","exp":1760703600}`. Any service with the issuer\'s public key verifies it locally — no shared store.\n\n' +
        'The core trade-off is **revocation vs lookup cost**: a session can be killed instantly by deleting it; a JWT is valid until it expires. The common compromise is **short-lived access tokens (5–15 min) + long-lived refresh tokens** stored server-side and revocable.',
      table: {
        headers: ['', 'Server session (opaque id)', 'JWT (self-contained)'],
        rows: [
          ['Verification', 'Store lookup per request (~1 ms Redis)', 'Signature check, no network'],
          ['Revocation / logout', 'Instant — delete the session', 'Hard — wait for `exp`, or keep a denylist (which reintroduces a lookup)'],
          ['Size', '~32 bytes', '~300 B–1 KB+ in every request'],
          ['Cross-service use', 'Needs shared store or gateway translation', 'Natural fit for microservices and third parties'],
          ['Data freshness', 'Always current', 'Claims (roles) stale until refresh'],
          ['Best for', 'Classic web apps, banking, admin', 'APIs, mobile, service-to-service, federated identity'],
        ],
      },
      callout: { type: 'warn', md: 'JWT gotchas: never accept `alg: none`; pin the expected algorithm; validate `iss`, `aud` and `exp`; do not put secrets or PII in the payload (it is only encoded, not encrypted); avoid storing tokens in `localStorage` where any XSS can read them — prefer `HttpOnly` cookies or a backend-for-frontend.' },
    },
    {
      h: 'OAuth 2.0 + OpenID Connect: the authorization code flow',
      md: 'The diagram below animates the flow every modern login uses (with **PKCE**, now recommended for all clients):\n\n' +
        '1. The app redirects the browser to the **authorization server** with `client_id`, `redirect_uri`, `scope=openid profile orders:read`, a random `state`, and `code_challenge = SHA256(code_verifier)`.\n' +
        '1. The user logs in *at the identity provider* (the app never sees the password) and consents.\n' +
        '1. The IdP redirects back with a one-time **authorization code**.\n' +
        '1. The app\'s backend exchanges code + `code_verifier` (+ client secret) for tokens over a back channel.\n' +
        '1. It receives an **ID token** (who the user is — OIDC), an **access token** (what the app may call) and a **refresh token**.\n' +
        '1. The resource API validates the access token\'s signature, `aud` and scopes on every call.\n\n' +
        'Why the extra code step? Tokens never travel through the browser URL bar or history, and PKCE ensures a stolen code is useless without the verifier. The old **implicit flow** (tokens in the URL fragment) is deprecated.',
    },
    {
      h: 'Other grant types and factors',
      md: '- **Client credentials** — machine-to-machine; a service authenticates as itself (no user).\n' +
        '- **Device code** — smart TVs and CLIs: "go to example.com/device and enter ABCD-1234".\n' +
        '- **Refresh token** — swap for a new access token; rotate on each use and detect reuse to catch theft.\n' +
        '- **MFA** — combine something you know (password), have (TOTP app, security key) and are (biometric). **Passkeys / WebAuthn** replace passwords with device-bound public-key credentials that are phishing-resistant.\n' +
        '- **Service-to-service** — mTLS certificates (SPIFFE identities in a mesh) or short-lived signed tokens; never long-lived shared API keys in code.',
    },
    {
      h: 'Authorization models: RBAC, ABAC, ReBAC',
      md: 'Once you know *who*, you need a policy for *what*:',
      table: {
        headers: ['Model', 'Rule looks like', 'Strengths', 'Weaknesses', 'Examples'],
        rows: [
          ['ACL', 'Doc 7: {alice: write, bob: read}', 'Simple, per-object', 'Hard to manage at scale', 'File systems, S3 ACLs'],
          ['RBAC', 'role `editor` → `articles:write`; alice ∈ editor', 'Easy to audit, maps to org charts', 'Role explosion for fine-grained rules', 'Kubernetes RBAC, most SaaS admin panels'],
          ['ABAC', 'allow if user.dept == doc.dept AND time < 18:00 AND device.managed', 'Very expressive, context-aware', 'Harder to reason about and audit', 'AWS IAM conditions, OPA/Rego policies'],
          ['ReBAC', 'alice can view doc 7 if she is `viewer` of its parent folder', 'Models sharing & hierarchies naturally', 'Needs a dedicated graph service', 'Google Zanzibar, SpiceDB, OpenFGA'],
        ],
      },
      callout: { md: '**Where to enforce:** do coarse checks (valid token, required scope) at the gateway, and fine-grained checks (*does this user own order 81?*) inside the service that owns the data — or via a central policy engine (OPA, Cedar, Zanzibar-style). Forgetting the object-level check is **IDOR / Broken Object Level Authorization**, the #1 item in the OWASP API Top 10.' },
    },
  ],
  diagram: {
    intro: 'OAuth 2.0 authorization code flow with PKCE and OpenID Connect. The user\'s password is only ever typed into the identity provider.',
    nodes: [
      { id: 'browser', label: 'User\'s Browser', type: 'client', col: 0, row: 1.5, desc: 'Carries redirects between the app and the IdP. Never receives the access token in this pattern (the backend keeps it).' },
      { id: 'app', label: 'Web App Backend', sub: 'OAuth client / BFF', type: 'service', col: 2, row: 0.3, desc: 'Starts the login, holds the client secret and PKCE verifier, exchanges the code for tokens and issues its own HttpOnly session cookie to the browser.' },
      { id: 'idp', label: 'Authorization Server', sub: 'IdP (OIDC)', type: 'auth', col: 2, row: 2.8, desc: 'Authenticates the user (password, MFA, passkey), records consent, and issues signed ID/access/refresh tokens. Publishes its public keys at a JWKS endpoint.', tech: ['Okta', 'Auth0', 'Cognito', 'Keycloak'] },
      { id: 'sess', label: 'Session Store', type: 'cache', col: 4, row: 0.3, desc: 'Maps the app\'s session cookie to the user and their tokens; refresh tokens stored encrypted. Logout deletes the entry.', tech: ['Redis'] },
      { id: 'api', label: 'Resource API', sub: 'orders service', type: 'service', col: 4, row: 2, desc: 'Validates the access token\'s signature (via cached JWKS), `iss`, `aud`, `exp` and scopes, then performs object-level authorization.' },
      { id: 'policy', label: 'Policy Engine', sub: 'RBAC/ABAC', type: 'auth', col: 5.6, row: 2, desc: 'Answers "can user u_42 cancel order 81?" from roles, attributes and relationships. Keeps authorization logic consistent across services.', tech: ['OPA', 'Cedar', 'SpiceDB'] },
    ],
    edges: [
      { from: 'browser', to: 'app', label: 'session cookie', both: true },
      { from: 'browser', to: 'idp', label: 'login redirect', both: true },
      { from: 'app', to: 'idp', label: 'code → tokens', curve: 0.25 },
      { from: 'app', to: 'sess' },
      { from: 'app', to: 'api', label: 'Bearer access token' },
      { from: 'api', to: 'policy', label: 'allowed?' },
    ],
    flows: [
      {
        id: 'oidc', name: 'Sign in (auth code + PKCE)',
        steps: [
          { from: 'browser', to: 'app', text: 'User clicks "Sign in". App generates `state` and a PKCE `code_verifier`, stores them, and redirects.' },
          { from: 'browser', to: 'idp', text: 'Browser lands on `/authorize?client_id=…&scope=openid orders:read&code_challenge=…&state=…`.' },
          { at: 'idp', text: 'User enters password + MFA **at the IdP** and consents to the requested scopes.' },
          { from: 'idp', to: 'browser', text: 'IdP redirects to `redirect_uri?code=AbC…&state=…` — a short-lived, one-time code.' },
          { from: 'browser', to: 'app', text: 'App checks `state` matches (CSRF protection).' },
          { from: 'app', to: 'idp', text: 'Back channel: `POST /token` with code + `code_verifier` + client secret.' },
          { from: 'idp', to: 'app', text: 'Returns ID token (JWT: who), access token (what) and refresh token.' },
          { from: 'app', to: 'sess', text: 'App validates the ID token, stores tokens server-side, sets an `HttpOnly; Secure` session cookie.' },
        ],
      },
      {
        id: 'call', name: 'Authorized API call',
        steps: [
          { from: 'browser', to: 'app', text: 'User clicks "Cancel order 81"; browser sends the session cookie.' },
          { from: 'app', to: 'sess', text: 'Session lookup yields user u_42 and their access token.' },
          { from: 'app', to: 'api', text: '`POST /orders/81/cancel` with `Authorization: Bearer <access token>`.' },
          { at: 'api', text: 'AuthN: verify JWT signature with cached JWKS, check `aud=orders-api`, `exp`, scope `orders:write`. Fail → `401`.' },
          { from: 'api', to: 'policy', text: 'AuthZ: "can u_42 cancel order 81?" — policy checks ownership and order state.' },
          { from: 'policy', to: 'api', text: 'Order belongs to u_42 and is not shipped → allow (otherwise `403`).' },
        ],
      },
    ],
  },
  keyPoints: [
    'AuthN = identity (401 on failure); AuthZ = permission (403 on failure).',
    'Sessions revoke instantly but need a lookup; JWTs verify locally but are hard to revoke.',
    'Use short-lived access tokens with rotating refresh tokens.',
    'OAuth 2.0 delegates access; OIDC adds identity (ID token). Use auth code + PKCE.',
    'Enforce object-level authorization in the service that owns the data.',
  ],
  pitfalls: [
    'Checking that a user is logged in but not that they own the resource (IDOR).',
    'Long-lived JWTs with no revocation path after a breach or role change.',
    'Using an ID token to call APIs, or accepting tokens issued for another audience.',
    'Storing passwords with fast hashes (SHA-256) instead of bcrypt/scrypt/Argon2 with salts.',
    'Rolling your own crypto or token format instead of a vetted library and IdP.',
  ],
  realWorld: [
    '**Google Zanzibar** answers trillions of ACL checks for Drive, YouTube and Photos with relationship tuples.',
    '**AWS IAM** combines RBAC-style roles with ABAC conditions on tags and request context; **Cedar** is its open policy language.',
    '**Sign in with Google / Apple / Microsoft** are all OpenID Connect providers.',
    '**Kubernetes** authenticates via certificates/OIDC tokens and authorizes with RBAC roles and bindings.',
  ],
  related: ['api-gateway', 'apis', 'http-https', 'api-design', 'stateful-vs-stateless'],
  quiz: [
    { q: 'An employee is fired and must lose access immediately. Which design makes that easiest?', options: ['24-hour JWTs with no denylist', 'Server-side sessions or short-lived access tokens with revocable refresh tokens', 'API keys embedded in the client', 'Basic auth'], answer: 1, explain: 'Deleting a session or refresh token takes effect at once; short access-token lifetimes bound the remaining window.' },
    { q: 'In OIDC, what does the ID token tell the client app?', options: ['Which APIs it may call', 'Who the user is and how/when they authenticated', 'The user\'s password hash', 'The refresh schedule'], answer: 1, explain: 'The ID token is for the client to learn identity. The access token is for calling resource APIs.' },
    { q: 'What does PKCE protect against?', options: ['XSS', 'An attacker who intercepts the authorization code using it to obtain tokens', 'SQL injection', 'Password reuse'], answer: 1, explain: 'Only the party holding the original code_verifier can redeem the code, so an intercepted code is useless.' },
    { q: 'A logged-in user changes `/orders/81` to `/orders/82` and sees someone else\'s order. What is missing?', options: ['Authentication', 'Object-level authorization check', 'Rate limiting', 'TLS'], answer: 1, explain: 'They are authenticated but the service never checked ownership — a Broken Object Level Authorization (IDOR) bug.' },
  ],
  references: [
    { title: 'OAuth 2.0 Security Best Current Practice (RFC 9700)', url: 'https://datatracker.ietf.org/doc/rfc9700/' },
    { title: 'OpenID Connect Core 1.0', url: 'https://openid.net/specs/openid-connect-core-1_0.html' },
    { title: 'Zanzibar: Google\'s Consistent, Global Authorization System', url: 'https://research.google/pubs/zanzibar-googles-consistent-global-authorization-system/' },
    { title: 'OWASP API Security Top 10', url: 'https://owasp.org/API-Security/' },
  ],
});
