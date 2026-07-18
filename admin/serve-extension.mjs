import { execFileSync, spawn } from "node:child_process"
import net from "node:net"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const adminRoot = dirname(fileURLToPath(import.meta.url))
const host = "127.0.0.1"
const port = 8080

execFileSync(process.execPath, [resolve(adminRoot, "../extension/build.mjs"), "dev"], {
  stdio: "inherit"
})

const portAvailable = await new Promise((resolveAvailable, reject) => {
  const socket = net.createConnection({ host, port })
  socket.setTimeout(1000)
  socket.once("connect", () => {
    socket.destroy()
    resolveAvailable(false)
  })
  socket.once("error", error => {
    if (error.code === "ECONNREFUSED") {
      resolveAvailable(true)
      return
    }
    reject(error)
  })
  socket.once("timeout", () => {
    socket.destroy()
    reject(new Error(`Timed out checking http://${host}:${port}.`))
  })
})

if (!portAvailable) {
  process.stdout.write(
    `Tab Space (Dev) was rebuilt. http://${host}:${port} is already in use, so the existing Dashboard server was left running.\n`
  )
  process.exit(0)
}

const child = spawn(
  join(adminRoot, "node_modules/.bin/vue-cli-service"),
  ["serve", "--host", host, "--port", String(port)],
  {
    cwd: adminRoot,
    env: {
      ...process.env,
      NODE_OPTIONS: [process.env.NODE_OPTIONS, "--openssl-legacy-provider"].filter(Boolean).join(" ")
    },
    stdio: "inherit"
  }
)

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal))
}

child.on("error", error => {
  console.error(error)
  process.exit(1)
})
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 1)
})
