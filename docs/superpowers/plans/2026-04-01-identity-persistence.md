# Identity Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the selected family identity (e.g. "Mama", "Papa") in the server-side session so it survives browser cache clears.

**Architecture:** The identity is currently only stored in `localStorage`, which is wiped when the user clears browser cache. The fix: store identity in `req.session.identity` on the server. The 30-day session cookie survives cache clears. `GET /api/auth/status` already runs on every app load — extend it to also return the session identity. `App.tsx` reads the identity from the status response first, falls back to `localStorage` for backwards compatibility if the session is new, and writes back to the session whenever the identity is set or cleared. `localStorage` is kept as a write-through cache so the IdentityPicker state initialises fast on first render.

**Tech Stack:** TypeScript, Express, express-session (already used), React 18

---

## File Map

| File | Change |
|---|---|
| `src/api/authApi.ts` | Add `identity` to `SessionData`; add `PATCH /api/auth/identity`; return `identity` from `GET /api/auth/status` |
| `web/src/App.tsx` | Read identity from auth status; write to session on select/reset |

---

### Task 1: Backend — store identity in session

**Files:**
- Modify: `src/api/authApi.ts`

**Context:**
- The `SessionData` interface is declared in this file via `declare module 'express-session'`
- Currently only has `authenticated: boolean`
- `GET /status` currently returns `{ success, passwordRequired, authenticated }` — add `identity`
- New `PATCH /api/auth/identity` sets `req.session.identity` — body: `{ identity: string | null }`

- [ ] **Step 1: Add `identity` to SessionData and extend the status endpoint**

Find (lines 5-9):
```typescript
declare module 'express-session' {
  interface SessionData {
    authenticated: boolean;
  }
}
```
Replace with:
```typescript
declare module 'express-session' {
  interface SessionData {
    authenticated: boolean;
    identity?: string | null;
  }
}
```

Find (lines 70-76):
```typescript
router.get('/status', (req, res) => {
  res.json({
    success: true,
    passwordRequired: !!env.WEB_PASSWORD,
    authenticated: !!req.session.authenticated,
  });
});
```
Replace with:
```typescript
router.get('/status', (req, res) => {
  res.json({
    success: true,
    passwordRequired: !!env.WEB_PASSWORD,
    authenticated: !!req.session.authenticated,
    identity: req.session.identity ?? null,
  });
});
```

- [ ] **Step 2: Add `PATCH /api/auth/identity` endpoint**

Find (lines 60-64):
```typescript
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});
```
Replace with:
```typescript
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

/**
 * PATCH /api/auth/identity
 * Saves or clears the identity in the current session
 */
router.patch('/identity', requireAuth, (req, res) => {
  const { identity } = req.body as { identity?: string | null };
  if (identity !== undefined) {
    req.session.identity = identity || null;
  }
  res.json({ success: true });
});
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "/Users/cmg/Documents/Claude Test Ordner/Telegram Memory App"
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/cmg/Documents/Claude Test Ordner/Telegram Memory App"
git add src/api/authApi.ts
git commit -m "feat: persist identity in session (PATCH /auth/identity + status returns identity)"
```

---

### Task 2: Frontend — read and write identity via session

**Files:**
- Modify: `web/src/App.tsx`

**Context:**
- `identity` state is currently initialised from `localStorage` (line 16)
- `checkAuth()` calls `GET /api/auth/status` — now also returns `identity`
- `handleIdentitySelect(name)` currently only writes to localStorage — must also call `PATCH /api/auth/identity`
- `handleIdentityReset()` currently only removes from localStorage — must also call `PATCH /api/auth/identity` with null
- `API_BASE_URL` is already defined at the top of `App.tsx`
- The `identity` state initialiser from localStorage stays as a fast-path for first render (avoids flicker before `checkAuth` resolves)
- After `checkAuth`, if the session has an identity, override the localStorage value

- [ ] **Step 1: Update `checkAuth` to read identity from status response**

Find:
```typescript
  async function checkAuth() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/status`, { credentials: 'include' });
      const data = await res.json();
      setIsAuthenticated(!data.passwordRequired || data.authenticated);
    } catch {
      setIsAuthenticated(false);
    } finally {
      setCheckingAuth(false);
    }
  }
```
Replace with:
```typescript
  async function checkAuth() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/status`, { credentials: 'include' });
      const data = await res.json();
      setIsAuthenticated(!data.passwordRequired || data.authenticated);
      if (data.identity) {
        // Session has identity — use it and sync to localStorage
        localStorage.setItem('famories_identity', data.identity);
        setIdentity(data.identity);
      }
    } catch {
      setIsAuthenticated(false);
    } finally {
      setCheckingAuth(false);
    }
  }
```

- [ ] **Step 2: Update `handleIdentitySelect` to also save to session**

Find:
```typescript
  function handleIdentitySelect(name: string) {
    localStorage.setItem('famories_identity', name);
    setIdentity(name);
  }
```
Replace with:
```typescript
  function handleIdentitySelect(name: string) {
    localStorage.setItem('famories_identity', name);
    setIdentity(name);
    fetch(`${API_BASE_URL}/api/auth/identity`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ identity: name }),
    }).catch(() => {/* non-critical */});
  }
```

- [ ] **Step 3: Update `handleIdentityReset` to also clear session identity**

Find:
```typescript
  function handleIdentityReset() {
    localStorage.removeItem('famories_identity');
    setIdentity(null);
  }
```
Replace with:
```typescript
  function handleIdentityReset() {
    localStorage.removeItem('famories_identity');
    setIdentity(null);
    fetch(`${API_BASE_URL}/api/auth/identity`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ identity: null }),
    }).catch(() => {/* non-critical */});
  }
```

- [ ] **Step 4: Build frontend**

```bash
cd "/Users/cmg/Documents/Claude Test Ordner/Telegram Memory App/web"
npm run build
```

Expected: Exits 0, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
cd "/Users/cmg/Documents/Claude Test Ordner/Telegram Memory App"
git add web/src/App.tsx web/dist/
git commit -m "feat: read/write identity from session in App.tsx"
```

---

### Task 3: Smoke test checklist

Start the server (`npm run dev` in project root) and verify:

1. **Pick identity:** Open app → choose identity (e.g. "Mama") → observe home screen loads
2. **Clear cache:** Open DevTools → Application → Storage → Clear site data (check "Local Storage", leave "Cookies" checked) → reload
3. **Identity persists:** App should go directly to home screen as "Mama" — no IdentityPicker shown
4. **Reset identity:** Click the identity avatar/reset button → IdentityPicker shown again
5. **Re-pick:** Pick "Papa" → clear cache again → reload → should be "Papa"
6. **Session expiry:** DevTools → Application → Cookies → delete the session cookie → reload → IdentityPicker shown (expected: session gone = identity gone)

---

## Done

After both tasks:
- Identity survives browser cache clears (session cookie persists 30 days)
- `localStorage` kept as write-through for fast first-render init
- `PATCH /api/auth/identity` is a fire-and-forget call — failure doesn't break the UI
