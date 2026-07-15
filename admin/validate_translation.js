const fs = require('fs')
const path = require('path')

const sourceLocale = 'en-us'
const localesDirectory = path.join(__dirname, 'src', 'locales')
const metadataPath = path.join(localesDirectory, 'metadata.json')
const hardcodedAllowlistPath = path.join(__dirname, 'i18n-hardcoded-allowlist.json')
const sourceDirectory = path.join(__dirname, 'src')
const errors = []
const warnings = []

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    errors.push(`${path.relative(__dirname, filePath)}: ${error.message}`)
    return null
  }
}

function findDuplicateTopLevelKeys(filePath) {
  const source = fs.readFileSync(filePath, 'utf8')
  const keys = Array.from(source.matchAll(/^ {2}"([^"]+)"\s*:/gm), match => match[1])
  return keys.filter((key, index) => keys.indexOf(key) !== index)
}

function valueType(value) {
  return Array.isArray(value) ? 'array' : typeof value
}

function tokens(value) {
  if (typeof value !== 'string') return []
  return value.match(/\{\{?\s*[\w.-]+\s*\}?\}|%(?:\d+\$)?[a-z]/gi) || []
}

function htmlTags(value) {
  if (typeof value !== 'string') return []
  return Array.from(value.matchAll(/<\s*(\/?)\s*([a-z][\w-]*)\b[^>]*>/gi), match => `${match[1]}${match[2].toLowerCase()}`)
}

function validateString(code, key, source, translation) {
  if (!translation.trim()) errors.push(`${code}.${key}: translation is empty`)

  const sourceTokens = tokens(source).sort()
  const translationTokens = tokens(translation).sort()
  if (JSON.stringify(sourceTokens) !== JSON.stringify(translationTokens)) {
    errors.push(`${code}.${key}: placeholders differ (${sourceTokens.join(', ')} -> ${translationTokens.join(', ')})`)
  }

  const sourceTags = htmlTags(source)
  const translationTags = htmlTags(translation)
  if (JSON.stringify(sourceTags) !== JSON.stringify(translationTags)) {
    errors.push(`${code}.${key}: HTML tags differ (${sourceTags.join(', ')} -> ${translationTags.join(', ')})`)
  }

  if (code !== sourceLocale && translation === source) warnings.push(`${code}.${key}: identical to English`)
}

function validateValue(code, key, source, translation) {
  if (valueType(source) !== valueType(translation)) {
    errors.push(`${code}.${key}: expected ${valueType(source)}, found ${valueType(translation)}`)
    return
  }

  if (Array.isArray(source)) {
    if (source.length !== translation.length) {
      errors.push(`${code}.${key}: expected ${source.length} items, found ${translation.length}`)
      return
    }
    source.forEach((item, index) => {
      if (typeof item !== 'string' || typeof translation[index] !== 'string') {
        errors.push(`${code}.${key}[${index}]: array items must be strings`)
      } else {
        validateString(code, `${key}[${index}]`, item, translation[index])
      }
    })
    return
  }

  if (typeof source !== 'string') {
    errors.push(`${sourceLocale}.${key}: only strings and arrays of strings are supported`)
    return
  }
  validateString(code, key, source, translation)
}

function walk(directory, extension) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filePath = path.join(directory, entry.name)
    if (entry.isDirectory()) return walk(filePath, extension)
    return entry.name.endsWith(extension) ? [filePath] : []
  })
}

function normalizeLiteral(value) {
  return value.replace(/\s+/g, ' ').trim()
}

function findHardcodedUserFacingText(filePath) {
  const source = fs.readFileSync(filePath, 'utf8')
  const template = source.split('<script>')[0].replace(/<!--[\s\S]*?-->/g, '')
  const literals = []

  let text = ''
  let insideTag = false
  let quote = null
  for (const character of template) {
    if (!insideTag && character === '<') {
      const literal = normalizeLiteral(text.replace(/\{\{[\s\S]*?\}\}/g, ''))
      if (literal) literals.push(literal)
      text = ''
      insideTag = true
      continue
    }
    if (insideTag) {
      if (quote && character === quote) quote = null
      else if (!quote && (character === '"' || character === "'")) quote = character
      else if (!quote && character === '>') insideTag = false
      continue
    }
    text += character
  }
  for (const match of template.matchAll(/(?:^|\s)(?:placeholder|title|aria-label)="([^"{}]*[A-Za-z][^"{}]*)"/gm)) {
    literals.push(normalizeLiteral(match[1]))
  }
  return literals.filter(literal =>
    /[A-Za-z]/.test(literal) &&
    !/^(?:&[a-z]+;|\s|·)+$/i.test(literal) &&
    !/^[A-Z]$/.test(literal)
  )
}

const metadata = readJson(metadataPath) || []
const allowedHardcodedText = new Set(readJson(hardcodedAllowlistPath) || [])
const metadataCodes = metadata.map(locale => locale.code)
const duplicateCodes = metadataCodes.filter((code, index) => metadataCodes.indexOf(code) !== index)
if (duplicateCodes.length) errors.push(`metadata.json: duplicate locale codes: ${[...new Set(duplicateCodes)].join(', ')}`)

const localeFiles = fs.readdirSync(localesDirectory)
  .filter(fileName => fileName.endsWith('.json') && fileName !== 'metadata.json')
const fileCodes = localeFiles.map(fileName => path.basename(fileName, '.json'))

for (const code of metadataCodes.filter(code => !fileCodes.includes(code))) {
  errors.push(`metadata.json: missing locale file for ${code}`)
}
for (const code of fileCodes.filter(code => !metadataCodes.includes(code))) {
  errors.push(`${code}.json: locale is missing from metadata.json`)
}

const locales = {}
for (const fileName of localeFiles) {
  const filePath = path.join(localesDirectory, fileName)
  const code = path.basename(fileName, '.json')
  const duplicateKeys = findDuplicateTopLevelKeys(filePath)
  if (duplicateKeys.length) errors.push(`${fileName}: duplicate keys: ${[...new Set(duplicateKeys)].join(', ')}`)
  locales[code] = readJson(filePath)
}

const english = locales[sourceLocale]
if (!english) {
  errors.push(`Missing source locale: ${sourceLocale}.json`)
} else {
  const sourceKeys = Object.keys(english)
  for (const code of metadataCodes) {
    const translation = locales[code]
    if (!translation) continue
    const translationKeys = Object.keys(translation)
    const missingKeys = sourceKeys.filter(key => !translationKeys.includes(key))
    const extraKeys = translationKeys.filter(key => !sourceKeys.includes(key))
    if (missingKeys.length) errors.push(`${code}.json: missing keys: ${missingKeys.join(', ')}`)
    if (extraKeys.length) errors.push(`${code}.json: extra keys: ${extraKeys.join(', ')}`)
    for (const key of sourceKeys.filter(key => translationKeys.includes(key))) {
      validateValue(code, key, english[key], translation[key])
    }
  }
}

for (const filePath of walk(sourceDirectory, '.vue')) {
  for (const literal of findHardcodedUserFacingText(filePath)) {
    if (!allowedHardcodedText.has(literal)) {
      errors.push(`${path.relative(__dirname, filePath)}: hardcoded user-facing text: "${literal}"`)
    }
  }
}

if (warnings.length) {
  console.warn(`Translation warnings (${warnings.length}):`)
  warnings.forEach(warning => console.warn(`- ${warning}`))
}

if (errors.length) {
  console.error(`Translation validation failed (${errors.length}):`)
  errors.forEach(error => console.error(`- ${error}`))
  process.exit(1)
}

console.log(`Translation validation passed: ${metadataCodes.length} locales, ${Object.keys(english).length} keys each.`)
