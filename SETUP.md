# Ramazzini · Control panel — Setup

This site has a built-in CMS at `/admin.html`. Anyone with the shared password can edit text, images, the demo video, colors, roadmap items, FAQ entries, pricing, seat counts, and section visibility. Changes are published by committing `content.json` directly to this GitHub repo — GitHub Pages then rebuilds the site automatically (~30 seconds).

Time to set up: **about 5 minutes.**

---

## What lives where

| File | Role |
|---|---|
| `index.html` | Landing page — reads from `content.json` at load |
| `faq.html` | FAQ — reads from `content.json` |
| `content.json` | The single source of truth for editable content |
| `cms-loader.js` | Reads `content.json` and applies values to the page |
| `admin.html` / `admin.css` / `admin.js` | The control panel |

You do not edit HTML to change copy any more. Edit it from the panel.

---

## Step 1 — Change the shared password (1 min)

Open `admin.js`. Near the top:

```js
const ADMIN_PASSWORD = 'ramazzini-admin'; // ← change me
```

Replace with whatever password you want to share with editors. Commit and push. Anyone with this password and the URL can edit.

> This is **casual security** — the password sits in the JS file. Anyone who can read the file can read the password. That keeps the public out, not a determined attacker. For real security, deploy behind Cloudflare Access or similar.

---

## Step 2 — Deploy to GitHub Pages (2 min)

Already done? Skip to Step 3.

1. Push this repo to GitHub: `mansonni/RamazziniWebsite`
2. In repo settings → **Pages** → set source to "Deploy from a branch", branch `main`, folder `/ (root)`. Save.
3. Wait ~30 seconds for the first build. Your site is live at `https://mansonni.github.io/RamazziniWebsite/`.
4. The control panel is at `https://mansonni.github.io/RamazziniWebsite/admin.html`.

---

## Step 3 — Create a GitHub Personal Access Token (2 min)

The control panel writes to GitHub directly. It needs a token.

1. Visit https://github.com/settings/personal-access-tokens/new
2. Token name: `Ramazzini CMS`
3. Expiration: 1 year (or whatever)
4. Resource owner: **your account**
5. Repository access: **Only select repositories** → pick `RamazziniWebsite`
6. Permissions → **Repository permissions** → **Contents**: set to **Read and write**
7. Click "Generate token". Copy the `github_pat_...` string. **You only see it once.**

Then, in the control panel:
1. Open `/admin.html`, enter the shared password
2. Click **Settings** in the top bar
3. Fill in:
   - Repo owner: `mansonni`
   - Repo name: `RamazziniWebsite`
   - Branch: `main`
   - Personal Access Token: paste it
4. Click **Save**

The token is stored only in your browser's `localStorage`. Every editor adds their own token, on their own device.

---

## Step 4 — Set up Cloudinary for image/video uploads (2 min)

Free tier is generous (25 GB storage, 25 GB monthly bandwidth).

1. Create an account at https://cloudinary.com → choose the Free plan
2. After signup, your **cloud name** is shown on the dashboard top-left (e.g. `dxyz123ab`)
3. Settings (⚙) → **Upload** tab → scroll to **Upload presets** → **Add upload preset**
4. Name: `ramazzini_unsigned`
5. **Signing Mode: Unsigned** (important!)
6. Save

In the control panel → Settings:
- Cloud name: your cloud name
- Unsigned upload preset: `ramazzini_unsigned`
- Save

Now the **Upload…** button on any image/video field will push directly to Cloudinary and write the resulting URL into `content.json`.

---

## How publishing works

1. You edit fields in the control panel — they update an in-memory copy of `content.json`.
2. Click **Publish to live site**.
3. The panel:
   - Reads the current `content.json` from GitHub (to get its SHA)
   - Pushes a new commit with the updated `content.json`
4. GitHub Pages detects the commit and rebuilds the site in ~30 seconds.
5. Refresh `index.html` — new content is live.

If something goes wrong, you can always roll back via GitHub's commit history.

---

## Editable surfaces (today)

The control panel covers:

| Section | What you can edit |
|---|---|
| Site & SEO | Page title, meta description |
| Theme colors | Background, primary, accent (wired to a few CSS vars; most colors still in `styles.css`) |
| Top navigation | Brand name, link labels, sign-in label, header CTA |
| Pricing & seats | Amount, currency, total seats, seats remaining |
| Hero | Eyebrow, headline (3 parts), subtitle, both CTA labels, demo video URL, Founding-cohort card |
| How it works | Visibility toggle + eyebrow / title / subtitle + 3 step bodies |
| The Value | Visibility + heading + add/remove/reorder feature cards (title, body, stat, icon SVG) |
| Roadmap | Visibility + heading + add/remove/reorder roadmap cards |
| Final CTA | Visibility + title / subtitle / CTAs / hint |
| Footer | Copyright line, contact email |
| FAQ | Add/remove/reorder questions, with optional group headings |

Icons (for features + roadmap) are stored as inline `<svg>` strings inside each item. Edit the SVG in the textarea if you want to swap. Keep `viewBox="0 0 24 24"` and `stroke="currentColor"`.

---

## Things to know

- **The control panel is not multi-user with conflict resolution.** If two editors publish at once, the second one wins. Coordinate by Slack/text for now.
- **Image uploads are public** by default on Cloudinary. Don't upload anything sensitive.
- **The `inline` JSON in `index.html` and `admin.html`** is a first-load fallback for sandboxed previews. Once you've published a real `content.json` to the repo, that file becomes the source of truth.
- **To change colors that aren't yet CMS-driven** (most of the palette), edit `tokens.css` / `styles.css` directly. The Theme panel only controls a few overridable variables.

---

## Backups

You can download a snapshot of the current content any time:

- Control panel → **Export** → saves `content.json` to your machine.

To restore: **Import** the file. Review. Click **Publish**.
