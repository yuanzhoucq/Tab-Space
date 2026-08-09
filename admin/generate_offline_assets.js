const fs = require('fs')
const path = require('path')

const distDirectory = path.join(__dirname, 'dist')
const indexPath = path.join(distDirectory, 'index.html')
const smallImageLimit = 64 * 1024
const offlineAssetMetaPattern = /\s*<meta\s+name=["']tab-space-offline-assets["'][^>]*>/i

function filesBelow(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const entryPath = path.join(directory, entry.name)
    return entry.isDirectory() ? filesBelow(entryPath) : [entryPath]
  })
}

function relativeUrl(filePath) {
  return `./${path.relative(distDirectory, filePath).split(path.sep).join('/')}`
}

const alwaysCached = ['js', 'css', 'fonts']
  .flatMap(directory => filesBelow(path.join(distDirectory, directory)))
const smallImages = filesBelow(path.join(distDirectory, 'img'))
  .filter(filePath => fs.statSync(filePath).size <= smallImageLimit)
const faviconPath = path.join(distDirectory, 'favicon.ico')
const assetUrls = Array.from(new Set([
  ...alwaysCached,
  ...smallImages,
  ...(fs.existsSync(faviconPath) ? [faviconPath] : [])
].map(relativeUrl))).sort()

if (!assetUrls.length) {
  throw new Error('No offline assets were found in the production build')
}

const meta = `<meta name="tab-space-offline-assets" content="${assetUrls.join(' ')}">`
const html = fs.readFileSync(indexPath, 'utf8')
const withoutPreviousMeta = html.replace(offlineAssetMetaPattern, '')

if (!withoutPreviousMeta.includes('</head>')) {
  throw new Error('Could not inject the offline asset list: index.html has no closing head tag')
}

fs.writeFileSync(indexPath, withoutPreviousMeta.replace('</head>', `${meta}</head>`))
console.log(`Prepared ${assetUrls.length} assets for complete offline use`)
