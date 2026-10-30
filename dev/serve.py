"""开发预览用的静态服务器：在项目根目录提供文件，并禁止浏览器缓存（改完代码刷新即生效）。

用法（在项目根目录）：python3 dev/serve.py [端口，默认 8765]
然后打开 http://127.0.0.1:8765/dev/panel-preview.html
"""
import functools
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    with http.server.ThreadingHTTPServer(('127.0.0.1', port), handler) as server:
        print(f'预览：http://127.0.0.1:{port}/dev/panel-preview.html', flush=True)
        server.serve_forever()
