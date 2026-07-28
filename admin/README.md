# tab-space-admin

Translation files live in `src/locales`. See [`../TRANSLATING.md`](../TRANSLATING.md), and run `npm run i18n:check` after changing user-facing text.

## Favicons

The dashboard loads `/favicon.ico` from each saved site's own origin. This keeps
the feature usable in both mainland China and other regions without depending on
Google, another favicon API, or a Tab Space proxy.

The service worker stores those cross-origin image responses in the
`tab-space-favicons-v1` Cache Storage cache. It is cache-first, shared by every
tab from the same origin, and kept independently from the versioned app-shell
cache. Increment the favicon cache version when a product change should refresh
all saved icons. Invalid or unavailable icons fall back to the bundled webpage
icon.

## Project setup
```
npm install
```

### Compiles and hot-reloads for development
```
npm run serve
```

### Compiles and minifies for production
```
npm run build
```

### Run your tests
```
npm run test
```

### Lints and fixes files
```
npm run lint
```

### Customize configuration
See [Configuration Reference](https://cli.vuejs.org/config/).
