import http.server
import json
import os
import urllib.parse
import sys

# Minimal standalone file explorer backend
# This is completely independent of SaltStack and SaltGUI

ALLOWED_ROOTS = ['/srv/salt', '/srv/pillar']

class ExplorerHandler(http.server.BaseHTTPRequestHandler):
    def send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        self.handle_request()

    def do_POST(self):
        self.handle_request()

    def handle_request(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        cmd = parsed.path
        
        response_data = {}
        status_code = 200

        try:
            print(f"Request: {self.command} {cmd} {params}")
            if cmd == '/list':
                path = params.get('path', ['/srv/salt'])[0]
                if self.is_allowed(path):
                    try:
                        files = os.listdir(path)
                        response_data = []
                        for f in files:
                            full_path = os.path.join(path, f)
                            response_data.append({
                                "name": f,
                                "isDir": os.path.isdir(full_path),
                                "path": full_path
                            })
                    except FileNotFoundError:
                        response_data = []
                else:
                    status_code = 403
                    response_data = {"error": f"Access denied for {path}"}

            elif cmd == '/read':
                path = params.get('path', [None])[0]
                if path and self.is_allowed(path) and os.path.isfile(path):
                    with open(path, 'r', encoding='utf-8', errors='replace') as f:
                        response_data = {"content": f.read()}
                else:
                    status_code = 403
                    response_data = {"error": f"Access denied or file not found: {path}"}
            
            elif cmd == '/save' and self.command == 'POST':
                content_length = int(self.headers['Content-Length'])
                post_data = json.loads(self.rfile.read(content_length))
                path = post_data.get('path')
                content = post_data.get('content')
                if path and self.is_allowed(path):
                    with open(path, 'w', encoding='utf-8') as f:
                        f.write(content)
                    response_data = {"success": True}
                else:
                    status_code = 403
                    response_data = {"error": f"Access denied for {path}"}

            elif cmd == '/create_file' and self.command == 'POST':
                content_length = int(self.headers['Content-Length'])
                post_data = json.loads(self.rfile.read(content_length))
                path = post_data.get('path')
                if path and self.is_allowed(path):
                    with open(path, 'w', encoding='utf-8') as f:
                        f.write('')
                    response_data = {"success": True}
                else:
                    status_code = 403
                    response_data = {"error": "Access denied"}

            elif cmd == '/create_dir' and self.command == 'POST':
                content_length = int(self.headers['Content-Length'])
                post_data = json.loads(self.rfile.read(content_length))
                path = post_data.get('path')
                if path and self.is_allowed(path):
                    os.makedirs(path, exist_ok=True)
                    response_data = {"success": True}
                else:
                    status_code = 403
                    response_data = {"error": "Access denied"}

            elif cmd == '/roots':
                response_data = ALLOWED_ROOTS

            elif cmd == '/':
                response_data = {"status": "Independent Explorer Backend is running", "allowed_roots": ALLOWED_ROOTS}

            else:
                status_code = 404
                response_data = {"error": "Not found"}

        except Exception as e:
            status_code = 500
            response_data = {"error": str(e)}

        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps(response_data).encode('utf-8'))

    def is_allowed(self, path):
        real_input = os.path.realpath(path)
        for root in ALLOWED_ROOTS:
            real_root = os.path.realpath(root)
            if real_input.startswith(real_root):
                return True
        return False

    def log_message(self, format, *args):
        return

if __name__ == '__main__':
    port = 8000
    if len(sys.argv) > 1:
        port = int(sys.argv[1])
    
    server = http.server.HTTPServer(('0.0.0.0', port), ExplorerHandler)
    print(f"Independent Explorer Backend started on port {port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    server.server_close()
