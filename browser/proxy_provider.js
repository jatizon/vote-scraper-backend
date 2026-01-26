import { Mutex } from 'async-mutex';


class Proxy {
    constructor(address, release_callback) {
        this.address = address;
        this.release_callback = release_callback;

        if (!address) {
            this.username = undefined;
            this.password = undefined;
            this.ip = undefined;
            this.port = undefined;
        } else {
            // Try to parse "user:pass@ip:port"
            let match = address.match(/^([^:]+):([^@]+)@([^:]+):(\d+)$/);

            if (match) {
                // Auth proxy
                this.username = match[1];
                this.password = match[2];
                this.ip = match[3];
                this.port = match[4];
            } else {
                // No-auth proxy: "ip:port"
                match = address.match(/^([^:]+):(\d+)$/);
                if (!match) {
                    throw new Error(`Invalid proxy format: ${address}`);
                }
                this.username = undefined;
                this.password = undefined;
                this.ip = match[1];
                this.port = match[2];
            }
        }
    }

    release() {
        this.release_callback();
    }
}


export class ProxyProvider {
    constructor(proxies) {
        this.proxies = proxies
        this.proxyUsage = new Map(proxies.map(address => [address, 0]));
        this.mutex = new Mutex();
    }

    async getProxy() {
        if (!this.proxies || this.proxies.length === 0) {
            throw new Error("No proxies available");
        }   
                 
        return await this.mutex.runExclusive(() => {
            let minaddress = null;
            let minValue = Infinity;

            for (const [address, value] of this.proxyUsage) {
                if (value < minValue) {
                    minValue = value;
                    minaddress = address;
                }
            }

            this.proxyUsage.set(minaddress, this.proxyUsage.get(minaddress) + 1);
            
            return new Proxy(minaddress, () => {
                this.proxyUsage.set(minaddress, Math.max(0, this.proxyUsage.get(minaddress) - 1))
            });

        })
    }
}