Tab Space saves, organizes, and restores browser tabs. Version 4.0 (currently
in RC) adds Chrome, Microsoft Edge, and Firefox support through a companion
extension while Safari stays built in, and the session database remains in the
native Mac app.

This repository is public so the web-facing code can be audited: the marketing
site, the Admin dashboard, and the shared Chrome/Edge/Firefox WebExtension. It
**does not contain** the Xcode project that builds the native Mac apps and
Safari extensions, which remain closed-source. Session storage, iCloud sync,
and AI requests are handled by the native app.

## What's in this repository

- The marketing site at the repository root, served at <https://mytab.space>.
- The Admin dashboard in `admin/` (Vue 2), served at <https://app.mytab.space>.
- The shared browser extension in `extension/`, built from one source tree into
  Chrome, Microsoft Edge, and Firefox packages.

The extension never stores the session database: a save is acknowledged only
after the macOS app has persisted the session, browser-to-helper traffic stays
on the loopback interface, and pairing codes are one-time use. Its behavior is
documented in [extension/README.md](extension/README.md); RC installation is in
[extension/INSTALL.md](extension/INSTALL.md).

## Building and verifying from source

The Admin dashboard:

```bash
cd admin
yarn install --frozen-lockfile
yarn serve
```

The browser extension. Packages in `extension/dist/` are intentionally not
committed, so build them from source to verify what is distributed:

```bash
node extension/build.mjs all
node --test extension/test/*.test.cjs
```

The dashboard requires Tab Space 4.0 for Mac plus the Safari extension or a
paired companion browser extension.

## Contributing

### Translation

- [Translation page](https://mytab.space/translate.html) for email suggestions
- [Translation guide](TRANSLATING.md) for pull requests

### Issues

Report bugs and request features at
<https://github.com/yuanzhoucq/Tab-Space/issues>.

## License

[AGPL-3.0-only](LICENSE)

## Related links

- [Tab Space Homepage](https://mytab.space)
- [Privacy policy](https://mytab.space/privacy.html)
- [Changelog](https://mytab.space/changelog.html)
- [Product Hunt page](https://www.producthunt.com/products/tab-space)
- [中文介绍](https://sspai.com/post/56315)
