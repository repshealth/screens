# Reps Screens

App Store and Google Play screenshot builder, hosted entirely on GitHub.

- **Client form** (`/`): clients add their branding, 7 headlines and screenshots, then click Submit.
- **Studio** (`/admin/`): submitted briefs appear in a dropdown. Pick one, choose a style, background pattern and phone layout, and download every store size as one ZIP.

Live at `https://repshealth.github.io/screens/` and `https://repshealth.github.io/screens/admin/`.

## How it works without a server

GitHub Pages can only serve files, so the client form saves each brief straight into a **separate private repo** (`screens-briefs`) through GitHub's API, using a key that can only touch that one repo.

That key has to ship inside the public page, so anyone who digs through the page code could find it. To keep client data private anyway, **every brief is encrypted in the client's browser** before it's sent:

- The client form locks each brief with the studio's public key.
- Only the studio can unlock briefs, using a passphrase you choose. The studio's private key is stored in the briefs repo, encrypted with that passphrase.
- Someone holding the key could add junk files or delete briefs (git history keeps deleted files), but they can't read anything.

## Setup (about 10 minutes, one time)

### 1. Create the briefs repo
On GitHub, create a new **private** repo named `screens-briefs` under `repshealth`. Tick **Add a README file** so it isn't empty.

### 2. Create the repo key
1. On GitHub, go to **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. **Resource owner:** repshealth.
3. **Expiration:** the longest allowed. Put a reminder in your calendar to renew it.
4. **Repository access:** Only select repositories → `screens-briefs`. Pick only this one repo.
5. **Permissions:** Repository permissions → **Contents: Read and write**. Leave everything else at No access.
6. Generate the token and copy it.

### 3. Add it to the screens repo
In `repshealth/screens`, go to **Settings → Secrets and variables → Actions**:
- **Secrets** tab → New repository secret → name `BRIEFS_DROP_KEY`, value: the token.

If you named the briefs repo something else, also add a variable `BRIEFS_REPO` with the value `owner/name`.

### 4. Publish with GitHub Actions
In `repshealth/screens`, go to **Settings → Pages → Source** and choose **GitHub Actions**. Then go to **Actions → Deploy to GitHub Pages → Run workflow**.

### 5. Create the studio passphrase
1. Open `/admin/`. It asks you to create a studio passphrase. Use at least 10 characters and **store it in your password manager**: without it, submitted briefs can't be opened.
2. The studio then shows a **Connect the client form** box with a public key.
3. Copy the key, then in `repshealth/screens` go to **Settings → Secrets and variables → Actions → Variables** and add a new variable named `BRIEFS_PUBLIC_KEY` with the key as its value.
4. Run the deploy workflow again.

Done. The client form now submits straight into the studio dropdown.

## Day to day

- Send clients the link from **Copy client form link** in the studio.
- Each browser asks for the passphrase once, then remembers it until you click **Lock studio**.
- Status (New or Done) and your design choices are saved to `state.json` in the briefs repo, so they follow you to any device.
- **Before the key expires**, generate a new one (step 2) and update the `BRIEFS_DROP_KEY` secret, then re-run the deploy.

## Preview mode

If `BRIEFS_DROP_KEY` isn't set, the site still works:
- The client form downloads the brief as a `.json` file instead of sending it.
- The studio opens with sample content and an **Open brief file** button for those downloaded files.

## Files

| Path | What it is |
| --- | --- |
| `public/index.html` | Client form |
| `public/admin/index.html` | Studio |
| `public/assets/engine.js` | Screenshot renderer: styles, patterns, layouts, device frames, export sizes |
| `public/assets/form.js` | Brand + 7 screens form, shared by both pages |
| `public/assets/crypto.js` | Brief encryption (RSA-OAEP 3072 + AES-256-GCM; passphrase via PBKDF2) |
| `public/assets/store.js` | GitHub API client for the briefs repo |
| `public/config.js` | Empty placeholder; the deploy workflow fills it in |
| `.github/workflows/pages.yml` | Deploy to GitHub Pages and write `config.js` |

### Briefs repo layout

```
keys/studio-key.json        studio key pair (private half encrypted with the passphrase)
briefs/<id>.brief           encrypted brief: brand, copy, screenshots
briefs/<id>.meta            encrypted summary used for the dropdown
state.json                  status and saved design per brief (not sensitive)
```

## Adding a design

All designs live in `public/assets/engine.js`:

- **Styles** (`STYLES`): background paint plus title, highlight and copy colours.
- **Patterns** (`PATTERNS`): background decoration. Patterns are drawn across the whole 7-screen strip, so they flow from one screen into the next.
- **Layouts** (`LAYOUTS`): where the text and phones go.

Add an entry to any of the three and it appears in the studio automatically.

## Run locally

```bash
npm run dev    # serves public/ on http://localhost:8080 in preview mode
```
