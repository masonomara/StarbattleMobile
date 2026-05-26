#!/usr/bin/env python3
"""
Generate palette-matched alternate app icons (flat PNGs) for each active palette × mode.

Usage:
    python3 scripts/generate_palette_icons.py

Outputs:
    ios/StarbattleMobile/Images.xcassets/AppIcon-<name>-<mode>.appiconset/
        AppIcon.png      (1024×1024)
        Contents.json
"""

import os, json
import cairosvg
from pathlib import Path

ROOT = Path(__file__).parent.parent
XCASSETS = ROOT / 'ios/StarbattleMobile/Images.xcassets'

# ─── Palette colors: (background, text, red, gridColor) ────────────────────────
# gridColor is a muted/secondary tone for the grid lines
PALETTES = {
    'primer': {
        'dark':  ('#0D1117', '#F0F6FC', '#F85149', '#3D444D'),
        'light': ('#ffffff', '#1F2328', '#D1242F', '#8C959F'),
    },
    'github': {
        'dark':  ('#010409', '#e6edf3', '#ff7b72', '#3d444d'),
        'light': ('#f6f8fa', '#1f2328', '#cf222e', '#8c959f'),
    },
    'gruvbox': {
        'dark':  ('#282828', '#ebdbb2', '#fb4934', '#504945'),
        'light': ('#fbf1c7', '#3c3836', '#cc241d', '#7c6f64'),
    },
    'rosePine': {
        'dark':  ('#1f1d2e', '#e0def4', '#eb6f92', '#403d52'),
        'light': ('#fffaf3', '#575279', '#b4637a', '#9893a5'),
    },
    'seoul256': {
        'dark':  ('#3a3a3a', '#d0d0d0', '#d68787', '#626262'),
        'light': ('#dadada', '#4e4e4e', '#af5f5f', '#949494'),
    },
    'tokyoNight': {
        'dark':  ('#1a1b26', '#c0caf5', '#f7768e', '#414868'),
        'light': ('#e1e2e7', '#3760bf', '#f52a65', '#6172b0'),
    },
}

# ─── SVG layer content (embedded from AppIcon.icon/Assets/) ────────────────────

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

CONTENTS_JSON = {
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

# (pt size × scale) → filename, pixel size
SIZES = [
    ("AppIcon@40.png",   40),
    ("AppIcon@60.png",   60),
    ("AppIcon@58.png",   58),
    ("AppIcon@87.png",   87),
    ("AppIcon@80.png",   80),
    ("AppIcon@120.png",  120),
    ("AppIcon@180.png",  180),
    ("AppIcon@1024.png", 1024),
]


def build_composite_svg(bg: str, text: str, red: str, grid: str) -> str:
    return f"""<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- background -->
  <rect width="1024" height="1024" fill="{bg}"/>
  <!-- grid -->
  {GRID_SVG.format(grid=grid).replace('<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">', '<g>').replace('</svg>', '</g>')}
  <!-- regions -->
  {REGIONS_SVG.format(text=text).replace('<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">', '<g>').replace('</svg>', '</g>')}
  <!-- marks -->
  {MARKS_SVG.format(red=red).replace('<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">', '<g>').replace('</svg>', '</g>')}
  <!-- stars -->
  {STARS_SVG.format(text=text).replace('<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">', '<g>').replace('</svg>', '</g>')}
</svg>"""


def render_png(svg_str: str, size: int) -> bytes:
    return cairosvg.svg2png(
        bytestring=svg_str.encode(),
        output_width=size,
        output_height=size,
    )


def generate_icon(palette_name: str, mode: str, colors: tuple):
    bg, text, red, grid = colors
    icon_name = f"AppIcon-{palette_name}-{mode}"
    out_dir = XCASSETS / f"{icon_name}.appiconset"
    out_dir.mkdir(parents=True, exist_ok=True)

    svg = build_composite_svg(bg, text, red, grid)

    for filename, size in SIZES:
        png_bytes = render_png(svg, size)
        (out_dir / filename).write_bytes(png_bytes)

    # Write Contents.json
    (out_dir / "Contents.json").write_text(
        json.dumps(CONTENTS_JSON, indent=2) + "\n"
    )

    print(f"  ✓ {icon_name}")


def main():
    print("Generating palette icons...")
    for palette_name, modes in PALETTES.items():
        for mode, colors in modes.items():
            generate_icon(palette_name, mode, colors)
    print(f"\nDone — {len(PALETTES) * 2} icons written to {XCASSETS}")

    # Print the Info.plist fragment
    print("\n─── Add to Info.plist inside <dict> ───────────────────────────────")
    print("<key>CFBundleIcons</key>")
    print("<dict>")
    print("\t<key>CFBundlePrimaryIcon</key>")
    print("\t<dict>")
    print("\t\t<key>CFBundleIconName</key>")
    print("\t\t<string>AppIcon</string>")
    print("\t</dict>")
    print("\t<key>CFBundleAlternateIcons</key>")
    print("\t<dict>")
    for palette_name in PALETTES:
        for mode in ('dark', 'light'):
            icon_name = f"AppIcon-{palette_name}-{mode}"
            print(f"\t\t<key>{icon_name}</key>")
            print("\t\t<dict>")
            print(f"\t\t\t<key>CFBundleIconName</key>")
            print(f"\t\t\t<string>{icon_name}</string>")
            print("\t\t\t<key>UIPrerenderedIcon</key>")
            print("\t\t\t<true/>")
            print("\t\t</dict>")
    print("\t</dict>")
    print("</dict>")


if __name__ == "__main__":
    main()
