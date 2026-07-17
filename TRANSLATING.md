# Translating Tab Space

Tab Space keeps the contribution path simple: developers can submit pull requests, while everyone else can send translation suggestions by email from the [translation page](https://mytab.space/translate.html).

## Workflow

1. Add or revise the source text in `admin/src/locales/en-us.json`.
2. Give an AI translation tool the source text, the key name, the UI context, and the existing strings in each target locale. Treat the result as a draft.
3. Update every locale file in `admin/src/locales/`. Preserve placeholders, HTML tags, product names, and keyboard shortcuts exactly.
4. Run the checks from the admin directory:

   ```sh
   npm run i18n:check
   ```

5. Review warnings about strings that are identical to English. Some product names and borrowed words are valid, but accidental English should be corrected.
6. Open a pull request. Feedback from a fluent speaker should take priority over an AI draft.

## Translation notes

- Do not translate `Tab Space`, `Safari`, browser names, file extensions, or keyboard key labels.
- Translate for the interface rather than word for word. Keep buttons and labels concise.
- Preserve the value type and number of array items from `en-us.json`.
- Preserve placeholders and the structure of HTML tags.
- Use the existing locale as a glossary so repeated concepts stay consistent.

## Adding a language

Add `<language-code>.json`, register its code and display name in `admin/src/locales/metadata.json`, import it in `admin/src/locales/index.js`, and run the translation check.

## Email suggestions

Non-developers can email `support@mytab.space`. Please include the language, current wording, suggested wording, and where the text appears. The maintainer can use AI to organize the feedback and apply it to the locale file; contributors do not need to use GitHub.
