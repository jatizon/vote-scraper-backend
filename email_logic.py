import asyncio
import httpx
import uuid
import re
import random
import os
from dotenv import load_dotenv

load_dotenv()

BASE = "https://api.mail.tm"

# --- Proxy logic ---
PROXIES = [
    os.getenv("PROXY_1"),
    os.getenv("PROXY_2"),
    os.getenv("PROXY_3"),
    os.getenv("PROXY_4"),
    os.getenv("PROXY_5"),
    os.getenv("PROXY_6"),
    os.getenv("PROXY_7"),
    os.getenv("PROXY_8"),
    os.getenv("PROXY_9"),
    os.getenv("PROXY_10"),
    os.getenv("PROXY_11"),
    os.getenv("PROXY_12"),
    os.getenv("PROXY_13"),
    os.getenv("PROXY_14"),
]

def get_random_proxy():
    proxy = random.choice([p for p in PROXIES if p])
    if proxy:
        return f"http://{proxy}"
    return None

# --- Create temporary inbox ---
async def create_temp_inbox():
    proxy = get_random_proxy()
    async with httpx.AsyncClient(proxy=proxy) as client:
        # 1) Get a domain
        r = await client.get(f"{BASE}/domains")
        r.raise_for_status()
        domain = r.json()["hydra:member"][0]["domain"]

        # 2) Create account
        addr = f"user{uuid.uuid4()}@{domain}"
        password = "Passw0rd!123"
        r = await client.post(f"{BASE}/accounts", json={"address": addr, "password": password})
        r.raise_for_status()

        # 3) Login to get token
        r = await client.post(f"{BASE}/token", json={"address": addr, "password": password})
        r.raise_for_status()
        token = r.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

    return addr, headers

# --- Get last email ---
async def get_last_email_json(headers):
    proxy = get_random_proxy()
    async with httpx.AsyncClient(proxy=proxy) as client:
        r = await client.get(f"{BASE}/messages", headers=headers)
        r.raise_for_status()
        inbox = r.json()["hydra:member"]
        if not inbox:
            return None
        msg_id = inbox[0]["id"]
        r = await client.get(f"{BASE}/messages/{msg_id}", headers=headers)
        r.raise_for_status()
        return r.json()

# --- Extract link from message ---
def get_link_from_msg(msg):
    text = msg.get("text", "")
    match = re.search(r"https?://\S+", text)
    if not match:
        return None
    return match.group(0)
