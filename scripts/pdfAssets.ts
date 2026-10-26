import { readFileSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { createRequire } from "node:module"
import type { Plugin } from "vite"

// Serve only the enumerated dependency assets, never a user-supplied filesystem path.
export default function pdfAssets(): Plugin {
  const require = createRequire(import.meta.url)
  const root = dirname(require.resolve("pdfjs-dist/package.json"))
  const assets = new Map<string, string>()
  for (const folder of ["standard_fonts", "cmaps"]) {
    for (const name of readdirSync(join(root, folder))) {
      if (/^[a-zA-Z0-9_.-]+\.(?:bcmap|pfb|ttf)$/.test(name) || /^LICENSE(?:[_A-Z]+)?$/.test(name)) assets.set(`pdf-assets/${folder}/${name}`, join(root, folder, name))
    }
  }
  return {
    name: "local-pdf-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const key = (req.url ?? "").split("?")[0].replace(/^\//, "")
        const source = assets.get(key)
        if (!source) return next()
        res.setHeader("Content-Type", "application/octet-stream")
        res.setHeader("X-Content-Type-Options", "nosniff")
        res.end(readFileSync(source))
      })
    },
    generateBundle() {
      for (const [fileName, source] of assets) this.emitFile({ type: "asset", fileName, source: readFileSync(source) })
    },
  }
}
