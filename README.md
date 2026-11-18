# AEC Workshop - Procedure of Work Checklist

Digital version of the workshop's paper job form. Works on **phone, tablet and PC**, saves every job in a database, and every user logs in with their own username and password.

## Start it (on this PC)

1. Double-click **`start.bat`**.
   - The first time, it installs what it needs and creates a `.env` settings file with a random secret.
2. Your browser opens at **http://localhost:3004**.
3. **First time only:** you'll see "First-time setup". Create the **admin** account.
4. Go to **Users** and add your staff, each with a temporary password. Each person picks their own password the first time they log in.

Keep the black window open while people use the app. Closing it stops the app.

## Use it on phones and tablets (same Wi-Fi)

1. On the PC, find its IP address: open PowerShell and run `ipconfig`, then look for "IPv4 Address", e.g. `192.168.1.20`.
2. On the phone or tablet, open `http://192.168.1.20:3004`.
3. If it doesn't load, allow Node.js through Windows Firewall (Windows will usually ask the first time).

**Install as an app:** in Chrome or Edge, use the menu, then "Install app" / "Add to Home screen". On iPhone, use Safari's Share button, then "Add to Home Screen". On a PC, click the install icon in the address bar.

> Note: phones only offer "Install" on `https://` sites or on `localhost`. Over plain Wi-Fi (`http://192.168...`) the app still works fully in the browser; it just won't install as an icon. To get proper installs on every device, put it online (see below).

## Who can do what

| | Staff | Admin |
|---|---|---|
| Create and edit jobs, tick checklist steps | ✅ | ✅ |
| Search job records, print a job | ✅ | ✅ |
| **Mark as checked & lock** (fills "Checked by") | | ✅ |
| Reopen a locked job (reason required) | | ✅ |
| Delete a job | | ✅ |
| Add users, reset passwords, deactivate | | ✅ |

- **Prepared by** is filled in automatically with the name of whoever created the job.
- Every save is written to the job's **Activity log** (who, when, what changed).
- If two people edit the same job at once, the second save is refused instead of overwriting the first.
- 5 wrong passwords lock that username for 15 minutes. An admin's "Reset password" unlocks it.

## Changing the lists

Job statuses and the procedure checklist steps are both in **`server/config/workshop.js`**. Edit that file and restart. Add new checklist steps at the **end** so old jobs keep their ticks in the right rows.

## Backups

All data lives in `data/workshop.db`. Copy that file somewhere safe regularly. Never delete the `data` folder.

## Putting it online (optional)

It uses the same setup as Customer Reward System: deploy to Render with a Turso database by setting `DB_URL`, `DB_AUTH_TOKEN` and `JWT_SECRET` as environment variables.

## Folder guide

```
server/            the back end (Node + Express)
  index.js         starts the server
  config/          job statuses + checklist steps
  routes/          auth (login), jobs, users
  db/              database connection + table setup
public/            the front end (HTML/CSS/JS, no framework)
  js/views/        one file per screen
  css/             variables.css (colours) + main.css (layout)
```
