import os
import subprocess
import time
import socket
import json
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
from playwright.sync_api import sync_playwright

# Change working directory to root of workspace so we can serve index.html and dummy_form.html
script_dir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.abspath(os.path.join(script_dir, ".."))
os.chdir(root_dir)

def is_port_open(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

def launch_chrome_cdp():
    if is_port_open(9222):
        print("Chrome is already listening on port 9222.")
        return
        
    chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    user_data_dir = os.path.join(os.environ.get("TEMP", "C:\\tmp"), "chrome-debug")
    
    print("Launching Chrome in debugging mode on port 9222...")
    subprocess.Popen([
        chrome_path,
        "--remote-debugging-port=9222",
        f"--user-data-dir={user_data_dir}",
        "http://127.0.0.1:8000/dummy_form.html"
    ])
    
    # Wait for Chrome to start and load initial tab
    for _ in range(6):
        if is_port_open(9222):
            print("Chrome debugging port is active.")
            time.sleep(2) # Extra buffer for tab initialization
            return
        print("Waiting for Chrome to start...")
        time.sleep(1)
    
    print("Warning: Chrome port 9222 did not activate. Please check if Chrome launched successfully.")

def run_playwright_automation(payload):
    # Ensure Chrome is running on port 9222
    launch_chrome_cdp()

    first_name = payload.get("First_Name", "Unknown")
    city = payload.get("City", "Unknown")
    action_type = payload.get("Action_Type", "Unknown")

    print(f"\n--- Starting Playwright Automation ---")
    print(f"Payload: First_Name='{first_name}', City='{city}', Action_Type='{action_type}'")
    
    with sync_playwright() as p:
        try:
            print("Connecting to Chrome browser session at http://127.0.0.1:9222...")
            browser = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
            
            if not browser.contexts:
                print("Error: No active browser contexts found.")
                return
                
            context = browser.contexts[0]
            
            # Find the dummy form tab, or open a new one if not open
            page = None
            for p_obj in context.pages:
                if "dummy_form.html" in p_obj.url:
                    page = p_obj
                    break
            
            if not page:
                print("Dummy form page not open in browser. Opening a new tab...")
                page = context.new_page()
                page.goto("http://127.0.0.1:8000/dummy_form.html")
            else:
                print(f"Found active tab: '{page.title()}' ({page.url})")
                page.bring_to_front()
            
            TYPING_DELAY_MS = 80
            
            # 1. Fill "#applicant_name" field
            print(f"Typing '{first_name}' into #applicant_name...")
            page.locator("#applicant_name").click()
            page.locator("#applicant_name").fill("")
            page.locator("#applicant_name").press_sequentially(first_name, delay=TYPING_DELAY_MS)
            
            # 2. Fill "#district_dropdown" field
            print(f"Typing '{city}' into #district_dropdown...")
            page.locator("#district_dropdown").click()
            page.locator("#district_dropdown").fill("")
            page.locator("#district_dropdown").press_sequentially(city, delay=TYPING_DELAY_MS)
            
            # 3. Fill "#action_type" field
            print(f"Typing '{action_type}' into #action_type...")
            page.locator("#action_type").click()
            page.locator("#action_type").fill("")
            page.locator("#action_type").press_sequentially(action_type, delay=TYPING_DELAY_MS)
            
            # 4. Click the submit button
            print("Clicking #submit_btn...")
            page.locator("#submit_btn").click()
            
            print("Automation completed successfully.")
            
        except Exception as e:
            print(f"Playwright Automation Error: {e}")

class AutomationHTTPServer(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Enable CORS
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200, "ok")
        self.end_headers()

    def do_POST(self):
        if self.path == '/api/fill':
            # Parse POST JSON data
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            payload = json.loads(post_data.decode('utf-8'))
            
            print(f"\n[HTTP Server] Received automation API trigger payload: {payload}")
            
            # Run Playwright in a background thread to prevent HTTP response block
            threading.Thread(target=run_playwright_automation, args=(payload,)).start()
            
            # Send HTTP success response
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = {"status": "success", "message": "Automation triggered successfully."}
            self.wfile.write(json.dumps(response).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

def run_server():
    server_address = ('127.0.0.1', 8000)
    print(f"\nStarting EchoJSON Server on http://127.0.0.1:8000...")
    print(f"Serving files from: {os.getcwd()}")
    print("Close the terminal or press Ctrl+C to terminate.")
    
    httpd = HTTPServer(server_address, AutomationHTTPServer)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
