# Markovce Rozpis

Orthodox liturgical calendar and weekly schedule app for the parish of Markovce.

## Deploying a new version

`index.html` loads `style.css?v=…` and `script.js?v=…`. **Bump that `v` value (both tags) on every deploy.**
It is what makes every browser fetch the new files instead of a cached copy, and the app reads it
and shows it in the footer as *Verzia …* — if an iPhone and a Mac show different versions, one of
them is still on an old build (reload it; the `Cache-Control: no-cache` headers in `vercel.json`
make a plain reload enough).

Cross-device state lives on the server (`/api/sync`) and is pulled on page load, whenever the app
comes back into view, and every 5 minutes while it stays open. A signed-out device shows an orange
*Bez synchronizácie – prihlásiť sa* pill (tap it, or *Prihlásiť sa* in the header, to sign in with
Google); until then that device is offline-only and will drift from the others.

## Accounts and parishes

People sign in with Google. Each user belongs to one or more parishes with a role:

| role     | can                                                         |
|----------|-------------------------------------------------------------|
| `viewer` | see the parish's schedule (read-only in the app)            |
| `editor` | also edit weeks and the calendar style                      |
| `admin`  | same as editor for now (member management is SQL, below)    |

With two or more parishes a picker appears in the header. Each parish has its own offline cache on
the device, and switching parish reloads the page. Signed in but not a member of any parish shows
*Bez prístupu k farnosti*.

Every parish-scoped endpoint goes through `requireMember(req, parishSlug, minRole)` in
`lib/auth.js` — the database does not enforce tenancy, so a new endpoint must use it too.

### Who gets in

Like Slack's "anyone with an @company email can join": a parish can have a `join_domain`, and
anyone who signs in with a verified Google account at exactly that domain becomes a member with
the parish's `join_role` (`editor` or `viewer`; never admin). Markovce is set to **@krm.sk → editor**.
Subdomains don't count (`@student.krm.sk` is not `@krm.sk`), and signing in never changes the role
of someone who is already a member.

```sql
-- change or switch off auto-join
UPDATE parishes SET join_domain = 'krm.sk', join_role = 'viewer' WHERE slug = 'markovce';
UPDATE parishes SET join_domain = NULL WHERE slug = 'markovce';
```

### Adding members by hand

For anyone outside the join domain. The person signs in once (that creates their `users` row), then:

```sql
INSERT INTO parish_members (parish_id, user_id, role)
SELECT p.id, u.id, 'editor' FROM parishes p, users u
WHERE p.slug = 'markovce' AND u.email = 'someone@gmail.com'
ON CONFLICT (parish_id, user_id) DO UPDATE SET role = EXCLUDED.role;
```

A new parish is `INSERT INTO parishes (slug, name) VALUES ('presov', 'Pravoslávni Prešov');`
(slug: lowercase letters, digits, dashes). Removing a row from `parish_members` takes effect on that
person's next request.

### Public calendar

Anyone can subscribe without signing in:

- `/p/<slug>/kalendar.ics` — any parish
- `/kalendar.ics` — Markovce (the original URL, kept working)

## Setup

Environment variables (Vercel → Project → Settings → Environment Variables):

| name                   | value                                                                  |
|------------------------|------------------------------------------------------------------------|
| `POSTGRES_URL`         | set by the Vercel Postgres integration                                 |
| `GOOGLE_CLIENT_ID`     | OAuth client (type *Web application*) from Google Cloud console        |
| `GOOGLE_CLIENT_SECRET` | its secret                                                             |
| `SESSION_SECRET`       | 32+ random characters (`openssl rand -base64 48`); signs session cookies |
| `APP_ORIGIN`           | production origin, e.g. `https://rozpis.example.sk` (optional; without it the request's host is used) |

In the Google OAuth client add `https://<your-domain>/api/auth/callback` as an authorised redirect
URI (and `http://localhost:3000/api/auth/callback` for `vercel dev`). `PARISH_KEY` is no longer used
and can be deleted.

The schema (`db/init.sql`, same statements as `lib/schema.js`) is applied automatically on the first
API request after deploy. It migrates the original single-tenant `weeks`/`settings` tables in place:
existing data becomes the `markovce` parish. After deploying, the owner signs in once and grants
themselves admin with the SQL above (role `'admin'`).

Tests: `npm test`. The API tests run against a real, throwaway Postgres —
`TEST_DATABASE_URL=postgres://… npm test` (the database is wiped); without it they are skipped.

## Icons

Icons are stored in `icons/` and registered in `icons/manifest.json`. The app loads the manifest at runtime — adding a new icon means: dropping the file in `icons/`, adding an entry to `manifest.json`, done.

Currently **99 icons** in the gallery.

## To Do — Missing Icons

Icons still needed for the following feasts/saints:

### Great Martyrs & Popular Saints
- [ ] St. Panteleimon the Great-Martyr (July 27)
- [ ] St. Paraskeva (Oct 14 / Nov 14)
- [ ] St. Barbara (Dec 4)
- [ ] St. Stephen the Protomartyr (Dec 27)
- [ ] St. Spyridon of Trimythous (Dec 12)
- [ ] St. James the Brother of the Lord (Oct 23)

### Theotokos Icons
- [ ] Theotokos of Vladimir (Vladimirskaya)
- [ ] Theotokos of Kazan
