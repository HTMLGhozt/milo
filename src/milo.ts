import { Request, RequestData } from "./Request";
import Platform from "./#{target}/Platform";
import { NetworkPipe } from "./types";
import { headerValue } from "./utils";
import WS, { WSState } from './ws';

const requests = new Map();

export {
    WS,
    WSState,
};

export function _load(data: RequestData, callback: Function): number {
    const req = new Request(data);
    req.send().then(response => {
        // if (response.data) {
        //     Platform.writeFile("/tmp/dl", response.data);
        // }
        // delete response.data;
        // Platform.log("Got resolved", response);
        callback(response);
    }).catch(error => {
        Platform.trace("Got error", error);
    });
    return req.id;
}

export function _wsUpgrade(data: RequestData): Promise<NetworkPipe> {
    return new Promise((resolve, reject) => {
        Platform.trace("GOT SHIT", data);
        if (!data.headers) {
            data.headers = {};
        }

        const arrayBufferKey = new DataBuffer(16);
        arrayBufferKey.randomize();
        const key = arrayBufferKey.toString("base64");
        Platform.trace("key is", key, arrayBufferKey);
        data.headers["Upgrade"] = "websocket";
        data.headers["Connection"] = "Upgrade";
        data.headers["Sec-WebSocket-Key"] = key;
        data.headers["Sec-WebSocket-Version"] = "13";
        const req = new Request(data);
        req.send().then(response => {
            Platform.trace("Got response", response);
            if (response.statusCode !== 101)
                throw new Error("status code");

            const upgradeKeyResponse = headerValue(response.headers, "sec-websocket-accept");
            if (!upgradeKeyResponse)
                throw new Error("no Sec-WebSocket-Accept key");

            const WS_KEY = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
            const shadkey = Platform.btoa(Platform.sha1(key + WS_KEY));
            if (shadkey !== upgradeKeyResponse)
                throw new Error(`Key mismatch expected: ${shadkey} got: ${upgradeKeyResponse}`);

            Platform.trace("successfully upgraded");
            resolve(req.networkPipe);
        }).catch(error => {
            Platform.trace("Got error", error);
            reject(error);
        });
    });
}

let idx = 0;
export function ws(url: string, milo: boolean): Promise<WS> {
    if (milo) {
        // @ts-ignore
        return _wsUpgrade({ url }).then((pipe: NetworkPipe) => {
            const id = ++idx;
            const ws = new WS(pipe);
            const ret = {
                send: ws.send.bind(ws),
                onmessage: (event: any) => { }
            };
            ws.onmessage = (buffer: Uint8Array) => {
                if (ret.onmessage) {
                    ret.onmessage({
                        type: "message",
                        websocket: id,
                        opcode: 2,
                        statusCode: 1000,
                        buffer: buffer,
                        binary: true
                    });
                };
            };
            return ret;
        });
    } else {
        return new Promise((resolve, reject) => {
            // @ts-ignore
            let ws = new nrdp.WebSocket(url);
            ws.onopen = () => {
                resolve(ws);
            };
            ws.onerror = (err: any) => {
                reject(err);
            };
        });
    }
}

let fuck = 0;
export function wsTest(url: string, milo: boolean, dataFetchCount: number = 1024, big: boolean = false, nth: number = 1000) {
    ws(url, milo).then(ws => {
        let intervalId = setInterval(() => {
            if (++fuck % 10 == 0) {
                Platform.log("fuck!", fuck);
            }
        }, 10);
        let dataCount = 0;
        let then = Date.now();
        let bytesReceived = 0;

        ws.onmessage = (event: any) => {
            const bytesRead = event.buffer.byteLength;

            bytesReceived += bytesRead;

            // Platform.log(`${dataCount}/${dataFetchCount} ${bytesReceived}`);
            if (++dataCount === dataFetchCount) {
                const now = Date.now();
                Platform.log("Total Bytes Received:", bytesReceived);
                Platform.log("Time Spent:", now - then);
                Platform.log("Mbps:", (bytesReceived / (now - then)) * 1000);
                clearInterval(intervalId);
                return;
            } else if (dataCount < dataFetchCount) {
                if (dataCount % nth == 0) {
                    Platform.log(`${dataCount}/${dataFetchCount}`);
                }
                ws.send(big ? "sendBig" : "send");
            }
        };

        // ws.onclose = () => {
        //     Platform.log("close");
        // }

        ws.send(big ? "sendBig" : "send");
    });
}
