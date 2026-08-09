import { languages } from './locales'

const constants = {
    settings: [
        "ignore-pinned-tabs",
        "ignore-duplicated-tabs",
        "save-all-windows",
        "remove-site-after-click",
        "shift-shortcuts",
        "disable-shortcuts",
        "disable-context-menus"
    ],
    preferredLanguageKey: "preferred-language",
    languages,
    externalBrowser1Key: "externalBrowser1",
    externalBrowser2Key: "externalBrowser2",
    // AI (protocol v2). suggested-tags is a native default the user can edit in
    // Settings; the AI messages themselves only appear when the native protocol
    // version is >= aiMinProtocolVersion.
    suggestedTagsKey: "suggested-tags",
    aiMinProtocolVersion: 2,
    // AI data-flow disclosure (design §7). The native side refuses every AI
    // request with "consent_required" until this default matches its
    // AIConsent.currentVersion, so these two must be bumped together.
    aiConsentVersionKey: "ai-data-disclosure-accepted-version",
    aiConsentVersion: 1,
    autoEnhanceKey: "ai-auto-enhance-enabled",
    // Mirrors CommercializationConfig.freeSessionLimit on the native side. The
    // native app stays the authority: this only stops the dashboard from
    // creating a card the native side is going to refuse.
    freeSessionLimit: 5,
    // Locally created sessions carry a "new-<timestamp>" uuid until the native
    // side accepts them and echoes back a real one.
    newSessionUuidPrefix: "new-",
    // The release the What's New dialog introduces. Bumping this shows it once
    // more; the copy in the whatsNew* locale keys has to be updated with it.
    whatsNewVersion: "4.1",
    // The tab switcher's factory shortcut. The real one is a native default the
    // user can rebind, and no bridge message reports it back, so this is what
    // the dashboard shows — always alongside the note that it can be changed.
    switcherShortcut: "⌥Tab",
    // Advertised by the local bridge from 4.1 on. Companion browsers only reach
    // the switcher through that helper, so its absence means the installed app
    // predates the feature. Safari talks over the direct bridge, which carries
    // no capability list, and is assumed to have it.
    switcherCapability: "switcher.tabs.v1",
    // The Safari bridge cannot distinguish app 4.0 from 4.1 yet: both report
    // protocol v2 and no capability list. Keep the standing dashboard hint off
    // everywhere until every bridge can prove the switcher is available.
    switcherHintEnabled: false,
    defaultSuggestedTags: {
        "en-us": "Shopping, Development, Social, News, Video, Finance, Research, Entertainment, Work, Travel, Learning",
        "zh-cn": "购物, 开发, 社交, 新闻, 视频, 金融, 研究, 娱乐, 工作, 旅行, 学习"
    },
    browsers: [
        "Google Chrome",
        "Microsoft Edge",
        "FireFox",
        "Arc",
        "Brave Browser"
    ]
}

export default constants
