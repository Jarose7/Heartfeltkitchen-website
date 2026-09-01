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

## Local development (optional)

```
npm install
cp .env.example .env   # then edit .env with a local Postgres connection string
npm start
```
