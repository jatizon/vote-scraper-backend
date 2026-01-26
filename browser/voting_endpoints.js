import 'dotenv/config';
import express from "express";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

import { ProxyProvider } from './proxy_provider.js';

import os from "os";
import path from "path";
import crypto from "crypto";

puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());

const proxyAddresses = Object.keys(process.env)
  .filter(k => k.startsWith('PROXY_'))
  .map(k => process.env[k]);

const proxyProvider = new ProxyProvider(proxyAddresses);

const hideBrowser = true;

const randId = () => crypto.randomBytes(8).toString("hex");

// ---------- LAUNCH BROWSER WITH ERROR CATCH ----------
const launchLocalBrowser = async (proxy) => {
  const args = proxy?.ip ? [`--proxy-server=${proxy.ip}:${proxy.port}`] : [];

  const userDataDir = path.join(os.tmpdir(), `puppeteer_dev_profile-${randId()}`);

  try {
    const browser = await puppeteer.launch({
      headless: hideBrowser,
      args,
      userDataDir
    });
    return browser;
  } catch (err) {
    console.error("Failed to launch Puppeteer browser:", err.message);
    throw new Error("Browser launch failed. Check dependencies, environment, and Puppeteer config. Original error: " + err.message);
  }
};
// ------------------------------------------------------

const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

const setupPage = async (page, proxy) => {
  if (proxy?.username && proxy?.password) {
    await page.authenticate({ username: proxy.username, password: proxy.password });
  }

  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:115.0) Gecko/20100101 Firefox/115.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13.6; rv:115.0) Gecko/20100101 Firefox/115.0",
    "Mozilla/5.0 (X11; Linux x86_64; rv:115.0) Gecko/20100101 Firefox/115.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  ];

  const timezones = [
    "America/Sao_Paulo",
    "America/New_York",
    "America/Los_Angeles",
    "Europe/Lisbon",
    "Europe/London",
    "Europe/Berlin",
    "Europe/Paris",
    "Asia/Tokyo",
    "Asia/Shanghai",
    "Australia/Sydney",
  ];

  const languages = [
    "en-US,en;q=0.9",
    "en-GB,en;q=0.9",
    "pt-BR,pt;q=0.9,en;q=0.8",
    "pt-PT,pt;q=0.9,en;q=0.8",
    "es-ES,es;q=0.9,en;q=0.8",
    "es-MX,es;q=0.9,en;q=0.8",
    "fr-FR,fr;q=0.9,en;q=0.8",
    "de-DE,de;q=0.9,en;q=0.8",
    "it-IT,it;q=0.9,en;q=0.8",
    "ja-JP,ja;q=0.9,en;q=0.8",
  ];

  await page.setUserAgent(pickRandom(userAgents));
  await page.emulateTimezone(pickRandom(timezones));
  await page.setExtraHTTPHeaders({
    "Accept-Language": pickRandom(languages),
  });

  const client = await page.target().createCDPSession();
  await client.send("Network.clearBrowserCookies");
  await client.send("Network.clearBrowserCache");
  await client.send("Storage.clearDataForOrigin", {
    origin: page.url() || "about:blank",
    storageTypes: "all",
  });
};

const launchPage = async (browser, proxy) => {      
    // const page = await browser.newPage();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();   
    await setupPage(page, proxy);

    try {
        await page.goto(
        "https://lovable-for-schools.lovable.app/school/instituto-tecnol-gico-de-aeron-utica",
        {
            waitUntil: "domcontentloaded",
            timeout: 20000
        }
        );
    } catch (e) {
        throw new Error("Failed to navigate to the voting page: " + e);
    }

    return page;
};

const clickVoteButton = async (page) => {
  try {
    const selector = 'button.bg-primary.text-primary-foreground.rounded-2xl.text-lg.font-bold';
    await page.waitForSelector(selector, { timeout: 45000 });
    await page.$eval(selector, element => element.click());
    console.log("Clicked 'Vote for This School'. Proceeding to login");
  } catch (e) {
    throw new Error("Vote button not found!");
  }
};

const waitForEmailInput = async (page) => {
  try {
    const selector = 'input[type="email"][id="email"]';
    await page.waitForSelector(selector, { timeout: 20000 });
  } catch (e) {
    throw new Error("Email input not found!");
  }
};

const fillEmailAndSendLink = async (page, email) => {
  const attemptSend = async () => {
    const submitSelector = 'button[type="submit"]';
    await page.waitForSelector(submitSelector, { timeout: 20000 });
    await page.click(submitSelector);

    // Wait for any element containing the success text
    await page.waitForFunction(() => {
      const successText = 'check your email';
      return Array.from(document.body.querySelectorAll('*'))
        .some(el => el.innerText && el.innerText.toLowerCase().includes(successText));
    }, { timeout: 10000 });
  };

  try {
    await page.type('input[type="email"][id="email"]', email);
    await attemptSend();
    console.log(`Magic link successfully sent to ${email}`);
    await new Promise(r => setTimeout(r, 2000));

  } catch (e) {
    if (e.name === 'TimeoutError') {
      console.warn(`Rate limited for ${email}, clearing cookies and cache and retrying once...`);

      // Clear cookies
      const cookies = await page.cookies();
      await page.deleteCookie(...cookies);

      // Clear localStorage and sessionStorage
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });

      // Reload page
      await page.reload({ waitUntil: ['networkidle0', 'domcontentloaded'] });

      try {
        await page.type('input[type="email"][id="email"]', email);
        await attemptSend();
        console.log(`Magic link successfully sent to ${email} on retry`);
        await new Promise(r => setTimeout(r, 2000));
      } catch (retryError) {
        throw new Error(`Failed to send magic link to ${email} even after retry: ${retryError.message}`);
      }

    } else {
      throw new Error("Send button not found or failed! " + e.message);
    }
  }
};

const navigateEndSendEmail = async (browser, email, proxy) => {
  const page = await launchPage(browser, proxy);
  await clickVoteButton(page);
  await waitForEmailInput(page);
  await fillEmailAndSendLink(page, email);
};

const launchVotingPage = async (browser, link, proxy) => {
    // const page = await browser.newPage();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await setupPage(page, proxy);

    try {
        await page.goto(
        link,
        {
            waitUntil: "domcontentloaded",
            timeout: 20000
        }
        );
    } catch (e) {
        throw new Error("Failed to navigate to the voting link");
    }

    return page;
};

const clickUpvoteForSchool = async (page) => {
  const schoolSelector = 'p.font-semibold.text-foreground.truncate.text-sm.sm\\:text-base';

  await page.waitForSelector(schoolSelector, { timeout: 45000 });

  try {
    const clicked = await page.$eval(
      schoolSelector,
      (el, selector) => {
        const schools = Array.from(document.querySelectorAll(selector));
        const ita = schools.find(el => el.textContent.trim() === 'Instituto Tecnológico de Aeronáutica');
        if (!ita) throw new Error("School ITA not found!");

        let container = ita;
        for (let i = 0; i < 4; i++) {
          if (!container.parentElement) return false;
          container = container.parentElement;
        }

        const tds = container.querySelectorAll('td.p-4.align-middle.text-center');
        const td = tds[2];
        if (!td) return false;

        const upvoteButton = td.querySelector('button[aria-label="Upvote"]');
        if (!upvoteButton) return false;

        upvoteButton.click();
        return true;
      },
      schoolSelector
    );

    if (!clicked) throw new Error("Upvote button not found for ITA!");
    console.log("Vote submitted successfully for ITA!");
  } catch (err) {
    console.error("Error while trying to click upvote:", err.message);
    throw err;
  }
};

const voteForSchoolLink = async (browser, link, proxy) => {
  const page = await launchVotingPage(browser, link, proxy);
  await clickUpvoteForSchool(page);
};

app.post("/send_link_to_email", async (req, res) => {
    let proxy;
    let browser;
    try {
        proxy = await proxyProvider.getProxy();
        console.log(`Using proxy: ${proxy.ip}`);

        browser = await launchLocalBrowser(proxy);

        const email = req.body.email;
        console.log("Received email address:", email);

        await new Promise(r => setTimeout(r, 2000));
        await navigateEndSendEmail(browser, email, proxy);
        res.json({ status: "ok" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: "error", message: err.message });
    } finally {
        await browser.close();
        proxy.release();
    }
});

app.post("/vote", async (req, res) => {
    let proxy;
    let browser;
    try {
        proxy = await proxyProvider.getProxy();
        console.log(`Using proxy: ${proxy.ip}`);

        browser = await launchLocalBrowser(proxy);

        const { link } = req.body;
        if (!link) return res.status(400).json({ status: "error", message: "Missing link" });

        await voteForSchoolLink(browser, link, proxy);
        res.json({ status: "ok", message: "Upvote clicked successfully!" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: "error", message: err.message });
    } finally {
        await new Promise(r => setTimeout(r, 2000));
        await browser.close();
        proxy.release();
    }
});

app.listen(3000, () => console.log("JS server running on port 3000"));
