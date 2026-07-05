import os
import subprocess
import time
import socket
import json
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

# Change working directory to root of workspace so we can serve index.html and dummy forms
script_dir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.abspath(os.path.join(script_dir, ".."))
os.chdir(root_dir)

BASE_URL = "http://127.0.0.1:8000"

# ─── Step 3 of the architecture: map a requested government service to a portal URL ───
# For now these all point at local dummy forms instead of the real government portal.
# Swapping a value here to a real portal URL is the only change needed later.
SERVICE_PORTAL_MAP = {
    "ration_card": {
        "title": "Ration Card Application",
        "url": f"{BASE_URL}/dummy_forms/ration_card.html",
    },
    "voter_id": {
        "title": "Voter ID Application",
        "url": f"{BASE_URL}/dummy_forms/voter_id.html",
    },
    "family_data": {
        "title": "Family Data Collection Form",
        "url": f"{BASE_URL}/dummy_forms/family_data_collection.html",
    },
    "benefit_application": {
        "title": "Benefit Application",
        "url": f"{BASE_URL}/dummy_forms/benefit_application/page1.html",
        "pages": [
            f"{BASE_URL}/dummy_forms/benefit_application/page1.html",
            f"{BASE_URL}/dummy_forms/benefit_application/page2.html",
            f"{BASE_URL}/dummy_forms/benefit_application/page3.html",
        ],
    },
}


def is_port_open(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0


def launch_chrome_cdp(initial_url):
    if is_port_open(9222):
        print("Chrome is already listening on port 9222.")
        return

    chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    user_data_dir = os.path.join(os.environ.get("TEMP", "C:\\tmp"), "chrome-debug")

    print(f"Launching Chrome in debugging mode on port 9222 -> {initial_url}")
    subprocess.Popen([
        chrome_path,
        "--remote-debugging-port=9222",
        f"--user-data-dir={user_data_dir}",
        initial_url,
    ])

    for _ in range(6):
        if is_port_open(9222):
            print("Chrome debugging port is active.")
            time.sleep(2)
            return
        print("Waiting for Chrome to start...")
        time.sleep(1)

    print("Warning: Chrome port 9222 did not activate. Please check if Chrome launched successfully.")


def _get_or_open_tab(context, url):
    """Find an existing tab already on this URL, or open a new one."""
    for p_obj in context.pages:
        if p_obj.url == url or p_obj.url.startswith(url):
            p_obj.goto(url) # Reset form state back to step 1
            return p_obj
    page = context.new_page()
    page.goto(url)
    return page


# ─── Step 5 of the architecture: extract the form schema from the live page ───
SCHEMA_EXTRACTION_JS = """
() => {
  const fields = [];
  const elements = document.querySelectorAll('input, select, textarea');
  elements.forEach((el) => {
    if (!el.id) return;
    const type = (el.type || '').toLowerCase();
    if (['submit', 'button', 'hidden', 'reset'].includes(type)) return;

    const labelEl = document.querySelector(`label[for="${el.id}"]`);
    const label = labelEl ? labelEl.innerText.trim() : (el.placeholder || el.id);

    const field = {
      id: el.id,
      name: el.name || el.id,
      label: label,
      tag: el.tagName.toLowerCase(),
      type: el.tagName.toLowerCase() === 'select' ? 'select' : (type || 'text'),
      required: !!el.required,
      placeholder: el.placeholder || '',
    };

    if (field.tag === 'select') {
      field.options = Array.from(el.options)
        .map((o) => o.text.trim())
        .filter((t) => t && t.toLowerCase() !== 'select');
    }

    fields.push(field);
  });
  return fields;
}
"""


def extract_schema(url_or_urls):
    """Navigate to one or more URLs and pull out field schemas from each page."""
    urls = url_or_urls if isinstance(url_or_urls, list) else [url_or_urls]
    launch_chrome_cdp(urls[0])
    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
        if not browser.contexts:
            raise RuntimeError("No active browser contexts found.")
        context = browser.contexts[0]

        all_fields = []
        seen_ids = set()
        for page_url in urls:
            page = _get_or_open_tab(context, page_url)
            page.bring_to_front()
            page.wait_for_load_state("domcontentloaded")
            fields = page.evaluate(SCHEMA_EXTRACTION_JS) or []
            for field in fields:
                if field.get("id") in seen_ids:
                    continue
                seen_ids.add(field.get("id"))
                field["page_url"] = page_url
                all_fields.append(field)

        return all_fields


# ─── Step 10 of the architecture: map JSON values onto the extracted field IDs ───
def run_playwright_fill(url_or_urls, data):
    urls = url_or_urls if isinstance(url_or_urls, list) else [url_or_urls]
    launch_chrome_cdp(urls[0])
    TYPING_DELAY_MS = 60

    with sync_playwright() as p:
        try:
            browser = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
            if not browser.contexts:
                print("Error: No active browser contexts found.")
                return
            context = browser.contexts[0]

            filled_fields = set()

            if len(urls) > 1:
                for idx, page_url in enumerate(urls):
                    page = _get_or_open_tab(context, page_url)
                    page.bring_to_front()
                    page.wait_for_load_state("domcontentloaded")

                    for field_id, value in data.items():
                        if field_id in filled_fields:
                            continue
                        if value is None or value == "":
                            filled_fields.add(field_id)
                            continue

                        locator = page.locator(f"#{field_id}")
                        if locator.count() > 0 and locator.first.is_visible():
                            tag = locator.first.evaluate("el => el.tagName.toLowerCase()")
                            type_attr = (locator.first.evaluate("el => el.type || ''") or "").lower()
                            print(f"Filling #{field_id} on {page_url} ({tag}/{type_attr}) = {value!r}")

                            if tag == "select":
                                try:
                                    locator.first.select_option(label=str(value))
                                except Exception:
                                    try:
                                        locator.first.select_option(value=str(value))
                                    except Exception as e:
                                        print(f"  Could not select option for #{field_id}: {e}")
                            elif type_attr in ("checkbox", "radio"):
                                if str(value).lower() in ("yes", "true", "1", "accepted", "agree", "on"):
                                    locator.first.check()
                            else:
                                locator.first.click()
                                locator.first.fill("")
                                locator.first.press_sequentially(str(value), delay=TYPING_DELAY_MS)

                            filled_fields.add(field_id)

                    if idx < len(urls) - 1:
                        print(f"Navigating to next page: {urls[idx + 1]}")
                        page.goto(urls[idx + 1])
                        page.wait_for_load_state("domcontentloaded")

                submit_btn = page.locator("#submit_btn")
                if submit_btn.count() > 0 and submit_btn.first.is_visible():
                    print("Clicking #submit_btn...")
                    submit_btn.first.click()
            else:
                page = _get_or_open_tab(context, urls[0])
                page.bring_to_front()
                page.wait_for_load_state("domcontentloaded")

                # Multi-step filling loop: fill all visible fields, then click next_btn if visible,
                # and repeat until all fields are filled. Works for single-page multi-step forms.
                max_attempts = 15
                for attempt in range(max_attempts):
                    unfilled_visible_fields = []
                    for field_id, value in data.items():
                        if field_id in filled_fields:
                            continue
                        if value is None or value == "":
                            filled_fields.add(field_id)
                            continue

                        locator = page.locator(f"#{field_id}")
                        if locator.count() > 0 and locator.first.is_visible():
                            unfilled_visible_fields.append((field_id, value, locator.first))

                    for field_id, value, element in unfilled_visible_fields:
                        tag = element.evaluate("el => el.tagName.toLowerCase()")
                        type_attr = (element.evaluate("el => el.type || ''") or "").lower()
                        print(f"Filling #{field_id} ({tag}/{type_attr}) = {value!r}")

                        if tag == "select":
                            try:
                                element.select_option(label=str(value))
                            except Exception:
                                try:
                                    element.select_option(value=str(value))
                                except Exception as e:
                                    print(f"  Could not select option for #{field_id}: {e}")
                        elif type_attr in ("checkbox", "radio"):
                            if str(value).lower() in ("yes", "true", "1", "accepted", "agree", "on"):
                                element.check()
                        else:
                            element.click()
                            element.fill("")
                            element.press_sequentially(str(value), delay=TYPING_DELAY_MS)

                        filled_fields.add(field_id)

                    remaining = [f for f in data.keys() if f not in filled_fields]
                    if not remaining:
                        print("All fields filled! Ready to submit.")
                        break

                    next_btn = page.locator("#next_btn")
                    if next_btn.count() > 0 and next_btn.first.is_visible():
                        print("Clicking #next_btn to go to the next page...")
                        next_btn.first.click()
                        page.wait_for_timeout(600)
                    else:
                        print("No visible #next_btn found but fields remain unfilled. Breaking...")
                        break

                submit_btn = page.locator("#submit_btn")
                if submit_btn.count() > 0 and submit_btn.first.is_visible():
                    print("Clicking #submit_btn...")
                    submit_btn.first.click()

            print("Automation completed successfully.")

        except Exception as e:
            print(f"Playwright Automation Error: {e}")


class AutomationHTTPServer(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200, "ok")
        self.end_headers()

    def _send_json(self, status, payload):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))

    def _read_json_body(self):
        content_length = int(self.headers.get('Content-Length', 0))
        raw = self.rfile.read(content_length) if content_length else b"{}"
        return json.loads(raw.decode('utf-8') or "{}")

    def do_GET(self):
        if self.path == '/api/services':
            # Step 3: what services can we currently map to a portal URL?
            services = [
                {"key": key, "title": meta["title"]}
                for key, meta in SERVICE_PORTAL_MAP.items()
            ]
            self._send_json(200, {"services": services})
            return
        super().do_GET()

    def do_POST(self):
        if self.path == '/api/schema':
            try:
                payload = self._read_json_body()
                service = payload.get("service")
                meta = SERVICE_PORTAL_MAP.get(service)
                if not meta:
                    self._send_json(404, {"error": f"Unknown service '{service}'"})
                    return

                target_urls = meta.get("pages") or [meta["url"]]
                print(f"\n[HTTP Server] Extracting schema for service='{service}' urls={target_urls}")
                fields = extract_schema(target_urls)
                self._send_json(200, {
                    "service": service,
                    "title": meta["title"],
                    "url": target_urls[0],
                    "pages": target_urls,
                    "fields": fields,
                })
            except Exception as e:
                print(f"Schema extraction error: {e}")
                self._send_json(500, {"error": str(e)})
            return

        if self.path == '/api/fill':
            try:
                payload = self._read_json_body()
                url = payload.get("url")
                pages = payload.get("pages")
                data = payload.get("data", {})
                target_urls = pages or url
                if not target_urls:
                    self._send_json(400, {"error": "Missing 'url' or 'pages'"})
                    return

                print(f"\n[HTTP Server] Received automation trigger for urls={target_urls} data={data}")
                threading.Thread(target=run_playwright_fill, args=(target_urls, data)).start()
                self._send_json(200, {"status": "success", "message": "Automation triggered successfully."})
            except Exception as e:
                self._send_json(500, {"error": str(e)})
            return

        self.send_response(404)
        self.end_headers()


def run_server():
    server_address = ('127.0.0.1', 8000)
    print(f"\nStarting EchoJSON Server on http://127.0.0.1:8000...")
    print(f"Serving files from: {os.getcwd()}")
    print("Close the terminal or press Ctrl+C to terminate.")

    httpd = ThreadingHTTPServer(server_address, AutomationHTTPServer)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close()


if __name__ == "__main__":
    run_server()
