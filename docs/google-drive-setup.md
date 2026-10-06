# Google Drive setup for Jota (Joyno Task)

This guide connects Jota to the approved Google Drive account `joynojohn@gmail.com`.
It covers the one-time Google Cloud setup, local development configuration, and
a safe first-connection test. Follow it in order. Keep your OAuth client secret
and token-encryption key private throughout.

## What the integration does

- Creates a private `Jota Client Files` folder in the connected account's My
  Drive, then a subfolder for each client.
- Requests Google's `drive.file` scope and creates files and folders through
  Jota. It does not browse unrelated Drive files.
- Stores Drive file IDs and metadata in the app database. Downloads go through
  the signed-in app and are checked against the app's client/task access rules.
- Encrypts Google's refresh token before storing it in the database. The token
  is not sent to the browser. Disconnecting removes the stored token and
  attempts to revoke Google's grant; it does not delete Drive files.
- Currently limits Drive attachments to 100 MB and accepts common images, MP4/MOV, PDF,
  TXT/CSV, and Office DOCX/XLSX/PPTX files. There is no separate malware
  scanner, so upload trusted work files only. Files are downloaded rather than
  rendered inline and are not automatically purged. The upload is proxied
  through the app server, so a deployment host may impose a lower request
  limit; verify the production host before relying on 100 MB uploads there.

## Before you begin

You need:

- Access to the Jota repository on your computer.
- Access to Google Cloud Console using `joynojohn@gmail.com`.
- The local Jota app running with its usual Supabase configuration.

The Google Drive database migration must also have been applied to the
Supabase project before the app can save a connection. The migration file is
`supabase/migrations/202610110001_google_drive_private_storage.sql`. Applying
that migration to hosted Supabase is a separate database step; editing
`.env.local` does not apply it.

## Part 1: Configure Google Cloud

### 1. Select a Google Cloud project and enable Drive API

1. Open [Google Cloud Console](https://console.cloud.google.com/) and sign in
   as `joynojohn@gmail.com`.
2. Select the project intended for Jota, or create one if you have not already.
   Confirm the project name in the top project selector before continuing.
3. Open **APIs & Services > Library**.
4. Search for **Google Drive API**, open it, and click **Enable**. If it already
   says enabled, continue.

### 2. Configure Google Auth Platform (the OAuth consent configuration)

Google's current console uses **Google Auth Platform** in place of the older
"OAuth consent screen" page. If its Overview says it is not configured yet,
click **Get started**.

Complete the sections in the left navigation:

1. **Branding:** Set the app name to **Jota** or **Jota (Joyno Task)**. Use
   `joynojohn@gmail.com` for the required support/contact email fields. A logo
   and optional links can be added later.
2. **Audience:** Choose **External** for a personal Gmail account. Leave the
   publishing status as **Testing** for local setup. Add
   `joynojohn@gmail.com` under **Test users** and save.
3. **Data Access:** Jota requests `openid`, `email`, and the Google Drive
   `drive.file` permission. If Google asks you to configure scopes, use the
   minimum required by the app:

   ```text
   openid
   email
   https://www.googleapis.com/auth/drive.file
   ```

   Do not add broad Drive scopes such as full access to all Drive files.
4. **Clients:** You will create the OAuth client in the next section.

Keep the app in Testing while you are setting it up. Testing mode can cause
Google authorization/refresh tokens to expire after seven days for apps using
Drive permissions. It is suitable for initial setup and smoke testing, not a
reliable long-term production configuration. See [Google's audience guidance](https://support.google.com/cloud/answer/15549945?hl=en).

### 3. Create a Web application OAuth client

1. In Google Auth Platform, open **Clients** and choose **Create client**.
2. For **Application type**, select **Web application**.
3. Give the client a recognizable name, such as **Jota local development**.
4. Under **Authorized redirect URIs**, add this exact value:

   ```text
   http://localhost:3000/api/google-drive/callback
   ```

   Do not add a trailing slash or change the port unless the local app is
   configured to use a different port. The URI must match exactly.
5. Create the client. Copy its **Client ID** and **Client secret** somewhere
   private temporarily. You will enter them into the local environment file in
   Part 2. Do not send either value in chat, email, or a screenshot.

The Client ID usually ends in `apps.googleusercontent.com`. The Client secret
is a separate confidential value. Do not mistake the project ID for the Client
ID.

## Part 2: Add values to the repository's `.env.local`

### 1. Open the correct file

`.env.local` belongs in the **repository root**, in the same folder as
`package.json` and `.env.example`. It is a local file, not a Google Cloud page
and not the `.env.example` template.

In VS Code, open the Jota repository folder, then open `.env.local` in the
Explorer. If hidden files are not visible, use **File > Open File** and select
`.env.local` from the repository root. On Windows, you can also open File
Explorer and enter the repository folder's path in the address bar. Do not
open or edit a similarly named file inside `docs`, `src`, or `supabase`.

If `.env.local` does not exist, create it in the repository root. Preserve any
existing Supabase or other application settings in it; do not replace the file
with only the Google settings below.

### 2. Generate the encryption key

The encryption key must be 32 cryptographically random bytes, encoded as
Base64. Open PowerShell (not the browser console) and run:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Copy the single Base64 value printed by the last command. Do not include any
spaces or quotation marks. If your Windows PowerShell version says that
`RandomNumberGenerator.Fill` does not exist, use this compatible alternative:

```powershell
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$key = [Convert]::ToBase64String($bytes)
$rng.Dispose()
$key
```

Generate this key once for this environment. If you lose it, any refresh tokens
already encrypted with it become unreadable. Store a protected backup in a
password manager or another secure location. Never put it in source code,
screenshots, chat, or a public/shared document.

### 3. Add the Google variables

In `.env.local`, add these lines. Replace only the two OAuth placeholders and
the encryption-key placeholder with your actual values. Keep the owner email
and local callback URI as shown:

```dotenv
GOOGLE_DRIVE_CLIENT_ID=paste-your-web-client-id-here
GOOGLE_DRIVE_CLIENT_SECRET=paste-your-web-client-secret-here
GOOGLE_DRIVE_OWNER_EMAIL=joynojohn@gmail.com
GOOGLE_DRIVE_REDIRECT_URI=http://localhost:3000/api/google-drive/callback
GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY=paste-the-generated-base64-key-here
```

Use plain `NAME=value` lines with no `export` prefix. Do not type the angle
brackets or placeholder wording from an example. Do not rename these variables
or add a `NEXT_PUBLIC_` prefix: all five are server-only secrets/settings.
Keep the existing Supabase variables in `.env.local` unchanged.

Save the file. This repository's `.gitignore` excludes `.env.local` and other
`.env*` files while allowing `.env.example`; still, never force-add `.env.local`
to Git.

### 4. Restart the local development server

Environment variables are read when the server starts. Stop the running dev
server with **Ctrl+C** in its terminal, then start it again from the repository
root using the project's normal command (usually `npm run dev`). A browser
refresh alone is not enough.

Do not print or share the contents of `.env.local` to verify it. Check only
that the five variable names are present and that the server has restarted.

## Part 3: Connect and test Google Drive

1. Sign into the local Jota app as an Administrator.
2. Open **Settings > Storage** (or visit `/settings/storage`) and select
   **Connect Google Drive**.
3. On Google's consent screen, choose `joynojohn@gmail.com`. If Google warns
   that the app is in testing, continue only if the account is listed as a test
   user.
4. Approve the requested sign-in and Drive file access. Jota should return you
   to the app. The integration is configured to reject a different Google
   account.
5. Open a client you can access, go to its **Files** tab, and upload a small,
   non-sensitive test PDF.
6. Confirm the file appears in Jota and downloads successfully. In Google
   Drive, confirm it is under `Jota Client Files/<client>/` and is not shared
   publicly.
7. If possible, verify with a user who does not have access to that client
   that the file cannot be listed or downloaded. Confirm a non-administrator
   cannot connect or disconnect the provider.
8. Remove the test file through the app if the UI provides that action; note
   that removing a database record may not delete the Drive object. Do not
   upload real client material until access behavior has been verified.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Google says `redirect_uri_mismatch` | The Authorized redirect URI in Google Cloud and `GOOGLE_DRIVE_REDIRECT_URI` in `.env.local` must both be exactly `http://localhost:3000/api/google-drive/callback`. Check the port and trailing slash. |
| Google says access is blocked or the app is in testing | Confirm the app is **External**, still in **Testing**, and `joynojohn@gmail.com` is listed under **Test users**. |
| Google says `invalid_client` | Re-copy the Web application Client ID and Client secret. Ensure there are no extra spaces and that you did not use the Google Cloud project ID. |
| Jota reports Drive is not configured | Check all five variable names, save `.env.local`, and fully restart the dev server. Do not disclose the values while asking for help. |
| Jota reports an encryption-key problem | Ensure the key is the full Base64 output generated above, with no quotes or line breaks. Do not casually generate a replacement after a token has been saved: the old token cannot be decrypted with a new key. |
| Consent succeeds but Jota reports the wrong account | Sign out of other Google accounts in that browser session or choose `joynojohn@gmail.com` explicitly. The account must match `GOOGLE_DRIVE_OWNER_EMAIL`. |
| OAuth connects but Drive operations fail | Confirm the Google Drive API is enabled in the same Cloud project as the OAuth client, and verify the required Supabase migration has been applied to the correct project. |

When asking for help, share the error text with all tokens, client secrets,
and key values removed. Never share a screenshot that shows the `.env.local`
contents.

## Production deployment is a separate step

Local `.env.local` values apply only to the local development server. Before
using Google Drive from a deployed app, configure the same server-only values
in the deployment provider's encrypted environment-variable settings, create
and register the exact production callback URL in Google Cloud, and complete
Google's publishing/verification requirements as applicable. Do not reuse the
localhost callback as the production callback. Decide how the production
encryption key will be backed up before connecting the production account.
