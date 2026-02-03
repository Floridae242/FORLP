#!/usr/bin/env python3
"""
Health Check Server สำหรับ Railway
"""
import os
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from threading import Thread
from datetime import datetime
from typing import Optional

# Global status
service_status = {
    "status": "starting",
    "last_process": None,
    "cameras_active": 0,
    "total_processed": 0
}

class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health" or self.path == "/":
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            response = {
                "status": "ok",
                "service": "ai-people-counting",
                "version": "2.0.0",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                **service_status
            }
            self.wfile.write(json.dumps(response).encode())
        else:
            self.send_response(404)
            self.end_headers()
    
    def log_message(self, format, *args):
        pass  # Suppress logs

def start_health_server(port: Optional[int] = None):
    """Start health check server in background thread"""
    # ใช้ PORT จาก Railway environment variable (default 8080)
    if port is None:
        port = int(os.environ.get('PORT', 8080))
    
    server = HTTPServer(('0.0.0.0', port), HealthHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(f"🏥 Health server running on port {port}")
    return server

def update_status(status: Optional[str] = None, cameras: Optional[int] = None, processed: Optional[int] = None):
    """Update service status"""
    if status:
        service_status["status"] = status
    if cameras is not None:
        service_status["cameras_active"] = cameras
    if processed is not None:
        service_status["total_processed"] = processed
    service_status["last_process"] = datetime.utcnow().isoformat() + "Z"
