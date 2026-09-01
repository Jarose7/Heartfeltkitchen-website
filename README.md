# Heartfelt Kitchen & Co. — website backend

Starter Node/Express + Postgres app. Right now it just proves the deploy
pipeline works (GitHub -> Render -> Postgres -> heartfeltkitchen.co); real
pages get added to `public/` from here.

## 1. Push this folder to GitHub

From a terminal, inside this folder:

```
git init
git add .
git commit -m "Initial backend scaffold"
```

Then go to github.com, click the "+" in the top right -> "New repository".
Name it something like `heartfelt-kitchen-website`, leave it empty (don't
add a README/gitignore there, since this folder already has them), and
create it. GitHub will show you a page with a remote URL — copy it, then
run:

```
git remote add origin <the URL GitHub gave you>
git branch -M main
git push -u origin main
```

## 2. Deploy on Render

Easiest path: use the included `render.yaml`.

1. Go to render.com, sign in (or create an account).
2. Click "New +" -> "Blueprint".
3. Connect your GitHub account if you haven't, and select this repo.
4. Render reads `render.yaml` and sets up both the web service and the
   Postgres database automatically, already wired together.
5. Click Apply / Deploy.

(If you'd rather do it manually instead of the Blueprint, see the earlier
step-by-step Jack already has — New + -> Web Service, then New + ->
PostgreSQL, then link the DATABASE_URL env var by hand.)

## 3. Set up the database table

Once the Postgres database is created on Render, open its "Connect" tab and
copy the "External Connection String" (or use Render's built-in Shell for
the database). Run the contents of `schema.sql` against it once, either by
pasting it into Render's database shell, or via `psql`:

```
psql <external connection string> -f schema.sql
```

## 4. Check it's alive

Once deployed, Render gives you a `https://your-app-name.onrender.com`
URL. Visit `/health` on that URL — it should return
`{"status":"ok","database":"connected"}`. If `database` says "not
connected", double check the DATABASE_URL environment variable on the web
service.

## 5. Custom domain

Once step 4 works, add the custom domain in Render and point Namecheap's
DNS at it — see the separate DNS walkthrough for the exact records.

## 6. Set up the admin panel (heartfeltkitchen.co/admin)

The admin panel needs one more schema file and three environment variables.
Nothing here runs automatically — you run it once, by hand, same as step 3.

**a) Run the admin schema.** Same way as `schema.sql` — via `render psql`
or Render's Shell tab:

```
render psql <your-db-id>
\i schema-admin.sql
```

**b) Generate a password hash.** Run this locally (after `npm install`),
swapping in the real password:

```
node -e "console.log(require('bcryptjs').hashSync('YOUR_PASSWORD_HERE', 10))"
```

**c) Set environment variables on the Render web service** (Dashboard ->
your service -> Environment):

- `SESSION_SECRET` — any long random string (e.g. generate one with
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- `ADMIN_USERNAME` — whatever username Becca wants to log in with
- `ADMIN_PASSWORD_HASH` — the hash generated in step (b), not the plain password

Once those are set and the service redeploys, `/admin` is live. Log in,
and menu items / site content (hours, address, contact info, Instagram
link) can be edited there — changes show up on the live site immediately,
no redeploy needed. There's only one login for now (Becca's), by design.

## 7. Connect Flodesk (optional)

The contact/inquiry form always saves to the database and shows up in
`/admin` regardless of this step — it's a bonus on top, not a
replacement. When configured, every new inquiry is also pushed into
Becca's existing Flodesk account as a subscriber tagged into a "Website
Inquiries" segment, with the inquiry type, event date, guest count,
budget, and notes attached as custom fields.

**a) Get the API key from Becca's Flodesk account** (requires her paid
plan): in Flodesk, go to **My Account > Integrations > API keys** and
click **Create API key**. Copy it immediately — Flodesk only shows it
once.

**b) Set `FLODESK_API_KEY`** as an environment variable on the Render web
service, same way as the admin panel's variables.

That's the whole setup on our end — the segment and custom fields get
created automatically in Flodesk the first time an inquiry comes in.

**One thing this doesn't do:** get this integration into Flodesk doesn't
by itself make Flodesk email Becca. For that, she needs to build a
workflow inside Flodesk itself — trigger: subscriber added to the
"Website Inquiries" segment, action: send her a notification. That's
configured entirely in Flodesk's own workflow builder, on her account;
this integration only gets the subscriber in there with the right tag.

## Local development (optional)

```
npm install
cp .env.example .env   # then edit .env with a local Postgres connection string
npm start
```
