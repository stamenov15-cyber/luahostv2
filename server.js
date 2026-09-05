const http = require("http")
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

const PORT = process.env.PORT || 3000
const DATA_FILE = path.join(__dirname, "scripts.json")

function loadScripts() {
    if (!fs.existsSync(DATA_FILE)) return {}
    try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) } catch { return {} }
}
function saveScripts(db) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2))
}
function genId() {
    return crypto.randomBytes(4).toString("hex").toUpperCase()
}
function parseBody(req) {
    return new Promise((res, rej) => {
        let body = ""
        req.on("data", chunk => body += chunk)
        req.on("end", () => { try { res(JSON.parse(body)) } catch { res({}) } })
        req.on("error", rej)
    })
}
function respond(res, status, body, type) {
    res.writeHead(status, {
        "Content-Type": type || "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    })
    res.end(typeof body === "string" ? body : JSON.stringify(body))
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost")
    const pathname = url.pathname

    if (req.method === "OPTIONS") return respond(res, 204, "")

    if (req.method === "GET" && (pathname === "/" || pathname === "/index.html")) {
        const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8")
        return respond(res, 200, html, "text/html")
    }

    // GET /s/:id — raw Lua for Roblox
    if (req.method === "GET" && pathname.startsWith("/s/")) {
        const id = pathname.slice(3)
        const db = loadScripts()
        const script = db[id]
        if (!script) return respond(res, 404, "-- script not found", "text/plain")
        db[id].hits = (db[id].hits || 0) + 1
        saveScripts(db)
        return respond(res, 200, script.code, "text/plain")
    }

    // GET /api/scripts
    if (req.method === "GET" && pathname === "/api/scripts") {
        const db = loadScripts()
        const list = Object.entries(db).map(([id, s]) => ({
            id, name: s.name, hits: s.hits || 0,
            size: s.code.length, created: s.created, updated: s.updated,
        }))
        return respond(res, 200, list)
    }

    // POST /api/scripts — save script
    if (req.method === "POST" && pathname === "/api/scripts") {
        const body = await parseBody(req)
        if (!body.code || !body.name) return respond(res, 400, { error: "name and code required" })
        const db = loadScripts()
        const id = body.id && db[body.id] ? body.id : genId()
        const now = new Date().toISOString()
        db[id] = {
            name: body.name.trim(),
            code: body.code,
            hits: db[id] ? db[id].hits : 0,
            created: db[id] ? db[id].created : now,
            updated: now,
        }
        saveScripts(db)
        return respond(res, 200, { id, name: db[id].name })
    }

    // DELETE /api/scripts/:id
    if (req.method === "DELETE" && pathname.startsWith("/api/scripts/")) {
        const id = pathname.slice(13)
        const db = loadScripts()
        if (!db[id]) return respond(res, 404, { error: "not found" })
        delete db[id]
        saveScripts(db)
        return respond(res, 200, { ok: true })
    }

    respond(res, 404, { error: "not found" })
})

server.listen(PORT, () => {
    console.log("Lua Host running on http://localhost:" + PORT)
})
