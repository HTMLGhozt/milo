#!/usr/bin/env nodejs

const express = require("express");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const zlib = require("zlib");
const seedrandom = require("seedrandom");

const argv = require("minimist")(process.argv.slice(2));
const app = express();

const options = {
    key: fs.readFileSync(path.join(__dirname, "key.pem")),
    cert: fs.readFileSync(path.join(__dirname, "cert.pem"))
};

const file = argv["ports-file"] || path.join(__dirname, "/test-server.ports");
const host = argv["server"] || "localhost";

let startPort = 59999;
const maxPort = 65535;
function createServer(opts)
{
    return new Promise((resolve, reject) => {
        function tryPort()
        {
            let server;
            const port = ++startPort;
            // console.log("trying", port);
            if (port > maxPort) {
                reject(new Error("Couldn't find a port"));
                return;
            }

            const id = setTimeout(() => { // timed out
                tryPort();
            }, 250);

            try {
                if (opts) {
                    server = https.createServer(opts, app);
                } else {
                    server = http.createServer(app);
                }
                server.listen(port, () => {
                    const s = `${opts ? "https" : "http"}://${host}:${port}`;
                    server.address = s;
                    console.log("listening on", s);
                    clearTimeout(id);
                    resolve(server);
                });
            } catch (err) {
                tryPort();
                return;
            }

            server.on("error", err => {
                clearTimeout(id);
                tryPort();
            });
        }
        tryPort();
    });
}
let httpServer, httpsServer;
createServer().then(server => {
    httpServer = server;
    return createServer(options);
}).then(server => {
    httpsServer = server;
    fs.writeFileSync(file, `MILO_TEST_HTTP_SERVER=${httpServer.address}\nMILO_TEST_HTTPS_SERVER=${httpsServer.address}\n`);
}).catch(err => {
    console.error(err);
    process.exit(1);
});

const table = "ABCDEFGHIJKLMNOPQRSTUVWXYZ\n";

app.get("/", (req, res) => {
    const size = parseInt(req.query.size) || 1024;
    let payload = Buffer.allocUnsafe(size);
    for (let idx=0; idx<size; ++idx) {
        payload[idx] = table.charCodeAt(idx % table.length);
    }

    if ("gzip" in req.query) {
        payload = zlib.gzipSync(payload);
        res.set("Content-Encoding", "gzip");
    } else if ("deflate" in req.query) {
        payload = zlib.deflateSync(payload);
        res.set("Content-Encoding", 'deflate');
    }

    console.log("got request", req.url);
    // console.log("got payload", payload.length, payload.byteLength);
    if ("chunked" in req.query) {
        const random = seedrandom(JSON.stringify(req.query));
        let idx = 0;
        function chunk()
        {
            const val = Math.max(Math.round(payload.length / 20), 32);
            const len = Math.min(payload.length - idx, Math.round(1 + (random() * val)));
            // console.log("writing chunk", len, idx, payload.length);
            if (!len) {
                res.end();
            } else {
                res.write(payload.slice(idx, idx + len));
                idx += len;
                setTimeout(chunk, 10);
            }
        }
        chunk();
    } else {
        res.send(payload);
    }
});