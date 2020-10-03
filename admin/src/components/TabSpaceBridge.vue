<template>
  <div id="bridgeStorage" height="0" style="border: none"></div>
</template>

<script>
import { mapState } from "vuex";
import Constants from "../constants";
import Config from "../config";

let port = Config.webSocketInitPort;
let connected = false; // to differentiate "really close" and "fail to connect then close"
let retry = 0;

export default {
  name: "TabSpaceBridge",
  computed: {
    ...mapState(["bridge"]),
    sessions: {
      get() {
        return this.$store.state.sessions;
      },
      set(value) {
        this.$store.commit("setSessions", value);
      },
    },
  },
  mounted() {
    this.connectWebSocketServer();
  },
  methods: {
    connectWebSocketServer() {
      let ws = new WebSocket(`ws://localhost:${port + 17 * retry++}`);
      ws.onopen = () => {
        console.log("Connection open ...");
        connected = true;
        this.$store.commit("setBridge", {
          send: (msg) => {
            console.log(msg)
            msg.bookmarks = JSON.stringify(msg.bookmarks);
            ws.send(JSON.stringify(msg));
          },
        });
        this.checkDefaults();
      };
      ws.onmessage = (evt) => {
        console.log("Received Message: " + evt.data.slice(0, 100) + "...");
        try {
          const nevt = { data: JSON.parse(evt.data) };
          if (typeof nevt.data.bookmarks === "string") {
            nevt.data.bookmarks = JSON.parse(nevt.data.bookmarks)
          }
          switch (nevt.data.cmd) {
            case "ReturnBookmarks":
              console.log("Received checked bookmarks from Tab Space.app.");
              this.syncBookmarks(nevt);
              break;
            case "ReturnDefault":
              this.$store.commit("setTabSpaceSetting", {
                key: nevt.data.id,
                value: nevt.data.value,
              });
          }
        } catch (e) {
          console.log(e);
        }
      };
      ws.onclose = () => {
        console.log("Connection closed.");
        if (connected) {
          retry = 0;
          connected = false;
          this.connectWebSocketServer();
        }
      };
      ws.onerror = () => {
        if (retry <= 10) this.connectWebSocketServer();
        else {
          alert(
            "Tab Space not running. Continue to open Tab Space and reconnect."
          );
          window.location.href = "tabspace://";
          setInterval(() => {
            window.location.reload();
          }, 1000);
        }
      };
    },
    checkDefaults() {
      this.bridge.send({
        cmd: "CheckDefault",
        name: Constants.preferredLanguageKey,
      });
      Constants.settings.forEach((setting) => {
        this.bridge.send({ cmd: "CheckDefault", name: setting });
      });
      this.bridge.send({ cmd: "CheckBookmarks" });
    },
    syncBookmarks(evt) {
      try {
        const bookmarks = evt.data.bookmarks;
        this.sessions = bookmarks;
      } catch (e) {
        console.log("Synced bookmarks are not valid.");
      }
    },
  },
};
</script>
