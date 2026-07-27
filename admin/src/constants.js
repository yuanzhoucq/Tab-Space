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
