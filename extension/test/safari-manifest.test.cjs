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
  assert.deepEqual(manifest.content_scripts.at(-1), {
    matches: ["<all_urls>"],
    js: ["safari/content-script.js"],
    run_at: "document_start"
  })
  assert.equal("browser_specific_settings" in manifest, false)
  assert.equal("theme_icons" in manifest.action, false)
  const background = await readFile(join(extensionRoot, "dist/safari/background.js"), "utf8")
  assert.match(background, /const BUILD_TARGET = "safari"/)
  assert.match(background, /BUILD_TARGET === "safari"\s*\? "safari"/)
  assert.match(background, /native\.send\(\{ op: "bridge\.pairingCode" \}\)/)
  assert.ok(background.indexOf("const APPLICATION_ID") < background.indexOf("const BUILD_TARGET"))
  assert.match(background, /\}\)\n+;\n\(function \(root, factory\)/)
  assert.doesNotThrow(() => new Function(background))
})
