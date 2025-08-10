# Marketing Generator

This folder lets you generate core marketing assets from one source of truth (`product.yaml`).

## Quick start

1) Create virtual env and install deps

```bash
python3 -m venv .venv && . .venv/bin/activate && pip install -r marketing/requirements.txt
```

2) Edit `marketing/product.yaml` with your product details.

3) Generate assets

```bash
python marketing/generator.py --product marketing/product.yaml --templates marketing/templates --out marketing/dist
```

Outputs will be in `marketing/dist/`.

## Override fields at runtime

```bash
python marketing/generator.py --set product.name="Acme" --set utm.campaign="beta-launch"
```

## What gets generated

- One‑pager (Markdown)
- Landing page (HTML)
- Email sequence (Markdown)
- Social posts (Markdown)
- Press release (Markdown)

## Customize templates

Edit files in `marketing/templates/`. They use Jinja2 (`{{ variable }}`) placeholders sourced from `product.yaml`.

## CI artifact build (optional)

A workflow file in `.github/workflows/marketing.yml` builds and uploads the generated assets as an artifact on every push to `marketing/**`.