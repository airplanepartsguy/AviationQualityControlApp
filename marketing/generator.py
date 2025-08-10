#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any, Dict, List
import urllib.parse as urlparse
from datetime import date, datetime

import yaml
from jinja2 import Environment, FileSystemLoader, select_autoescape


def load_yaml(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def set_deep_value(target: Dict[str, Any], dotted_path: str, value: str) -> None:
    parts = dotted_path.split(".")
    current: Dict[str, Any] = target
    for key in parts[:-1]:
        if key not in current or not isinstance(current[key], dict):
            current[key] = {}
        current = current[key]
    current[parts[-1]] = value


def build_env(templates_dir: Path) -> Environment:
    env = Environment(
        loader=FileSystemLoader(str(templates_dir)),
        autoescape=select_autoescape(["html", "xml"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )

    def with_utm(url: str, utm: Dict[str, str] | None = None, extra: Dict[str, str] | None = None) -> str:
        if not url:
            return url
        utm = utm or {}
        extra = extra or {}
        parsed = urlparse.urlparse(url)
        query = dict(urlparse.parse_qsl(parsed.query))
        merged = {
            **query,
            **{k: v for k, v in {
                "utm_source": utm.get("source"),
                "utm_medium": utm.get("medium"),
                "utm_campaign": utm.get("campaign"),
                "utm_content": utm.get("content"),
            }.items() if v},
            **extra,
        }
        new_query = urlparse.urlencode(merged, doseq=True)
        return urlparse.urlunparse(parsed._replace(query=new_query))

    def to_year(value: Any) -> str:
        try:
            if isinstance(value, (date, datetime)):
                return str(value.year)
            if isinstance(value, str):
                if len(value) >= 4 and value[:4].isdigit():
                    return value[:4]
        except Exception:
            pass
        return ""

    env.filters["with_utm"] = with_utm
    env.filters["year"] = to_year
    return env


def discover_templates(templates_dir: Path) -> List[Path]:
    return sorted(p for p in templates_dir.glob("**/*") if p.is_file() and p.suffix == ".j2")


def target_path_for(template_rel_path: Path, out_dir: Path) -> Path:
    # Preserve subdirectories and strip only the trailing .j2 suffix
    stripped = template_rel_path.with_suffix("")
    return out_dir / stripped


def render_all(product_dict: Dict[str, Any], templates_dir: Path, out_dir: Path) -> None:
    env = build_env(templates_dir)
    ensure_dir(out_dir)

    context = {**product_dict}

    for tpl_path in discover_templates(templates_dir):
        rel_path = tpl_path.relative_to(templates_dir)
        template = env.get_template(str(rel_path))
        output = template.render(**context)
        out_path = target_path_for(rel_path, out_dir)
        ensure_dir(out_path.parent)
        out_file = out_path
        out_file.write_text(output.strip() + "\n", encoding="utf-8")
        print(f"Wrote {out_file}")


def parse_args(argv: List[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate marketing assets from YAML + Jinja2 templates")
    parser.add_argument("--product", default="marketing/product.yaml", help="Path to product.yaml")
    parser.add_argument("--templates", default="marketing/templates", help="Templates directory")
    parser.add_argument("--out", default="marketing/dist", help="Output directory")
    parser.add_argument("--set", action="append", dest="overrides", default=[], help="Override values (dot.path=value)")
    return parser.parse_args(argv)


def apply_overrides(data: Dict[str, Any], overrides: List[str]) -> None:
    for item in overrides:
        if "=" not in item:
            continue
        path, value = item.split("=", 1)
        set_deep_value(data, path.strip(), value)


def main(argv: List[str]) -> int:
    args = parse_args(argv)
    product_path = Path(args.product)
    templates_dir = Path(args.templates)
    out_dir = Path(args.out)

    if not product_path.exists():
        print(f"ERROR: product file not found: {product_path}", file=sys.stderr)
        return 2
    if not templates_dir.exists():
        print(f"ERROR: templates dir not found: {templates_dir}", file=sys.stderr)
        return 2

    data = load_yaml(product_path)
    apply_overrides(data, args.overrides)

    render_all(data, templates_dir, out_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))