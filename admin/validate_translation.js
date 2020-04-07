const LangData = require("./src/lang.json")
const assert = require("assert")

const enUsKeys = Object.keys(LangData["en-us"]).sort()
for (let language in LangData) {
    if (language !== "en-us") {
        assert.deepStrictEqual(enUsKeys, Object.keys(LangData[language]).sort())
    }
}