import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const extensionRoot = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(extensionRoot, "..")
const argumentsList = process.argv.slice(2)
const development = argumentsList.includes("dev")
const targets = argumentsList.filter(argument => argument !== "dev")
const requestedTargets = targets.length === 0 || targets.includes("all")
  ? ["chrome", "edge", "firefox"]
  : targets

const supportedTargets = new Set(["chrome", "edge", "firefox"])
for (const target of requestedTargets) {
  if (!supportedTargets.has(target)) {
    throw new Error(`Unsupported extension target: ${target}`)
  }
}

const productionDashboardOrigin = "https://app.mytab.space"
const dashboardOrigin = development ? "http://127.0.0.1:8080" : productionDashboardOrigin
const outputName = target => development ? `${target}-dev` : target
const packageName = target => `tab-space-4.0.0-${target}${development ? "-dev" : ""}.zip`

const baseManifest = {
  manifest_version: 3,
  name: development ? "Tab Space (Dev)" : "Tab Space",
  version: "4.0.0",
  description: "Save, organize, and restore tabs with the Tab Space app.",
  permissions: ["tabs", "storage"],
  host_permissions: [
    `${dashboardOrigin}/*`,
    "http://127.0.0.1/*"
  ],
  action: {
    default_title: "Tab Space",
    default_popup: "popup.html",
    default_icon: {
      "16": "toolbar-16.png",
      "32": "toolbar-32.png",
      "48": "toolbar-48.png",
      "128": "toolbar-128.png"
    }
  },
  icons: {
    "16": "icon.png",
    "32": "icon.png",
    "48": "icon.png",
    "128": "icon.png"
  },
  content_scripts: [{
    matches: [`${dashboardOrigin}/*`],
    js: ["content-script.js"],
    run_at: "document_start"
  }],
  commands: {
    "save-current-tab": {
      suggested_key: { default: "Ctrl+Shift+S", mac: "MacCtrl+Shift+S" },
      description: "Save the current tab"
    },
    "open-tab-space": {
      suggested_key: { default: "Ctrl+Shift+T", mac: "MacCtrl+Shift+T" },
      description: "Open Tab Space"
    }
  },
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'; connect-src ws://127.0.0.1:*"
  }
}

function manifestFor(target) {
  const manifest = structuredClone(baseManifest)
  if (target === "firefox") {
    // Firefox names these properties after the toolbar text color: a dark
    // icon is used with dark text (light toolbar), and vice versa.
    manifest.action.theme_icons = [
      { size: 16, dark: "toolbar-16.png", light: "toolbar-light-16.png" },
      { size: 32, dark: "toolbar-32.png", light: "toolbar-light-32.png" }
    ]
    if (development) {
      // Firefox match patterns do not support port numbers. Match the
      // loopback host here; content-script.js still rejects every origin
      // except the exact http://127.0.0.1:8080 development origin at runtime.
      manifest.host_permissions = ["http://127.0.0.1/*"]
      manifest.content_scripts[0].matches = ["http://127.0.0.1/*"]
    }
    manifest.background = { scripts: ["background.js"] }
    manifest.browser_specific_settings = {
      gecko: {
        id: "extension@mytab.space",
        strict_min_version: "121.0"
      }
    }
  } else {
    manifest.permissions.push("offscreen")
    manifest.background = { service_worker: "background.js" }
    manifest.version_name = development ? "4.0 RC Dev" : "4.0 RC"
  }
  return manifest
}

const distributionRoot = join(extensionRoot, "dist")
await mkdir(distributionRoot, { recursive: true })

for (const target of requestedTargets) {
  const output = join(distributionRoot, outputName(target))
  // Production and development extensions intentionally live side by side.
  // Only replace the targets requested by this invocation so rebuilding a
  // release never silently removes an unpacked localhost debugging build.
  await rm(output, { recursive: true, force: true })
  await mkdir(output, { recursive: true })
  await cp(join(extensionRoot, "src"), output, { recursive: true })
  await cp(join(repositoryRoot, "icon.png"), join(output, "icon.png"))
  for (const size of [16, 32, 48, 128]) {
    await cp(join(extensionRoot, "assets", `toolbar-${size}.png`), join(output, `toolbar-${size}.png`))
    await cp(join(extensionRoot, "assets", `toolbar-light-${size}.png`), join(output, `toolbar-light-${size}.png`))
  }
  if (development) {
    for (const filename of ["background.js", "content-script.js"]) {
      const scriptPath = join(output, filename)
      const script = await readFile(scriptPath, "utf8")
      await writeFile(scriptPath, script.replaceAll(productionDashboardOrigin, dashboardOrigin))
    }
  }
  await writeFile(
    join(output, "manifest.json"),
    `${JSON.stringify(manifestFor(target), null, 2)}\n`
  )
}

const packagesDirectory = join(distributionRoot, "packages")
await mkdir(packagesDirectory, { recursive: true })
for (const target of requestedTargets) {
  const filename = packageName(target)
  await rm(join(packagesDirectory, filename), { force: true })
  execFileSync("zip", ["-qr", join(packagesDirectory, filename), "."], {
    cwd: join(extensionRoot, "dist", outputName(target))
  })
}

const summary = requestedTargets.map(target => `extension/dist/packages/${packageName(target)}`).join(", ")
process.stdout.write(`Built Tab Space 4.0 ${development ? "development " : ""}extension: ${summary}\n`)
