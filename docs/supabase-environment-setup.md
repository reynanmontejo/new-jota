# Configure Supabase environment variables

This guide sets up the three Supabase values Joyno Task reads from `.env.local`.
Do not paste keys into chat or commit them to Git.

## 1. Open the project folder

Open PowerShell and run:

```powershell
cd "D:\reynan-projects\new jota"
Copy-Item .env.example .env.local
notepad .env.local
```

`.env.local` belongs beside `package.json`. If it already exists, do not run
`Copy-Item`; open the existing file with `notepad .env.local` so you do not
overwrite other local settings. Git is configured to ignore `.env.local`.

## 2. Copy the project URL and publishable key

1. Sign in to the [Supabase Dashboard](https://supabase.com/dashboard) and open
   the project for Joyno Task.
2. Open the project's **Connect** dialog and copy its **Project URL** and
   **Publishable key**. You can also find keys under **Project Settings >
   API Keys**.

The publishable key normally starts with `sb_publishable_`. It is intended for
the browser and is restricted by the app's authentication and database RLS.

## 3. Copy the server secret key

In **Project Settings > API Keys**, open the **Secret keys** section and copy
the project's secret key (normally starts with `sb_secret_`). This key is only
for trusted server operations such as creating employee accounts.

In the app's environment file, the server key variable is still named
`SUPABASE_SERVICE_ROLE_KEY`; put the secret key value there. Do not rename the
variable, add a `NEXT_PUBLIC_` prefix, or put this value in client-side code.
Supabase recommends publishable/secret keys for new projects; the older
`anon`/`service_role` keys are legacy names. See [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).

## 4. Fill in `.env.local`

Replace the three placeholder values. Keep the variable names and use no
surrounding quotes:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_value
SUPABASE_SERVICE_ROLE_KEY=sb_secret_your_value
```

Use your real values instead of the examples. Save the file. Do not share a
screenshot that shows the key values.

## 5. Restart and verify

If `npm run dev` is running, stop it with **Ctrl+C**, then restart:

```powershell
npm run dev
```

Next.js reads local environment variables when the server starts. The app should
no longer use demo mode when the URL and publishable key are valid. This only
connects the app to Supabase; database migrations and an initial administrator
account still need to be set up before employee management can be used.

## Keep the secret private

- Never commit `.env.local`; it is ignored by Git.
- Never use `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` or place the secret in a
  component, browser script, or client-side environment variable.
- If a secret key is exposed, rotate it in **Project Settings > API Keys** and
  update `.env.local`.
