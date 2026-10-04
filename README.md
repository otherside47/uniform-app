# uniform-app

Uniform provisioning for the Local Guard Force: three small web apps on one Supabase project.

| App | Path | Who |
|---|---|---|
| Guard | `guard/` | ~100 guards (number + 6-digit PIN), phone first |
| Admin | `admin/` | 4 main admins + 2 admins (short login + password) |
| GSO | `gso/` | read-only, sees guards by number only |

Static files, no build step, no external CDN. Languages: Russian, English, Turkmen (`shared/dict.*.js`; the Turkmen text is a draft that needs a native speaker's review).

The Supabase URL and publishable key in `shared/config.js` are public by design. Access is enforced by row-level security and database functions, not by hiding the key. Keep guard names and real data out of this repository.

Run locally: `python3 -m http.server` in this folder, then open `/admin/`, `/guard/` or `/gso/`.
