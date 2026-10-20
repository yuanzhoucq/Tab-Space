const assert = require("node:assert/strict")
const { readFile } = require("node:fs/promises")
const { execFile } = require("node:child_process")
const { promisify } = require("node:util")
const { join } = require("node:path")
const test = require("node:test")

const run = promisify(execFile)
const extensionRoot = join(__dirname, "..")

test("builds the Safari MV3 manifest without other-browser keys", async () => {
  await run(process.execPath, ["build.mjs", "safari"], { cwd: extensionRoot })
  const manifest = JSON.parse(await readFile(join(extensionRoot, "dist/safari/manifest.json"), "utf8"))

  assert.equal(manifest.manifest_version, 3)
  assert.deepEqual(manifest.background, { scripts: ["background.js"] })
  assert.deepEqual(manifest.host_permissions, ["<all_urls>"])
  assert.ok(manifest.permissions.includes("nativeMessaging"))
  assert.ok(manifest.permissions.includes("contextMenus"))
  assert.ok(manifest.permissions.includes("webNavigation"))
  assert.equal(manifest.action.default_popup, "popup.html")
  assert.deepEqual(manifest.content_scripts.at(-2), {
    matches: ["https://app.mytab.space/*"],
    js: ["safari/content-script.js"],
    run_at: "document_start",
    world: "MAIN"
  })
  assert.deepEqual(manifest.content_scripts.at(-1), {
    matches: ["<all_urls>"],
    js: ["safari/page-shortcuts.js"],
    run_at: "document_start"
  })
  assert.equal("browser_specific_settings" in manifest, false)
  assert.equal("theme_icons" in manifest.action, false)
  // The App Extension's shortcuts live in page-shortcuts.js; a `commands`
  // block would double-fire them when Shift shortcuts are enabled.
  assert.equal("commands" in manifest, false)
  // Safari 17 blocks the loopback bridge under any connect-src; see build.mjs.
  assert.equal(manifest.content_security_policy.extension_pages, "script-src 'self'; object-src 'self'")
  // The one package whose content script replies through the direct bridge:
  // it alone also ships safari/content-script.js to receive those replies.
  const contentScript = await readFile(join(extensionRoot, "dist/safari/content-script.js"), "utf8")
  assert.match(contentScript, /const SAFARI_DIRECT_BRIDGE = true/)
  // Safari pairs itself and saves for free: its popup drops the companion
  // browsers' pairing code and Pro gate. The other packages keep both.
  assert.match(await readFile(join(extensionRoot, "dist/safari/popup.js"), "utf8"), /const POPUP_TARGET = "safari"/)
  assert.match(await readFile(join(extensionRoot, "src/popup.js"), "utf8"), /const POPUP_TARGET = "companion"/)
  assert.deepEqual(manifest.icons, { 16: "icon-16.png", 32: "icon-32.png", 48: "icon-48.png", 128: "icon-128.png" })
  // Safari's own render of the blue drawing, lighter to match its SF Symbols.
  for (const size of [16, 32, 48, 128]) {
    assert.deepEqual(
      await readFile(join(extensionRoot, `dist/safari/toolbar-${size}.png`)),
      await readFile(join(extensionRoot, `assets/toolbar-safari-${size}.png`))
    )
  }
  const background = await readFile(join(extensionRoot, "dist/safari/background.js"), "utf8")
  assert.match(background, /const BUILD_TARGET = "safari"/)
  assert.match(background, /BUILD_TARGET === "safari"\s*\? "safari"/)
  assert.match(background, /native\.send\(\{ op: "bridge\.pairingCode" \}\)/)
  assert.ok(background.indexOf("const APPLICATION_ID") < background.indexOf("const BUILD_TARGET"))
  assert.match(background, /\}\)\n+;\n\(function \(root, factory\)/)
  assert.doesNotThrow(() => new Function(background))
})
