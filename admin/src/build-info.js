const sha = process.env.VUE_APP_BUILD_SHA || ""

export default {
  sha,
  shortSha: sha ? sha.slice(0, 7) : "dev",
  time: process.env.VUE_APP_BUILD_TIME || "",
  commitUrl: sha ? `https://github.com/yuanzhoucq/Tab-Space/commit/${sha}` : ""
}
