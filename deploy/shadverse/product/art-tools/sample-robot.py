"""Generate quantized voice geometry from Mint's CC0 humanoid robot GLB.

Usage: python sample-robot.py /path/to/humanoid-robot.glb
Requires NumPy and Pillow. The original mesh and textures are never shipped.
"""
import hashlib
import io
import json
from pathlib import Path
import struct
import sys

import numpy as np
from PIL import Image


source = Path(sys.argv[1]).read_bytes()
if hashlib.sha256(source).hexdigest() != "eda8db07f47d5b868fa3459767e2c238012d718ca4fef564cea9cb3025be1841":
    raise SystemExit("The GLB does not match the reviewed Mint source.")
length = struct.unpack_from("<I", source, 12)[0]
model = json.loads(source[20 : 20 + length])
binary = memoryview(source)[28 + length :]


def buffer(index):
    view = model["bufferViews"][index]
    start = view.get("byteOffset", 0)
    return binary[start : start + view["byteLength"]]


positions = np.frombuffer(buffer(0), "<f4").reshape(-1, 3)
normals = np.frombuffer(buffer(1), "<f4").reshape(-1, 3)
uv = np.frombuffer(buffer(2), "<f4").reshape(-1, 2)
faces = np.frombuffer(buffer(3), "<u4").reshape(-1, 3)
faces = faces[(positions[faces, 1] >= 0.727).all(axis=1)]
head = positions.copy()
head -= [0.002, 0.842, 0.019]
head *= 7.8
triangles = head[faces]
areas = np.linalg.norm(np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0]), axis=1)
rng = np.random.default_rng(11027)
chosen = faces[rng.choice(len(faces), size=42000, p=areas / areas.sum())]
weights = rng.random((len(chosen), 2))
weights[weights.sum(axis=1) > 1] = 1 - weights[weights.sum(axis=1) > 1]
weights = np.column_stack([1 - weights.sum(axis=1), weights])
points = (head[chosen] * weights[:, :, None]).sum(axis=1)
directions = (normals[chosen] * weights[:, :, None]).sum(axis=1)
directions /= np.linalg.norm(directions, axis=1, keepdims=True).clip(1e-6)

texture = np.asarray(Image.open(io.BytesIO(buffer(4))).convert("RGB"), dtype=float) / 255
tex = (uv[chosen] * weights[:, :, None]).sum(axis=1)
x = np.clip((tex[:, 0] * texture.shape[1]).astype(int), 0, texture.shape[1] - 1)
y = np.clip((tex[:, 1] * texture.shape[0]).astype(int), 0, texture.shape[0] - 1)
r, g, b = texture[y, x].T
# Cyan accents distinguish the eyes and side sensors even at lower particle density.
emissive = (g > 0.39) & (g > 1.27 * r) & (b > 1.14 * r) & (points[:, 1] > -0.24)
value = np.where(emissive, 255, np.round(105 + 101 * (0.26 * r + 0.53 * g + 0.21 * b)))


def pack(xyz, direction, intensity):
    out = np.empty(len(xyz), dtype=[("p", "<i2", 3), ("n", "i1", 3), ("v", "u1")])
    out["p"] = np.round(xyz * 22000)
    out["n"] = np.round(direction * 127)
    out["v"] = intensity
    return out.tobytes()


ids, remap = np.unique(faces.flatten(), return_inverse=True)
out = Path(__file__).resolve().parents[1] / "web/identity"
(out / "robot.points").write_bytes(pack(points, directions, value))
(out / "robot.mesh").write_bytes(
    struct.pack("<I", len(ids)) + pack(head[ids], normals[ids], 0) + remap.astype("<u2").tobytes()
)
