import puppeteer from "puppeteer";

// Your proxy string from .env
const proxyStr = "14a01756024d6:bfeced2d41@89.190.151.129:12323";

// Parse proxy: "username:password@ip:port"
const match = proxyStr.match(/^([^:]+):([^@]+)@([^:]+):(\d+)$/);
if (!match) throw new Error("Invalid proxy format");

const proxy = {
    username: match[1],
    password: match[2],
    ip: match[3],
    port: match[4]
};

(async () => {
    // Launch browser with proxy
    const browser = await puppeteer.launch({
        headless: false,
        args: [`--proxy-server=${proxy.ip}:${proxy.port}`]
    });

    const page = await browser.newPage();

    // Authenticate if username/password exist
    if (proxy.username && proxy.password) {
        await page.authenticate({
            username: proxy.username,
            password: proxy.password
        });
    }

    try {
        // Go to httpbin to check outgoing IP
        await page.goto("https://lovable-for-schools.lovable.app/school/instituto-tecnol-gico-de-aeron-utica", {
            waitUntil: "domcontentloaded",
            timeout: 0 // no timeout
        });

        const body = await page.evaluate(() => document.body.innerText);
        console.log("Response from httpbin:", body);

    } catch (err) {
        console.error("Navigation failed:", err.message);
    } finally {
        await new Promise(r => setTimeout(r, 5000));
        await browser.close();
    }
})();
