#!/usr/bin/env python3
# Generates a solid-color RGBA PNG with no third-party deps (stdlib zlib/struct).
# Used only to produce a Tauri icon source. Usage: python3 make_icon.py out.png [size]
import sys, zlib, struct

def png(path, size=512, rgba=(30, 27, 75, 255)):  # indigo #1e1b4b
    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)
    row = bytes(rgba) * size
    raw = b"".join(b"\x00" + row for _ in range(size))  # filter byte 0 per row
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit, color type 6 = RGBA
    data = (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(raw, 9))
            + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(data)

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "icon-src.png"
    sz = int(sys.argv[2]) if len(sys.argv) > 2 else 512
    png(out, sz)
    print("wrote", out, sz, "x", sz)
