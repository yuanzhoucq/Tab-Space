import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { extensionVersion } from "./version.mjs"

const extensionRoot = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(extensionRoot, "..")
const argumentsList = process.argv.slice(2)
const development = argumentsList.includes("dev")
const dashboardFlag = "--dashboard="
const dashboardArgument = argumentsList.find(argument => argument.startsWith(dashboardFlag))
const targets = argumentsList.filter(argument =>
  argument !== "dev" && !argument.startsWith(dashboardFlag))
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
const localDashboardOrigin = "http://127.0.0.1:8080"
// Cloudflare Pages gives every Admin preview branch its own hostname, so
// development builds trust the whole preview domain instead of one branch.
const developmentDashboardSuffixes = ["tab-space-admin.pages.dev"]
const previewDashboardOrigin = "https://dev-4-0.tab-space-admin.pages.dev"

if (dashboardArgument && !development) {
  throw new Error(`${dashboardFlag}<origin> only applies to development builds.`)
}

const requestedDashboardOrigin = dashboardArgument
  ? new URL(dashboardArgument.slice(dashboardFlag.length)).origin
  : ""
// The first origin is the one the toolbar and keyboard shortcut open. Development
// builds default to the branch preview; pass --dashboard=http://127.0.0.1:8080 to
// open the local server instead. Both stay trusted either way.
const dashboardOrigins = development
  ? [...new Set([requestedDashboardOrigin || previewDashboardOrigin, localDashboardOrigin])]
  : [productionDashboardOrigin]
const dashboardOriginSuffixes = development ? developmentDashboardSuffixes : []
const outputName = target => development ? `${target}-dev` : target
const packageName = target => `tab-space-${extensionVersion}-${target}${development ? "-dev" : ""}.zip`

// Firefox rejects explicit ports in match patterns, so its loopback pattern is
// widened to the host. content-script.js still enforces the exact development
// origin at runtime. A leading `*.` matches the domain itself on both engines.
function dashboardMatchPatterns(target) {
  const exact = dashboardOrigins.map(origin =>
    target === "firefox" && /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)
      ? "http://127.0.0.1/*"
      : `${origin}/*`)
  const wildcard = dashboardOriginSuffixes.map(suffix => `https://*.${suffix}/*`)
  return [...new Set([...exact, ...wildcard])]
}

const baseManifest = {
  manifest_version: 3,
  name: development ? "Tab Space (Dev)" : "Tab Space",
  version: extensionVersion,
  description: "Save, organize, and restore tabs with the Tab Space app.",
  permissions: ["tabs", "storage"],
  host_permissions: [],
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
    matches: [],
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
  const matches = dashboardMatchPatterns(target)
  manifest.content_scripts[0].matches = matches
  manifest.host_permissions = [...new Set([...matches, "http://127.0.0.1/*"])]
  if (target === "firefox") {
    // Firefox names these properties after the toolbar text color: a dark
    // icon is used with dark text (light toolbar), and vice versa.
    manifest.action.theme_icons = [
      { size: 16, dark: "toolbar-16.png", light: "toolbar-light-16.png" },
      { size: 32, dark: "toolbar-32.png", light: "toolbar-light-32.png" }
    ]
    manifest.background = { scripts: ["background.js"] }
    manifest.browser_specific_settings = {
      gecko: {
        id: "extension@mytab.space",
        strict_min_version: "121.0",
        // Required by addons.mozilla.org. Tab data is only relayed to the
        // Tab Space helper on the user's own device, so nothing is collected.
        data_collection_permissions: {
          required: ["none"]
        }
      }
    }
  } else {
    manifest.permissions.push("offscreen")
    manifest.background = { service_worker: "background.js" }
    manifest.version_name = development ? "4.0 RC Dev" : "4.0 RC"
  }
  return manifest
}

function developmentScript(script, filename) {
  const rewritten = script
    .replace(
      /const DASHBOARD_ORIGINS = \[[^\]]*\]/,
      `const DASHBOARD_ORIGINS = ${JSON.stringify(dashboardOrigins)}`
    )
    .replace(
      /const DASHBOARD_ORIGIN_SUFFIXES = \[[^\]]*\]/,
      `const DASHBOARD_ORIGIN_SUFFIXES = ${JSON.stringify(dashboardOriginSuffixes)}`
    )
  if (rewritten.includes(productionDashboardOrigin)) {
    throw new Error(`Development ${filename} still trusts the production dashboard origin.`)
  }
  return rewritten
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
      await writeFile(scriptPath, developmentScript(script, filename))
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
  // Excluding dotfiles keeps a stray .DS_Store copied out of src/ from being
  // published as part of the extension.
  execFileSync("zip", ["-qr", join(packagesDirectory, filename), ".", "-x", ".*", "*/.*"], {
    cwd: join(extensionRoot, "dist", outputName(target))
  })
}

const summary = requestedTargets.map(target => `extension/dist/packages/${packageName(target)}`).join(", ")
process.stdout.write(`Built Tab Space 4.0 ${development ? "development " : ""}extension: ${summary}\n`)
