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

AI requests, quota status, and subscription actions use that same authenticated
local bridge. StoreKit transactions and AI authentication material remain in
the Mac app/helper; the WebExtension only translates Dashboard commands and
returns the resulting UI payloads.

The popup saves all eligible tabs by default and keeps per-tab selection behind
the **Choose Tabs** disclosure. Its single destination menu can create a new
session or atomically append to an existing session through the helper. Sessions
tagged `@Trash` are excluded from the destination list and rejected again by the
helper at save time.
