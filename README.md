# Ramazzini Landing Page

The marketing site for the Ramazzini private beta. Static HTML/CSS/JS, no build
step.

```
open index.html              # in any browser
# or
python3 -m http.server 8000  # then visit http://localhost:8000
```

## Pages

- `index.html` — landing page
- `faq.html` — beta FAQ
- `privacy.html` — privacy policy

## Stack

- Plain HTML/CSS/JS (no React, no bundler, no framework)
- 5 WebGL fragment shaders for the live sage wallpapers (`shaders.js`)
- Source Sans Pro from Google Fonts
- Sage palette from `tokens.css` (shared with the rest of the Ramazzini design
  system)

## Wiring the beta sign-up flow

The **Join Beta Test** buttons open a modal with Stripe Checkout and Google
sign-in. Both currently call frontend-only stubs. See **[HANDOFF.md](./HANDOFF.md)**
for the full backend integration spec — Stripe Checkout, webhook, Google OAuth,
and the `/api/seats` endpoint that keeps the counter live.

## Getting this onto GitHub

If you haven't pushed to GitHub yet:

```bash
# from inside the project folder
git init
git add .
git commit -m "Initial commit — Ramazzini landing"

# create a new empty repo on github.com (don't add a README), then:
git remote add origin git@github.com:YOUR_ORG/ramazzini-landing.git
git branch -M main
git push -u origin main
```

Once it's up, share the repo URL with your dev team. They'll find
[HANDOFF.md](./HANDOFF.md) at the root with everything they need to wire
the payment + auth flow into your existing Ramazzini backend.

## License

© Ramazzini Software, Inc. All rights reserved.
