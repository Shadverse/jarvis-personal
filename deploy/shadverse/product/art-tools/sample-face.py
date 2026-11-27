"""Sample the CC0 MakeHuman hm08 mesh for the visible cloud and depth prepass.

Usage: python art-tools/sample-face.py path/to/base.obj
Requires NumPy and SciPy only at authoring time. See RENDERING.md for provenance.
"""
import hashlib
from pathlib import Path
import sys

import numpy as np
from scipy.ndimage import maximum_filter


def load_head(path):
    if hashlib.sha256(path.read_bytes()).hexdigest() != "8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c":
        raise ValueError("Expected the pinned MakeHuman hm08 base.obj")
    vertices, triangles, group = [], [], ""
    for line in path.read_text().splitlines():
        fields = line.split()
        if not fields:
            continue
        if fields[0] == "v":
            vertices.append(tuple(map(float, fields[1:4])))
        elif fields[0] == "g":
            group = fields[1]
        elif fields[0] == "f" and group in {"body", "helper-l-eye", "helper-r-eye"}:
            ring = [int(v.split("/")[0]) - 1 for v in fields[1:]]
            if all(vertices[index][1] > 5.67 for index in ring):
                triangles.extend((ring[0], ring[i], ring[i + 1]) for i in range(1, len(ring) - 1))
    used, local = np.unique(triangles, return_inverse=True)
    coords = (np.asarray(vertices)[used] - [0, 7.12, .58]) / 1.5
    faces = local.reshape(-1, 3)
    facets = coords[faces]
    normals = np.zeros_like(coords)
    cross = np.cross(facets[:, 1] - facets[:, 0], facets[:, 2] - facets[:, 0])
    for column in faces.T:
        np.add.at(normals, column, cross)
    normals /= np.maximum(1e-8, np.linalg.norm(normals, axis=1, keepdims=True))
    return coords, faces, normals


def sample_contours(coords, faces, normals, rng):
    # Offset successive rings slightly to follow the form without straight scan lines.
    points, directions = [], []
    for face in faces:
        tri, norm = coords[face], normals[face]
        levels = np.ceil(np.array([tri[:, 1].min(), tri[:, 1].max()]) / .0125).astype(int)
        for level in range(*levels):
            y = level * .0125
            cuts = []
            for j, k in ((0, 1), (1, 2), (2, 0)):
                if min(tri[j, 1], tri[k, 1]) <= y < max(tri[j, 1], tri[k, 1]):
                    f = (y - tri[j, 1]) / (tri[k, 1] - tri[j, 1])
                    cuts.append((tri[j] + f * (tri[k] - tri[j]), norm[j] + f * (norm[k] - norm[j])))
            if len(cuts) != 2:
                continue
            (a, na), (b, nb) = cuts
            length = np.linalg.norm(b - a)
            step = .012 if y > -.62 else .015
            for d in np.arange(rng.random() * step, length, step):
                points.append(a + (b - a) * (d / length))
                directions.append(na + (nb - na) * (d / length))
    n = np.asarray(directions)
    n /= np.maximum(1e-8, np.linalg.norm(n, axis=1, keepdims=True))
    return np.asarray(points), n


def ambient_visibility(points, normals):
    visibility = np.zeros(len(points))
    for i in range(24):
        z = (i + .5) / 12 - 1
        theta = i * 2.399963
        radius = np.sqrt(1 - z*z)
        direction = np.array([np.cos(theta)*radius, z, np.sin(theta)*radius])
        dx = np.cross(direction, [0, 1, 0])
        dx /= np.linalg.norm(dx)
        dy = np.cross(dx, direction)
        u, v = [np.clip(((points @ axis + 1.6)*82).astype(int), 0, 263) for axis in (dx, dy)]
        depth = points @ direction
        buffer = np.full((264, 264), -4.)
        np.maximum.at(buffer, (v, u), depth)
        visibility += (maximum_filter(buffer, 3)[v, u] < depth + .043) * np.maximum(0, normals @ direction)
    return np.clip(visibility / 5.8, .06, 1)


def pack(coords, normals, visibility):
    data = np.empty((len(coords), 10), dtype="u1")
    data[:, :6] = np.rint(coords*22000).astype("<i2").view("u1").reshape(-1, 6)
    data[:, 6:9] = np.rint(normals*127).astype("i1").view("u1")
    data[:, 9] = np.rint(visibility*255).astype("u1")
    return data


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1] / "web/identity"
    rng = np.random.default_rng(33)
    coords, faces, normals = load_head(Path(sys.argv[1]))
    points, directions = sample_contours(coords, faces, normals, rng)
    grain = pack(points, directions, ambient_visibility(points, directions))
    (root / "face.points").write_bytes(grain[rng.permutation(len(grain))].tobytes())
    depth = pack(coords, normals, np.ones(len(coords)))
    (root / "face.mesh").write_bytes(np.uint32(len(coords)).astype("<u4").tobytes() + depth.tobytes() + faces.astype("<u2").tobytes())
    print(len(points), "particles;", len(faces), "depth triangles;", coords.min(0), coords.max(0))
