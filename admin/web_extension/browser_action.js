let port = 53791
let retry = 0
let ws
let langData
let allTabs
let savableTabs
let activeSavableTabs

function connectWebSocketServer() {
    ws = new WebSocket(`ws://localhost:${port + 17 * (retry++)}`);
    ws.onopen = () => { 
        console.log("Connected to Tab Space...")
    };
    ws.onerror = () => {
        if (retry <= 10)
            connectWebSocketServer()
        else 
            alert("Tab Space not running. Please open Tab Space app first.")
    }
}

function setBtnAction(id, action) {
    const elem = document.getElementById(id)
    elem.textContent = getLocaleValue(id)
    elem.onclick = action
}


function openTabSpace() {
    const tabSpaceUrl = chrome.extension.getURL("dist/index.html")
    chrome.tabs.query({windowId: chrome.windows.WINDOW_ID_CURRENT}, (tabs) => {
        const openedTabSpaces = tabs.filter(tab => tab.url.indexOf(tabSpaceUrl) === 0)
        chrome.tabs.remove(openedTabSpaces.map(tab => tab.id))
    })
    chrome.tabs.create({url: tabSpaceUrl});
}

function saveTabs(keep = false) {
    const sites = savableTabs.map(tab => {return {title: tab.title, url: tab.url}})
        if (!keep) {
            allTabs.forEach(tab => chrome.tabs.remove(tab.id));
        }
        const msg = {cmd: "AppendSessions", bookmarks: JSON.stringify([{
            timestamp: parseInt(Date.now() / 1000),
            sites, title: "", tags: []
        }])}
    ws.send(JSON.stringify(msg))
    openTabSpace()
}

function saveCurrent() {
    const tab = activeSavableTabs[0]
    const site = {title: tab.title, url: tab.url}
    const msg = {cmd: "AppendSessions", bookmarks: JSON.stringify([{
        timestamp: parseInt(Date.now() / 1000),
        sites: [site], title: "", tags: []
    }])}
    ws.send(JSON.stringify(msg))
    openTabSpace()
}

function saveClose() {
    saveTabs()
}

function saveKeep() {
    saveTabs(true)
}

function getLocaleValue(key) {
    const lang = navigator.language.toLowerCase()
    return (langData[lang] && langData[lang][key]) || langData["en-us"][key]
}

chrome.tabs.query({windowId: chrome.windows.WINDOW_ID_CURRENT}, (tabs) => {
    allTabs = tabs
    savableTabs = tabs.filter(tab => !(tab.url.startsWith("chrome://") 
                                        || tab.url.startsWith("edge://")
                                        || tab.url.startsWith("chrome-extension://")
                                        || tab.url.startsWith("moz-extension://")
                                        || tab.url.startsWith("about:")
                                        ))
    activeSavableTabs = savableTabs.filter(tab => tab.active)
    document.getElementById("saveAndCloseTabs").disabled = savableTabs.length === 0
    document.getElementById("saveAndKeepTabs").disabled = savableTabs.length === 0
    document.getElementById("saveCurrentTab").disabled = activeSavableTabs.length === 0
})

connectWebSocketServer()
fetch("dist/lang.json").then(r => r.json()).then(ld => {
    langData = ld
    setBtnAction("ctrlT", openTabSpace)
    setBtnAction("saveAndCloseTabs", saveClose)
    setBtnAction("saveAndKeepTabs", saveKeep)
    setBtnAction("saveCurrentTab", saveCurrent)
})
