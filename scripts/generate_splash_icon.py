#!/usr/bin/env python3
"""Generate transparent-background splash icon PNGs for the LaunchScreen."""

import json
import cairosvg
from pathlib import Path

ROOT = Path(__file__).parent.parent
XCASSETS = ROOT / 'ios/StarbattleMobile/Images.xcassets'
PRIMARY_ASSETS = ROOT / 'ios/AppIcon.icon/Assets'

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

def strip_svg(s: str) -> str:
    return (s
        .replace('<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">', '<g>')
        .replace('</svg>', '</g>'))

def build_transparent_svg(text: str, red: str, grid: str) -> str:
    return f"""<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
  {strip_svg(GRID_SVG.format(grid=grid))}
  {strip_svg(REGIONS_SVG.format(text=text))}
  {strip_svg(MARKS_SVG.format(red=red))}
  {strip_svg(STARS_SVG.format(text=text))}
</svg>"""

CONTENTS_JSON = {
    "images": [
        {
            "filename": "SplashIcon.png",
            "idiom": "universal",
            "scale": "1x"
        },
        {
            "appearances": [{"appearance": "luminosity", "value": "dark"}],
            "filename": "SplashIcon~dark.png",
            "idiom": "universal",
            "scale": "1x"
        }
    ],
    "info": {"author": "xcode", "version": 1}
}

def main():
    out_dir = XCASSETS / "SplashIcon.imageset"
    out_dir.mkdir(parents=True, exist_ok=True)

    # Light appearance: dark elements (for light background)
    svg_light = build_transparent_svg(
        text="#1F2328",
        red="#D1242F",
        grid="#59636E",
    )
    (out_dir / "SplashIcon.png").write_bytes(
        cairosvg.svg2png(bytestring=svg_light.encode(), output_width=512, output_height=512)
    )
    print("  ✓ SplashIcon.png  (light appearance — dark elements)")

    # Dark appearance: light elements (for dark background)
    svg_dark = build_transparent_svg(
        text="#F0F6FC",
        red="#F85149",
        grid="#9198A1",
    )
    (out_dir / "SplashIcon~dark.png").write_bytes(
        cairosvg.svg2png(bytestring=svg_dark.encode(), output_width=512, output_height=512)
    )
    print("  ✓ SplashIcon~dark.png  (dark appearance — light elements)")

    (out_dir / "Contents.json").write_text(json.dumps(CONTENTS_JSON, indent=2) + "\n")
    print(f"  ✓ Contents.json written to {out_dir}")
    print("\nDone.")

if __name__ == "__main__":
    main()
