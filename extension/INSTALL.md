# Install the Tab Space 4.0 RC browser extension

The Chrome, Edge, and Firefox packages all require Tab Space 4.0 RC for Mac.
Launch the Mac app once to enable its background browser helper. After that,
the main window and app do not need to remain open while you save, browse, or
restore sessions.

## Chrome

1. Unzip `tab-space-4.0.0-chrome.zip`.
2. Open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**.
3. Select the unzipped folder.

## Microsoft Edge

1. Unzip `tab-space-4.0.0-edge.zip`.
2. Open `edge://extensions`, enable Developer mode, and choose **Load unpacked**.
3. Select the unzipped folder.

## Firefox 121 or later

For RC testing, open `about:debugging#/runtime/this-firefox`, choose **Load
Temporary Add-on**, and select the Firefox package or its `manifest.json`.
Temporary add-ons are removed when Firefox closes. A signed AMO package is
required for permanent installation after the RC is approved.

For localhost development, load `extension/dist/firefox-dev/manifest.json`.
Firefox does not reload a temporary add-on when files on disk change: after
running `yarn serve:extension`, click **Reload** beside Tab Space (Dev) in
`about:debugging`, then reload `http://127.0.0.1:8080`.

## Pair a browser

1. Open Tab Space on your Mac.
2. Click **Browser Pairing Code…** in the Tab Space main window.
3. Open the Tab Space extension and enter the six-digit code.

The code is one-time use. The extension keeps its issued token in browser-local
extension storage, while the Mac app keeps the matching credential in Keychain.
Browser-to-helper traffic stays on the loopback interface (`127.0.0.1`). The
helper also keeps the shared CloudKit container active and relays remote iCloud
session changes to connected browsers.
