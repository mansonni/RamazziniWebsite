# Ramazzini — Developer Handoff

This is the marketing landing page for the Ramazzini private beta. It's a static
HTML/CSS/JS site (no build step, no framework) that needs **three** backend
endpoints wired up before the **Join Beta Test** flow becomes real:

1. **Seats counter** — keep the "X of 25 seats remaining" pill live.
2. **Stripe Checkout** — charge $14.99 USD one-time for a beta seat.
3. **Google OAuth** — let buyers sign in with Google so we can attach the
   purchase to a user.

Everything else (animations, shaders, copy, layout, FAQ, privacy page) is
production-ready as-is.

---

## File map

```
index.html        ← landing page
faq.html          ← beta FAQ (linked from footer)
privacy.html      ← privacy policy
styles.css        ← all page styles
tokens.css        ← design-system color + type tokens (palette of record)
fizzy.css         ← hover-orbit particle button effect
fizzy.js          ← populates .fizzy elements with their 52 orbit dots
shaders.js        ← WebGL engine + 5 fragment shaders (sage palette)
app.js            ← page glue: shaders, scroll-driven steps, modal, counter
assets/           ← logo mark
```

The Join Beta modal markup lives at the bottom of `index.html` (`#joinModal`).
All wiring is in `app.js` under **setupJoinModal()** and the `API` constant.

---

## 1. Stripe Checkout integration

### Frontend

In `app.js`, find the `API` constant near the top:

```js
const API = {
  SEATS_ENDPOINT:       '/api/seats',
  CHECKOUT_ENDPOINT:    '/api/checkout',
  GOOGLE_AUTH_ENDPOINT: '/auth/google',
  PUBLIC_STRIPE_PRICE_ID: 'price_REPLACE_ME',
};
```

Replace `price_REPLACE_ME` with the **Stripe Price ID** for the $14.99 one-time
charge (created in your Stripe dashboard).

Inside `setupJoinModal()` find the **stripeBtn.addEventListener** block. It has
two sections marked `=== REAL IMPLEMENTATION ===` and `=== FRONTEND DEMO ===`.
**Uncomment the real one and delete the demo block** when the backend is live.

### Backend — `/api/checkout`

Anything that can call the Stripe API will do. Node example:

```js
// POST /api/checkout
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

app.post('/api/checkout', async (req, res) => {
  // Refuse new sessions when seats are gone — race-safe in your DB.
  const remaining = await db.seats.getRemaining();
  if (remaining <= 0) return res.status(410).json({ error: 'sold_out' });

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    success_url: `${process.env.PUBLIC_URL}/beta/welcome?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${process.env.PUBLIC_URL}/?canceled=1`,
    customer_email: req.body.email,        // optional: pre-fill
    metadata: { product: 'ramazzini_beta_v1' },
  });
  res.json({ url: session.url });
});
```

### Backend — Stripe webhook

This is what actually decrements the seat count. Configure
`checkout.session.completed` to hit `/api/webhooks/stripe`:

```js
app.post('/api/webhooks/stripe', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    await db.transaction(async (tx) => {
      const remaining = await tx.seats.decrementAtomic();   // returns the new value
      await tx.purchases.insert({
        stripeSessionId: session.id,
        email: session.customer_details?.email,
        amount: session.amount_total,
        createdAt: new Date(),
      });
      // TODO: send welcome email, provision beta account, link to Google sub if signed in
    });
  }
  res.json({ received: true });
});
```

### Backend — `/api/seats`

```js
app.get('/api/seats', async (_req, res) => {
  const remaining = await db.seats.getRemaining();
  res.json({ remaining });
});
```

Seed the DB with `remaining = 25` at deploy time. The frontend will poll this
every 30s (toggle on by uncommenting the `pollSeats` block at the bottom of
`app.js`).

---

## 2. Google OAuth integration

### Frontend

In `app.js`, inside `setupJoinModal()`, find the `googleBtn.addEventListener`
block. Replace the demo `console.info` with:

```js
window.location.href = API.GOOGLE_AUTH_ENDPOINT;
```

### Backend — `/auth/google` + callback

Use **Passport (passport-google-oauth20)**, **NextAuth**, **Auth.js**, or the
auth library that matches your stack. Sample shape:

```js
// GET /auth/google → redirect to Google consent
// GET /auth/google/callback → exchange code, create/get user, set session cookie,
//                              then redirect to /beta/welcome or back to home.
```

Required scopes: `openid email profile`. Store the Google `sub` on the user
record so future logins resolve to the same account.

When a paid user finishes Google sign-in, link their Google `sub` to the
existing `purchases` row (matched by email). That's how access is gated.

---

## 3. Granting beta access

After payment + Google sign-in, the user should be redirected to your **app**
(the actual Ramazzini software your team built — not this marketing site)
with a session cookie. Your existing app's auth middleware checks
`db.purchases` for `product = 'ramazzini_beta_v1'` and admits accordingly.

---

## 4. Environment variables

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PRICE_ID=price_...                 # the $14.99 one-time price
STRIPE_WEBHOOK_SECRET=whsec_...
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
PUBLIC_URL=https://ramazzini.app
DATABASE_URL=postgres://...
```

---

## 5. Race-condition note — "the 26th sale"

If two users hit checkout simultaneously when there's 1 seat left, both could
succeed. Two mitigations:

- **Atomic decrement** — `decrementAtomic()` should use a single SQL statement
  (e.g. `UPDATE seats SET remaining = remaining - 1 WHERE remaining > 0
  RETURNING remaining`).
- **In the webhook**, if the new value would be `< 0`, immediately refund the
  Stripe session via `stripe.refunds.create({ payment_intent: ... })` and email
  the buyer an apology + waitlist link. Cheap insurance.

---

## 6. Deploying

This is a static site. Any of these work:

- **Vercel / Netlify / Cloudflare Pages** — drag-drop or `git push`.
- **GitHub Pages** — fine if you don't need the API routes (host the API
  elsewhere and CORS them in).
- **Your existing infra** — drop the files behind nginx; point your API routes
  at the backend service.

For the API endpoints above (`/api/checkout`, `/api/seats`,
`/api/webhooks/stripe`, `/auth/google`), Vercel **Serverless Functions** or
**Cloudflare Workers** are the lowest-overhead options if you don't already
have a Node service.

---

## 7. Customization the team is likely to want

| What | Where |
| --- | --- |
| Change the $14.99 price | Stripe dashboard + every `.price-pill` in `index.html` + modal `.join-modal__amount` |
| Change "25 seats" | `setupCounter()` + DB seed + `.join-modal__seat-chip` markup |
| Swap hero / final-CTA wallpaper | Toggle the **Tweaks** panel in the toolbar (the value is persisted into the EDITMODE block in `app.js`) |
| Add a new shader | `shaders.js` — add a `HEAD + ...` shader and register it in the `SHADERS` map |
| New FAQ entries | `faq.html` |

---

## 8. Questions?

The marketing site was built single-file-per-concern on purpose so each piece
is editable without a toolchain. If you do introduce a bundler later, the
shape that breaks first is the inline `<script>` tags at the bottom of each
HTML file — make those module imports.

Email: `hello@ramazzini.app`
