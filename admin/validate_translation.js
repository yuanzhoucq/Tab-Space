const LangData = require("./src/lang.json")
const assert = require("assert")

const enUsKeys = Object.keys(LangData["en-us"])
let extraKeysLength = 0
for (let lang in LangData) {
    if (lang !== "en-us") {
        console.log(`\x1b[1m\x1b[33m\n### Examining language "${lang}": ###\x1b[0m`)
        const langKeys = Object.keys(LangData[lang])
        const missingKeys = enUsKeys.filter(key => !langKeys.includes(key)).sort()
        const extraKeys = langKeys.filter(key => !enUsKeys.includes(key)).sort()
        console.log(`* Translation coverage: \x1b[32m${(100 * (1 - missingKeys.length / enUsKeys.length)).toFixed(2)}%\x1b[0m`)
        console.log(`* Missing keys: \x1b[35m${missingKeys}\x1b[0m`)
        console.log(`* Extra keys to remove: \x1b[31m${extraKeys}\x1b[0m`)
        extraKeysLength += extraKeys.length
    }
}

assert(extraKeysLength === 0)
