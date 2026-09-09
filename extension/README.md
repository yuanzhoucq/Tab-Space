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
