# Reps Screens

Reps' App Store and Google Play screenshot builder.

- **Client brief** at `/`: clients enter their branding, 7 headlines and screenshots, then submit.
- **Admin studio** at `/admin`: pick a submitted brief from the dropdown, choose a style, background pattern and phone layout, then download every store size as one ZIP.

It runs on Cloudflare Pages. Pages Functions handle submissions and briefs are stored in Workers KV. All of it fits in Cloudflare's free plan.

## What's in here

| Path | What it is |
| --- | --- |
| `public/index.html` | Client brief form |
| `public/admin/index.html` | Admin studio |
| `public/assets/engine.js` | Screenshot renderer: 8 styles, 12 patterns, 7 layouts, device frames, export sizes |
| `public/assets/form.js` | The brand + 7 screens form, shared by both pages |
| `public/assets/client.js`, `admin.js` | Page logic |
| `functions/api/briefs/` | API: submit (public), list/open/update/delete (admin key) |
| `lib/http.js` | Shared API helpers |
| `wrangler.toml` | Cloudflare config and KV binding |

## Quick preview on GitHub Pages

GitHub Pages can host the pages but not the API, so the site runs in **preview mode** there:

- The client form works fully. On submit, it downloads the brief as a `.json` file instead of sending it.
- The admin page skips the login and opens with sample content. **Open brief file** loads a brief the form downloaded.
- All designs, previews and the ZIP export work as normal.

To set it up:

1. Push this folder to a GitHub repo, with the branch named `main`.
2. In the repo, go to **Settings → Pages → Source** and choose **GitHub Actions**. The included workflow (`.github/workflows/pages.yml`) publishes the `public` folder on every push.
3. Open `https://<you>.github.io/<repo>/` for the client form and `https://<you>.github.io/<repo>/admin/` for the studio.

When you move to Cloudflare (below), the same code detects the API and switches to live submissions and the brief dropdown automatically.

## Deploy (about 10 minutes)

You need a Cloudflare account and Node 18 or newer.

1. **Install and sign in**
   ```bash
   npm install
   npx wrangler login
   ```
2. **Create the briefs store**
   ```bash
   npx wrangler kv namespace create BRIEFS
   ```
   Copy the `id` it prints into `wrangler.toml` in place of `REPLACE_WITH_YOUR_KV_NAMESPACE_ID`.
3. **Create the Pages project and deploy**
   ```bash
   npx wrangler pages project create reps-screens --production-branch main
   npx wrangler pages deploy
   ```
4. **Set your admin key.** Make it long and random, as it's the only lock on `/admin`.
   ```bash
   npx wrangler pages secret put ADMIN_KEY --project-name reps-screens
   ```
   Then run `npx wrangler pages deploy` once more so the key takes effect.
5. Open `https://reps-screens.pages.dev/admin`, enter the key, and use **Copy client form link** to get the link for clients.

### Deploying from GitHub instead

1. Push this folder to a GitHub repo.
2. In the Cloudflare dashboard, go to **Workers & Pages → Create → Pages → Connect to Git** and pick the repo.
3. Set the build command to none and the output directory to `public`.
4. Complete step 2 above (the KV namespace and the id in `wrangler.toml`).
5. Under **Settings → Variables and Secrets**, add `ADMIN_KEY` as a secret.

Every push to `main` then redeploys automatically. `.dev.vars` is git-ignored, so your local key never gets pushed.

### Custom domain

In the Pages project, open **Custom domains** and add, for example, `screens.yourdomain.com`. Clients get the root of that domain and you use `/admin`.

## Run it locally

```bash
echo "ADMIN_KEY=choose-a-local-key" > .dev.vars
npm run dev
```

Then open http://127.0.0.1:8788 for the client form and http://127.0.0.1:8788/admin for the studio. Local submissions are stored in `.wrangler/` and never touch your live data.

## How it works

- **Submitting.** The client's screenshots are resized in their browser (phones to 1290 px wide, tablets to 2064 px) and sent as one JSON brief. A full brief is usually 2 to 8 MB, and the API accepts up to 24 MB. A hidden honeypot field quietly drops simple spam bots.
- **Admin access.** Every admin request carries `Authorization: Bearer <ADMIN_KEY>`. The key is checked in constant time and remembered in your browser until you sign out. For stronger protection, add Cloudflare Access (Zero Trust, free for small teams) in front of `/admin*` and `/api/briefs*` with an email rule. Leave POST `/api/briefs` public, because clients need it.
- **Design choices** are saved back onto each brief. Reopening a brief brings back the style, pattern and layout you last used.
- **Exports** are JPG at 93% quality with no alpha channel. App Store Connect rejects transparency, and Google Play accepts JPG.

## Adding a design

All designs live in `public/assets/engine.js`:

- **Styles** (`STYLES`) return a `paint` function and the title, highlight and copy colours.
- **Patterns** (`PATTERNS`) draw over the background. They work in strip coordinates (`c.i * W`), so lines and waves flow from one screen into the next.
- **Layouts** (`LAYOUTS`) place the text and phones using `topText`, `bottomText` and `dev`.

Add an entry to any of the three and it appears in the admin pickers automatically.
