import asyncio
from functools import wraps
from email_logic import create_temp_inbox, get_last_email_json, get_link_from_msg
import httpx
import random

MAX_CONCURRENT_ENDPOINTS = 10
MAX_CONCURRENT_INBOX_CREATIONS = 1
MAX_CONCURRENT_INBOX_FETCHS = 5
INBOX_COUNT = 5000

# Semaphores
semaphor_endpoints = asyncio.Semaphore(MAX_CONCURRENT_ENDPOINTS)
semaphor_inbox_creations = asyncio.Semaphore(MAX_CONCURRENT_INBOX_CREATIONS)
semaphor_inbox_fetchs = asyncio.Semaphore(MAX_CONCURRENT_INBOX_FETCHS)


def get_first_try_jitter(base_delta=5):
    return random.uniform(0, base_delta)

def get_jitter(base_delay, max_delta=10.0):
    jitter = random.uniform(0, max_delta)
    return base_delay + jitter
    
def with_semaphore(sem: asyncio.Semaphore):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            async with sem:
                return await func(*args, **kwargs)
        return wrapper
    return decorator

# --- Email inbox creation ---
async def create_email_inbox_once(idx, delay=5, retries=3):
    # First try jitter
    # await asyncio.sleep(get_first_try_jitter(base_delta=2))

    for attempt in range(1, retries + 1):
        try:
            addr, headers = await create_temp_inbox()
            print(f"[Inbox {idx}] Inbox created: {addr}")
            return addr, headers
        except httpx.HTTPStatusError as e:
            print(f"[Inbox {idx}] Create Email Attempt {attempt} failed with HTTP {e.response.status_code}. Retrying in {delay}s...")
            jittered_delay = get_jitter(delay, attempt)
            await asyncio.sleep(jittered_delay)
        except Exception as e:
            print(f"[Inbox {idx}] Create Email Attempt {attempt} failed: {e}. Retrying in {delay}s...")
            jittered_delay = get_jitter(delay, attempt)
            await asyncio.sleep(jittered_delay)

    raise Exception(f"Failed to create email inbox after {retries} attempts.")

@with_semaphore(semaphor_inbox_creations)
async def create_email_inbox(idx):
    return await create_email_inbox_once(idx)

# --- Sending link to email with retry ---
@with_semaphore(semaphor_inbox_fetchs)
async def send_link_to_email(idx, email, delay=5, retries=3):
    # First try jitter
    await asyncio.sleep(get_first_try_jitter(base_delta=2))

    for attempt in range(1, retries + 1):
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    "http://localhost:3000/send_link_to_email",
                    json={"email": email}
                )
                response.raise_for_status()
                print(f"[Inbox {idx}] Sent link to {email}")
                return

        except httpx.HTTPStatusError as e:
            print(f"[Inbox {idx}] Send Link Attempt {attempt} failed with HTTP {e.response.status_code}. Retrying in {delay}s...")
            jittered_delay = get_jitter(delay, attempt)
            await asyncio.sleep(jittered_delay)

        except Exception as e:
            print(f"[Inbox {idx}] Send Link Attempt {attempt} failed: {e}. Retrying in {delay}s...")
            jittered_delay = get_jitter(delay, attempt)
            await asyncio.sleep(jittered_delay)

    raise Exception(f"[Inbox {idx}] Failed to send link to {email} after {retries} attempts.")

# --- Trigger vote with retry ---
@with_semaphore(semaphor_endpoints)
async def trigger_vote(idx, link, delay=5, retries=3):
    # First try jitter
    await asyncio.sleep(get_first_try_jitter(base_delta=2))

    for attempt in range(1, retries + 1):
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    "http://localhost:3000/vote",
                    json={"link": link}
                )
                response.raise_for_status()
                print(f"[Inbox {idx}] Vote triggered successfully for link: {link}")
                return

        except httpx.HTTPStatusError as e:
            print(f"[Inbox {idx}] Trigger Vote Attempt {attempt} failed with HTTP {e.response.status_code}. Retrying in {delay}s...")
            jittered_delay = get_jitter(delay, attempt)
            await asyncio.sleep(jittered_delay)

        except Exception as e:
            print(f"[Inbox {idx}] Trigger Vote Attempt {attempt} failed: {e}. Retrying in {delay}s...")
            jittered_delay = get_jitter(delay, attempt)
            await asyncio.sleep(jittered_delay)

    raise Exception(f"[Inbox {idx}] Failed to trigger vote for link after {retries} attempts.")

# --- Fetch inbox ---
@with_semaphore(semaphor_endpoints)
async def fetch_inbox_once(headers):
    return await get_last_email_json(headers)

# --- Poll inbox ---
async def poll_inbox(idx, headers, delay=5, retries=3):    
    # First try jitter
    await asyncio.sleep(get_first_try_jitter(base_delta=2))
    
    for attempt in range(1, retries + 1):
        try:
            inbox_msg = await fetch_inbox_once(headers)
            if inbox_msg:
                return inbox_msg

            print(f"[Inbox {idx}] Email not found yet. Waiting {delay}s before retrying...")
            jittered_delay = get_jitter(delay, attempt)
            await asyncio.sleep(jittered_delay)

        except httpx.HTTPStatusError as e:
            print(f"[Inbox {idx}] Poll Inbox Attempt {attempt} failed with HTTP {e.response.status_code}. Retrying in {delay}s...")
            jittered_delay = get_jitter(delay, attempt)
            await asyncio.sleep(jittered_delay)
            
        except Exception as e:
            print(f"[Inbox {idx}] Poll Inbox Attempt {attempt} failed: {e}. Retrying in {delay}s...")
            jittered_delay = get_jitter(delay, attempt)
            await asyncio.sleep(jittered_delay)

    raise Exception(f"[Inbox {idx}] Failed to poll inbox after {retries} attempts.")

# --- Monitor progress ---
async def monitor(progress_q: asyncio.Queue):
    successfull_votes = 0
    failed_votes = 0
    done = 0

    while done < INBOX_COUNT:
        msg = await progress_q.get()

        if msg == "success":
            successfull_votes += 1
        elif msg == "failure":
            failed_votes += 1
        else:
            continue

        done += 1
        total_done = successfull_votes + failed_votes

        pct = (successfull_votes / total_done) * 100 if total_done else 0

        print(
            f"\rTotal Successful Votes: {successfull_votes} ({pct:.2f}%) | "
            f"Failed: {failed_votes} | Done {done}/{INBOX_COUNT}",
        )

# --- Main logic per inbox ---
async def main_logic(idx, progress_q: asyncio.Queue):
    try:
        addr, headers = await create_email_inbox(idx)

        await send_link_to_email(idx, addr)

        msg = await poll_inbox(idx, headers)
        if not msg:
            await progress_q.put('failure')
            print(f"[Inbox {idx}] No email received after sending link")
            return

        link = get_link_from_msg(msg)
        print(f"[Inbox {idx}] Validation link received: {link}")

        await trigger_vote(idx, link)

        await progress_q.put('success')
        print(f"[Inbox {idx}] SUCCESS")

    except httpx.HTTPStatusError as e:
        await progress_q.put('failure')
        print(f"[Inbox {idx}] HTTP error: {e.response.status_code} - {str(e)}")
    except Exception as e:
        await progress_q.put('failure')
        print(f"[Inbox {idx}] Unexpected error: {e}")

# --- Run all tasks ---
async def run_all():
    progress_q = asyncio.Queue()

    monitor_task = asyncio.create_task(monitor(progress_q))

    tasks = [asyncio.create_task(main_logic(i, progress_q)) for i in range(INBOX_COUNT)]

    await asyncio.gather(*tasks)
    await monitor_task

if __name__ == "__main__":
    asyncio.run(run_all())
