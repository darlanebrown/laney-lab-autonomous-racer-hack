"""
Model preflight check -- run this before a test session.

Verifies every registered model has its weight files on disk.
Auto-extracts .tar.gz/.gz archives if the extracted file is missing.
Attempts to download from remote_path if available.

Usage:
    python -m model_registry.preflight
    python -m model_registry.preflight --fix      # auto-extract and download
    python -m model_registry.preflight --summary  # one-line status per model
"""
from __future__ import annotations

import argparse
import gzip
import shutil
import sys
import tarfile
import urllib.request
from pathlib import Path

# Make sure model_registry is importable when run directly
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from model_registry.registry_core import REGISTRY_DIR, list_models, ModelEntry

# Extensions that count as a valid model weight file
WEIGHT_EXTENSIONS = {".pb", ".onnx", ".tflite", ".pt", ".pth", ".h5"}

# MiDaS ONNX used by visual-explorer
MIDAS_ONNX_URL = (
    "https://github.com/isl-org/MiDaS/releases/download/v2_1/"
    "model-small.onnx"
)
MIDAS_DEST = REGISTRY_DIR / "models" / "custom" / "visual-explorer" / "model-small.onnx"


def _find_weight_file(path: Path) -> Path | None:
    """Return the first weight file found at path (file or directory)."""
    if path.is_file() and path.suffix in WEIGHT_EXTENSIONS:
        return path
    if path.is_dir():
        for ext in WEIGHT_EXTENSIONS:
            found = sorted(path.rglob(f"*{ext}"))
            if found:
                return found[0]
    return None


def _find_archive(path: Path) -> Path | None:
    """Return the first .tar.gz or .gz archive at path (file or directory)."""
    if path.is_file() and (path.name.endswith(".tar.gz") or path.suffix == ".gz"):
        return path
    if path.is_dir():
        for pat in ("*.tar.gz", "*.gz"):
            found = sorted(path.glob(pat))
            if found:
                return found[0]
    return None


def _extract_archive(archive: Path, dest_dir: Path) -> Path | None:
    """Extract a .tar.gz or .gz archive and return the extracted weight file."""
    print(f"  Extracting {archive.name} ...")
    try:
        if tarfile.is_tarfile(archive):
            with tarfile.open(archive) as tf:
                tf.extractall(dest_dir)
        elif archive.suffix == ".gz":
            out_path = dest_dir / archive.stem
            with gzip.open(archive, "rb") as f_in, open(out_path, "wb") as f_out:
                shutil.copyfileobj(f_in, f_out)
        return _find_weight_file(dest_dir)
    except Exception as e:
        print(f"  ERROR extracting: {e}")
        return None


def _download_file(url: str, dest: Path) -> bool:
    """Download a single file from url to dest. Returns True on success."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"  Downloading {url} ...")
    try:
        urllib.request.urlretrieve(url, dest)
        print(f"  Saved to {dest}")
        return True
    except Exception as e:
        print(f"  ERROR downloading: {e}")
        return False


def check_model(entry: ModelEntry, fix: bool = False) -> dict:
    """
    Check a single model entry.
    Returns a status dict: {name, status, detail, weight_file}.
    """
    name = entry.display_name
    model_id = entry.id

    # visual-explorer is Python code -- check for MiDaS ONNX instead
    if entry.format == "python-runtime":
        if MIDAS_DEST.exists():
            return {
                "id": model_id, "name": name,
                "status": "ready",
                "detail": f"MiDaS ONNX found: {MIDAS_DEST.name}",
                "weight_file": MIDAS_DEST,
            }
        if fix:
            print(f"\n[{name}]")
            ok = _download_file(MIDAS_ONNX_URL, MIDAS_DEST)
            if ok:
                return {
                    "id": model_id, "name": name,
                    "status": "ready",
                    "detail": "MiDaS ONNX downloaded",
                    "weight_file": MIDAS_DEST,
                }
        return {
            "id": model_id, "name": name,
            "status": "missing",
            "detail": (
                f"MiDaS ONNX not found at {MIDAS_DEST}\n"
                f"    Fix: python -m model_registry.preflight --fix\n"
                f"    Or:  curl -L {MIDAS_ONNX_URL} -o {MIDAS_DEST}"
            ),
            "weight_file": None,
        }

    # Resolve local_path
    if not entry.local_path:
        return {
            "id": model_id, "name": name,
            "status": "no_path",
            "detail": "No local_path set in registry",
            "weight_file": None,
        }

    src = Path(entry.local_path)
    if not src.is_absolute():
        src = REGISTRY_DIR / src

    # Already has a weight file
    weight = _find_weight_file(src)
    if weight:
        size_mb = weight.stat().st_size / (1024 * 1024)
        return {
            "id": model_id, "name": name,
            "status": "ready",
            "detail": f"{weight.name} ({size_mb:.1f} MB)",
            "weight_file": weight,
        }

    # No weight file -- try auto-fix
    if fix:
        print(f"\n[{name}]")

        # Try extracting a local archive first
        archive = _find_archive(src)
        if archive:
            extracted = _extract_archive(archive, src if src.is_dir() else src.parent)
            if extracted:
                size_mb = extracted.stat().st_size / (1024 * 1024)
                return {
                    "id": model_id, "name": name,
                    "status": "ready",
                    "detail": f"Extracted {extracted.name} ({size_mb:.1f} MB)",
                    "weight_file": extracted,
                }

        # Try downloading from remote_path if it looks like a direct file URL
        if entry.remote_path and entry.remote_path.startswith("http"):
            url = entry.remote_path
            filename = url.split("/")[-1]
            dest = (src if src.is_dir() else src.parent) / filename
            ok = _download_file(url, dest)
            if ok:
                # Try extracting downloaded archive
                if dest.name.endswith(".tar.gz") or dest.suffix == ".gz":
                    extracted = _extract_archive(dest, dest.parent)
                    if extracted:
                        size_mb = extracted.stat().st_size / (1024 * 1024)
                        return {
                            "id": model_id, "name": name,
                            "status": "ready",
                            "detail": f"Downloaded + extracted {extracted.name} ({size_mb:.1f} MB)",
                            "weight_file": extracted,
                        }
                weight = _find_weight_file(dest.parent)
                if weight:
                    size_mb = weight.stat().st_size / (1024 * 1024)
                    return {
                        "id": model_id, "name": name,
                        "status": "ready",
                        "detail": f"Downloaded {weight.name} ({size_mb:.1f} MB)",
                        "weight_file": weight,
                    }

    # Couldn't fix -- report what to do
    archive = _find_archive(src)
    if archive and not fix:
        detail = (
            f"Archive found ({archive.name}) but not extracted.\n"
            f"    Fix: python -m model_registry.preflight --fix"
        )
    elif entry.remote_path:
        detail = (
            f"No weight file in {src}\n"
            f"    Remote: {entry.remote_path}\n"
            f"    Fix: python -m model_registry.preflight --fix"
        )
    else:
        detail = (
            f"No weight file in {src} and no remote_path set.\n"
            f"    You must manually place the model file there."
        )

    return {
        "id": model_id, "name": name,
        "status": "missing",
        "detail": detail,
        "weight_file": None,
    }


def run_preflight(fix: bool = False, summary: bool = False) -> int:
    """Run preflight checks for all registered models. Returns exit code."""
    models = list_models(include_archived=False)
    if not models:
        print("No models registered.")
        return 1

    results = []
    for entry in models:
        if not summary and not fix:
            print(f"Checking {entry.display_name} ...", end=" ", flush=True)
        result = check_model(entry, fix=fix)
        results.append(result)
        if not summary:
            icon = "OK" if result["status"] == "ready" else "MISSING"
            print(f"[{icon}]")
            if result["status"] != "ready":
                for line in result["detail"].splitlines():
                    print(f"    {line}")

    # Summary table
    print()
    ready = [r for r in results if r["status"] == "ready"]
    missing = [r for r in results if r["status"] != "ready"]

    print(f"{'Model':<45} {'Status':<10} {'Detail'}")
    print("-" * 90)
    for r in results:
        status = "READY" if r["status"] == "ready" else "MISSING"
        detail = r["detail"].splitlines()[0] if r["detail"] else ""
        print(f"{r['name']:<45} {status:<10} {detail}")

    print()
    print(f"{len(ready)}/{len(results)} models ready.")

    if missing:
        print()
        print("To fix automatically:")
        print("    python -m model_registry.preflight --fix")
        print()
        print("Models that cannot be auto-fixed (must be placed manually):")
        for r in missing:
            if "manually" in r["detail"]:
                print(f"    {r['id']}: place weight file in {r['detail'].split('in ')[-1].split()[0]}")
        return 1

    print("All models ready for deployment.")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Model preflight check")
    parser.add_argument("--fix", action="store_true", help="Auto-extract archives and download missing files")
    parser.add_argument("--summary", action="store_true", help="One-line status per model")
    args = parser.parse_args()
    sys.exit(run_preflight(fix=args.fix, summary=args.summary))


if __name__ == "__main__":
    main()
