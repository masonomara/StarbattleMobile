#!/usr/bin/env python3
"""
Generate palette-matched alternate app icons for each active palette.

Produces two sets:
  1. Layered .icon packages (iOS 26+) — one per palette, OS handles dark/tinted/clear
  2. Flat PNG appiconsets (iOS <26 fallback) — one per palette × mode

Usage:
    python3 scripts/generate_palette_icons.py
"""

import json, shutil
import cairosvg
from pathlib import Path

ROOT = Path(__file__).parent.parent
XCASSETS = ROOT / 'ios/StarbattleMobile/Images.xcassets'
IOS_DIR = ROOT / 'ios'
PRIMARY_ASSETS = ROOT / 'ios/AppIcon.icon/Assets'

# ─── Palette colors: (background, text, red, gridColor) ────────────────────────
PALETTES = {
    'original': {
        'dark':  ('#0D1117', '#F0F6FC', '#F85149', '#9198A1'),
        'light': ('#ffffff', '#1F2328', '#D1242F', '#59636E'),
    },
    'primer': {
        'dark':  ('#010409', '#e6edf3', '#ff7b72', '#9499A1'),
        'light': ('#f6f8fa', '#1f2328', '#cf222e', '#5F6267'),
    },
    'gruvbox': {
        'dark':  ('#282828', '#ebdbb2', '#cc241d', '#9D937B'),
        'light': ('#fbf1c7', '#3c3836', '#cc241d', '#756F61'),
    },
    'rosePine': {
        'dark':  ('#1f1d2e', '#e0def4', '#eb6f92', '#9391A5'),
        'light': ('#fffaf3', '#575279', '#b4637a', '#9A95AA'),
    },
    'seoul256': {
        'dark':  ('#3a3a3a', '#d0d0d0', '#d68787', '#949494'),
        'light': ('#dadada', '#4e4e4e', '#af5f5f', '#787878'),
    },
    'tokyoNight': {
        'dark':  ('#1a1b26', '#c0caf5', '#f7768e', '#7E84A2'),
        'light': ('#e1e2e7', '#3760bf', '#f52a65', '#7B94CF'),
    },
}

# ─── SVG layer templates ────────────────────────────────────────────────────────

GRID_SVG = """<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="1040" height="20" transform="translate(-8 822)" fill="{grid}"/>
<rect width="1040" height="20" transform="translate(-8 502)" fill="{grid}"/>
<rect width="1040" height="20" transform="translate(-8 182)" fill="{grid}"/>
<rect width="1040" height="20" transform="matrix(0 -1 1 0 822 1032)" fill="{grid}"/>
<rect width="1040" height="20" transform="matrix(0 -1 1 0 502 1032)" fill="{grid}"/>
<rect width="1040" height="20" transform="matrix(0 -1 1 0 182 1032)" fill="{grid}"/>
</svg>"""

REGIONS_SVG = """<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="339" height="40" transform="matrix(0 -1 1 0 812 512)" fill="{text}"/>
<rect width="1032" height="40" transform="matrix(0 -1 1 0 172 1032)" fill="{text}"/>
<rect width="1163" height="40" transform="translate(172 812)" fill="{text}"/>
<rect width="271" height="40" transform="translate(812 492)" fill="{text}"/>
<rect width="671" height="40" transform="translate(172 173)" fill="{text}"/>
</svg>"""

MARKS_SVG = """<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M72 632L-8 712M-8 632L72 712" stroke="{red}" stroke-width="26" stroke-linecap="square" stroke-linejoin="round"/>
<path d="M72 312L-8 392M-8 312L72 392" stroke="{red}" stroke-width="26" stroke-linecap="square" stroke-linejoin="round"/>
<path d="M72 -8L-8 72M-8 -8L72 72" stroke="{red}" stroke-width="26" stroke-linecap="square" stroke-linejoin="round"/>
<path d="M392 -8L312 72M312 -8L392 72" stroke="{red}" stroke-width="26" stroke-linecap="square" stroke-linejoin="round"/>
<path d="M712 -8L632 72M632 -8L712 72" stroke="{red}" stroke-width="26" stroke-linecap="square" stroke-linejoin="round"/>
<path d="M1032 -8L952 72M952 -8L1032 72" stroke="{red}" stroke-width="26" stroke-linecap="square" stroke-linejoin="round"/>
<path d="M1032 312L952 392M952 312L1032 392" stroke="{red}" stroke-width="26" stroke-linecap="square" stroke-linejoin="round"/>
<path d="M1032 952L952 1032M952 952L1032 1032" stroke="{red}" stroke-width="26" stroke-linecap="square" stroke-linejoin="round"/>
<path d="M712 952L632 1032M632 952L712 1032" stroke="{red}" stroke-width="26" stroke-linecap="square" stroke-linejoin="round"/>
<path d="M72 952L-8 1032M-8 952L72 1032" stroke="{red}" stroke-width="26" stroke-linecap="square" stroke-linejoin="round"/>
<path d="M392 632L312 712M312 632L392 712" stroke="{red}" stroke-width="26" stroke-linecap="square" stroke-linejoin="round"/>
<path d="M712 632L632 712M632 632L712 712" stroke="{red}" stroke-width="26" stroke-linecap="square" stroke-linejoin="round"/>
<path d="M712 312L632 392M632 312L712 392" stroke="{red}" stroke-width="26" stroke-linecap="square" stroke-linejoin="round"/>
</svg>"""

STARS_SVG = """<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M352 412.605L423.07 455.5L404.21 374.655L467 320.26L384.315 313.245L352 237L319.685 313.245L237 320.26L299.79 374.655L280.93 455.5L352 412.605Z" fill="{text}"/>
<path d="M352 1052.61L423.07 1095.5L404.21 1014.66L467 960.26L384.315 953.245L352 877L319.685 953.245L237 960.26L299.79 1014.66L280.93 1095.5L352 1052.61Z" fill="{text}"/>
<path d="M992 732.605L1063.07 775.5L1044.21 694.655L1107 640.26L1024.31 633.245L992 557L959.685 633.245L877 640.26L939.79 694.655L920.93 775.5L992 732.605Z" fill="{text}"/>
</svg>"""

# ─── Flat PNG sizes ─────────────────────────────────────────────────────────────

FLAT_SIZES = [
    ("AppIcon@40.png",   40),
    ("AppIcon@60.png",   60),
    ("AppIcon@58.png",   58),
    ("AppIcon@87.png",   87),
    ("AppIcon@80.png",   80),
    ("AppIcon@120.png",  120),
    ("AppIcon@180.png",  180),
    ("AppIcon@1024.png", 1024),
]

FLAT_CONTENTS_JSON = {
    "images": [
        {"idiom": "iphone", "scale": "2x", "size": "20x20",   "filename": "AppIcon@40.png"},
        {"idiom": "iphone", "scale": "3x", "size": "20x20",   "filename": "AppIcon@60.png"},
        {"idiom": "iphone", "scale": "2x", "size": "29x29",   "filename": "AppIcon@58.png"},
        {"idiom": "iphone", "scale": "3x", "size": "29x29",   "filename": "AppIcon@87.png"},
        {"idiom": "iphone", "scale": "2x", "size": "40x40",   "filename": "AppIcon@80.png"},
        {"idiom": "iphone", "scale": "3x", "size": "40x40",   "filename": "AppIcon@120.png"},
        {"idiom": "iphone", "scale": "2x", "size": "60x60",   "filename": "AppIcon@120.png"},
        {"idiom": "iphone", "scale": "3x", "size": "60x60",   "filename": "AppIcon@180.png"},
        {"idiom": "ios-marketing", "scale": "1x", "size": "1024x1024", "filename": "AppIcon@1024.png"},
    ],
    "info": {"author": "xcode", "version": 1},
}

# ─── Helpers ────────────────────────────────────────────────────────────────────

def hex_to_srgb(hex_color: str) -> str:
    h = hex_color.lstrip('#')[:6]
    r = int(h[0:2], 16) / 255
    g = int(h[2:4], 16) / 255
    b = int(h[4:6], 16) / 255
    return f"srgb:{r:.5f},{g:.5f},{b:.5f},1.00000"

def srgb_solid(hex_color: str) -> dict:
    return {"solid": hex_to_srgb(hex_color)}

def make_layer(image_name: str, name: str,
               default_hex: str, dark_hex: str, tinted_srgb: str,
               extra: dict | None = None) -> dict:
    layer: dict = {
        "fill-specializations": [
            {"value": srgb_solid(default_hex)},
            {"appearance": "dark",   "value": srgb_solid(dark_hex)},
            {"appearance": "tinted", "value": {"solid": tinted_srgb}},
        ],
        "glass": True,
        "image-name": image_name,
        "name": name,
    }
    if extra:
        layer.update(extra)
    return layer

def build_icon_json(light: tuple, dark: tuple) -> dict:
    bg_l, text_l, red_l, grid_l = light
    bg_d, text_d, red_d, grid_d = dark
    return {
        "fill-specializations": [
            {"value": {"solid": hex_to_srgb(bg_l)}},
            {"appearance": "dark", "value": {"solid": hex_to_srgb(bg_d)}},
        ],
        "groups": [{
            "layers": [
                make_layer("stars.svg", "stars", text_l, text_d,
                           "srgb:1.00000,1.00000,1.00000,1.00000"),
                make_layer("regions.svg", "regions", text_l, text_d,
                           "srgb:1.00000,1.00000,1.00000,1.00000",
                           extra={"blend-mode": "normal"}),
                make_layer("marks.svg", "marks", red_l, red_d,
                           "srgb:0.58039,0.58039,0.58039,1.00000",
                           extra={"opacity": 1}),
                make_layer("grid.svg", "grid", grid_l, grid_d,
                           "srgb:0.52941,0.52941,0.52941,1.00000",
                           extra={"hidden": False, "opacity": 1}),
            ],
            "shadow":       {"kind": "neutral", "opacity": 0.5},
            "specular":     True,
            "translucency": {"enabled": True, "value": 0.5},
        }],
        "supported-platforms": {"circles": ["watchOS"], "squares": "shared"},
    }

def build_composite_svg(bg: str, text: str, red: str, grid: str) -> str:
    def strip_svg(s: str) -> str:
        return (s
            .replace('<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">', '<g>')
            .replace('</svg>', '</g>'))
    return f"""<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="{bg}"/>
  {strip_svg(GRID_SVG.format(grid=grid))}
  {strip_svg(REGIONS_SVG.format(text=text))}
  {strip_svg(MARKS_SVG.format(red=red))}
  {strip_svg(STARS_SVG.format(text=text))}
</svg>"""

# ─── Generators ────────────────────────────────────────────────────────────────

def generate_layered_icon(palette_name: str, colors: dict):
    """Generate a .icon package for iOS 26 layered alternate icons."""
    icon_dir = IOS_DIR / f"AppIcon-{palette_name}.icon"
    assets_dir = icon_dir / "Assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    for svg in ["grid.svg", "marks.svg", "regions.svg", "stars.svg"]:
        shutil.copy2(PRIMARY_ASSETS / svg, assets_dir / svg)

    icon_json = build_icon_json(colors['light'], colors['dark'])
    (icon_dir / "icon.json").write_text(json.dumps(icon_json, indent=2) + "\n")
    print(f"  ✓ AppIcon-{palette_name}.icon  (layered)")


def generate_flat_icon(palette_name: str, mode: str, colors: tuple):
    """Generate a flat PNG appiconset for iOS <26 fallback."""
    bg, text, red, grid = colors
    icon_name = f"AppIcon-{palette_name}-{mode}"
    out_dir = XCASSETS / f"{icon_name}.appiconset"
    out_dir.mkdir(parents=True, exist_ok=True)

    svg = build_composite_svg(bg, text, red, grid)
    for filename, size in FLAT_SIZES:
        (out_dir / filename).write_bytes(
            cairosvg.svg2png(bytestring=svg.encode(), output_width=size, output_height=size)
        )
    (out_dir / "Contents.json").write_text(json.dumps(FLAT_CONTENTS_JSON, indent=2) + "\n")
    print(f"  ✓ AppIcon-{palette_name}-{mode}.appiconset  (flat PNG fallback)")


def print_info_plist_additions():
    print("\n─── NEW entries to add inside CFBundleAlternateIcons in Info.plist ───")
    for name in PALETTES:
        print(f'\t\t<key>AppIcon-{name}</key>')
        print('\t\t<dict>')
        print('\t\t\t<key>CFBundleIconName</key>')
        print(f'\t\t\t<string>AppIcon-{name}</string>')
        print('\t\t\t<key>UIPrerenderedIcon</key>')
        print('\t\t\t<true/>')
        print('\t\t</dict>')


def main():
    if not PRIMARY_ASSETS.exists():
        print("ERROR: ios/AppIcon.icon/Assets not found.")
        print("Run: git checkout origin/icon -- ios/AppIcon.icon")
        return

    print("Generating layered .icon packages (iOS 26+)...")
    for name, modes in PALETTES.items():
        generate_layered_icon(name, modes)

    print("\nGenerating flat PNG appiconsets (iOS <26 fallback)...")
    for name, modes in PALETTES.items():
        for mode, colors in modes.items():
            generate_flat_icon(name, mode, colors)

    print(f"\nDone — {len(PALETTES)} layered icons, {len(PALETTES) * 2} flat icons")
    print_info_plist_additions()


if __name__ == "__main__":
    main()
