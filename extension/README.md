# Tab Space WebExtension

The Tab Space 4.0 browser extension shares one implementation across Chrome,
Microsoft Edge, and Firefox. The browser-specific output is generated rather
than maintained as separate source trees.

```bash
node extension/build.mjs all
node --test extension/test/*.test.cjs
```

For local dashboard development, start the Vue development server and build a
separate extension in one command:

```bash
cd admin
yarn serve:extension
```

Development builds trust two kinds of dashboard origin, and nothing else:

- the exact local development origin `http://127.0.0.1:8080`, and
- Cloudflare Pages Admin deployments on `https://*.tab-space-admin.pages.dev`,
  such as `https://dev-4-0.tab-space-admin.pages.dev/#/`. Every preview branch
  gets its own hostname, so the whole preview domain is matched instead of one
  branch.

The toolbar button and the **Open Tab Space** shortcut open the first trusted
origin, which defaults to `https://dev-4-0.tab-space-admin.pages.dev`. Name a
different origin to put it first; every origin above stays trusted either way:

```bash
node extension/build.mjs dev --dashboard=http://127.0.0.1:8080
```

A deployed preview only answers the extension once the Admin change that trusts
its origin is deployed to that branch. Until then the page reports that the
Tab Space Helper was not detected, even though the extension injected fine.

Load `extension/dist/chrome-dev`, `edge-dev`, or `firefox-dev` as the temporary
development extension, then reload it once after rebuilding. Production and
development outputs coexist; production packages trust only
`https://app.mytab.space` and never inject into the localhost or preview
origins. If port 8080 already has your Dashboard server, `yarn serve:extension`
only rebuilds the dev extensions and leaves that server running; it never
silently switches to a different port.

Firefox does not support port numbers in WebExtension match patterns. Its dev
manifest therefore matches the loopback host, while `content-script.js`
enforces the exact `http://127.0.0.1:8080` origin before starting the bridge.
After every rebuild, click **Reload** for Tab Space (Dev) in
`about:debugging#/runtime/this-firefox`, then reload the Dashboard tab.

Generated packages are written to `extension/dist/` and are intentionally not
committed. Chrome and Edge use the same Manifest V3 service-worker code.
Firefox uses the same background implementation as a Manifest V3 background
script.

The toolbar button shows one icon in every browser and every theme.
This applies to **Chrome and Edge only**. Firefox resolves the theme correctly
on its own through `theme_icons`, so it keeps the dark/light pair it always had,
committed as `assets/toolbar-firefox-*.png` and `assets/toolbar-firefox-light-*.png`
and renamed into the plain filenames inside the Firefox package. The blue is
deliberately not carried over there, and nothing else in the product uses it.

The extension's own icon — the extensions page, the store listing, the popup's
logo — is the Mac app's icon, exported per size from the app's Icon Composer
document in the private repository and committed as `assets/icon-*.png`:

```bash
ictool="/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool"
for size in 16 32 48 128; do
  "$ictool" "../Tab-Works/Tab Space.icon" --export-image --output-file "extension/assets/icon-$size.png" \
    --platform macOS --rendition Default --width $size --height $size --scale 1
done
```

The repository-root `icon.png` belongs to the marketing site, which shows the
released app; this package can ship ahead of an app release.

`assets/toolbar.svg` is the Chromium source for every size; the committed PNGs
are rendered from it with [librsvg](https://gitlab.gnome.org/GNOME/librsvg):

```bash
cd extension/assets
for size in 16 32 48 128; do
  rsvg-convert -w $size -h $size toolbar.svg -o toolbar-$size.png
done
```

Two overlapping frames and two arrows do not survive 16 pixels at any stroke
weight, so @1x is soft. That is accepted in exchange for one drawing at every
size; @1x is also the case a companion extension for a Mac app rarely meets.

Three other drafts were built and compared before this one was chosen, and are
kept in `assets/alternatives/` with the measurements behind each. The build does
not read them.

The icon deliberately does not follow the browser theme. Chromium has no
equivalent of Firefox's `theme_icons`, and the only color-scheme signal a
service worker can reach describes web content rather than the toolbar:
browser themes, Edge's separate appearance setting, and permanently dark
private windows all decouple the two, and a global `action.setIcon` cannot
follow a single window in any case. The icon is a single-weight line drawing in
one colour instead: `#007AFF`, macOS's `controlAccentColor`. Safari tints the
Safari extension's template icon with that same blue, so the two extensions show
the same mark, and the value does not change between the light and dark
appearances.

The toolbar colours it has to survive are measured rather than assumed. Chrome's
light toolbar samples `#FFFFFF` and its dark toolbar `#3C3C3C` — the dark one
read off an incognito window, which renders the dark UI even on a light system;
Edge's dark toolbar is `#333333`. The blue scores 4.02:1 and 2.75:1 against
Chrome's pair. The dark figure sits under the 3:1 guidance for non-text
elements, but that formula counts luminance alone and a saturated blue also
separates from neutral grey by hue; rendered at every size on the measured dark
toolbar it stays clearly legible. `#0A84FF` reaches 3.02:1 there if the number
ever has to be met literally.

See [INSTALL.md](INSTALL.md) for RC sideloading and pairing instructions.

Chrome and Edge can also be smoke-tested as unpacked extensions with an
installed browser executable:

```bash
node extension/test/browser-load.smoke.cjs chrome "/path/to/Google Chrome"
node extension/test/browser-load.smoke.cjs edge "/path/to/Microsoft Edge"
```

With a dashboard served on the development origin, the same smoke test can
also verify that the dev content bridge is injected:

```bash
node extension/test/browser-load.smoke.cjs chrome-dev "/path/to/Chrome for Testing" "http://127.0.0.1:8080"
```

The extension has two responsibilities:

- Collect and restore tabs in the browser where the user invoked Tab Space.
- Relay the exact `https://app.mytab.space` dashboard to the authenticated
  local bridge owned by the Tab Space background helper.

## Connecting a browser

The bridge is a WebSocket server on a fixed loopback port, so finding it means
trying the ports in `portCandidates()` until one of them authenticates this
browser. **Every port is tried.** Each logged-in macOS account runs its own
helper and loopback ports are machine-wide, so the first helper to answer is
frequently another account's, which has never seen this browser; stopping at
that refusal is what left a paired browser unable to reach its own helper. The
port that last worked is tried first, as an ordering hint only — any process
can take a port at any time.

When no helper knows this browser, opening the popup sends `pairing.request`
to each helper that reported it as unknown. The helper raises a prompt in its
own macOS session and, if the person allows it, answers with the same payload a
`hello` success carries, token included. That prompt is the whole reason this is
safe on a shared Mac: the person who owns a library is the one who sees the
request, in their own session, and a request that reached the wrong account is
declined there.

Only the popup asks. Loading the Dashboard connects without asking, because a
restored browser session reopens Dashboard tabs with nobody at the keyboard and
a refused browser would otherwise be asked again on every reload. Requests carry
`trigger`, and a background wake-up — the reconnect alarm, a window gaining
focus — never asks either. An unpaired browser does not reconnect in the
background at all.

What the helper owes the extension for this to work:

- Refuse `pairing.request` at once — `pairing_not_visible` — when its macOS
  session is not on screen, instead of raising a prompt nobody can see. That
  answer is what lets the request move on to the next account's helper.
- Answer a refusal with `pairing_declined` and an unanswered prompt with
  `pairing_timeout`, sooner than the extension's 120-second budget.
- Keep sending `bridge.keepalive` on the socket while the prompt is open. A
  Chromium service worker or a Firefox event page with no traffic is suspended
  after about thirty seconds, and the approval would arrive at a socket that is
  no longer there.
- Refuse WebSocket handshakes whose `Origin` is a web page (`http:` or
  `https:`). Anything that can connect can ask, so a page that could reach the
  bridge could raise this prompt.

The popup shows the waiting state only once a request has been pending for a
moment: an app that predates approval refuses at once, and the popup goes
straight to the pairing code instead of flashing a wait that cannot resolve.

The six-digit pairing code remains as the fallback for everything the prompt
cannot cover: an app that predates it, a session reached over screen sharing,
a declined request. The popup offers it from the waiting state as well; typing
a code abandons the pending request rather than raising it on another account's
helper. The code is never sent together with the stored token, because the
helper authenticates the token first and would never consume the code.

Safari does not use either path. Its extension asks the app directly over
native messaging, a channel only this app's own extension can reach, and the
app's native handler issues a token there (`bridge.credential`). That pairs
Safari without reading the one-time code, which a person may be copying for
another browser at the same moment. An app that predates the operation answers
`unsupported_operation`, and the extension reads the code instead.

It never stores the session database. A save is considered successful only
after the macOS app acknowledges that it has persisted the session. The popup
can remember whether to open the Dashboard or close the saved tabs afterward;
tab closing still runs only after that acknowledgement.

The macOS tab switcher reaches this extension over the same bridge, through two
capabilities advertised separately at handshake: `switcher.tabs.v1` lists the
open tabs, and `switcher.tabs.close.v1` closes the ones the app has already
saved. They are separate so an app build that predates save-and-close still gets
tab listing, and a newer app knows not to ask an older extension to close
anything. The close reply reports how many tabs actually went away — measured
after the fact, not assumed — so the app can tell the user when tabs were saved
but stayed open.

AI requests, quota status, and subscription actions use that same authenticated
local bridge. StoreKit transactions and AI authentication material remain in
the Mac app/helper; the WebExtension only translates Dashboard commands and
returns the resulting UI payloads.

The popup saves all eligible tabs by default and keeps per-tab selection behind
the **Choose Tabs** disclosure. Its single destination menu can create a new
session or atomically append to an existing session through the helper. Sessions
tagged `@Trash` are excluded from the destination list and rejected again by the
helper at save time.
