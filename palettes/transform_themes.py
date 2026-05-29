#!/usr/bin/env python3
import re
import sys
import os


def parse_toml_colors(content):
    sections = {}
    current_section = None
    for line in content.splitlines():
        line = line.strip()
        if not line:
            continue
        m = re.match(r'^\[(.+)\]$', line)
        if m:
            current_section = m.group(1)
            sections[current_section] = {}
            continue
        m = re.match(r'^(\w+)\s*=\s*"(#[0-9a-fA-F]+)"$', line)
        if m and current_section:
            sections[current_section][m.group(1)] = m.group(2)
    return sections


def to_camel_case(name):
    parts = name.split('-')
    return parts[0] + ''.join(p.capitalize() for p in parts[1:])


def to_label(name):
    return ' '.join(p.capitalize() for p in name.split('-'))


def transform_theme(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    sections = parse_toml_colors(content)
    name_no_ext = os.path.splitext(os.path.basename(filepath))[0]
    is_light = name_no_ext.endswith('-light')

    foreground = sections.get('colors.primary', {}).get('foreground', '')
    background = sections.get('colors.primary', {}).get('background', '')
    normal = sections.get('colors.normal', {})
    bright = sections.get('colors.bright', {})

    fg_hex = foreground.lstrip('#')

    if is_light:
        text_secondary = f"#{fg_hex}b3"
        surface = background
        border = f"#{fg_hex}2e"
        puzzle_inner_border = f"#{fg_hex}b3"
    else:
        text_secondary = f"#{fg_hex}99"
        surface = f"#{fg_hex}0d"
        border = f"#{fg_hex}38"
        puzzle_inner_border = f"#{fg_hex}38"

    red = normal.get('red', '')
    green = normal.get('green', '')
    yellow = normal.get('yellow', '')
    blue = normal.get('blue', '')
    magenta = normal.get('magenta', '')
    cyan = normal.get('cyan', '')

    red_bright = bright.get('red', '')
    green_bright = bright.get('green', '')
    yellow_bright = bright.get('yellow', '')
    blue_bright = bright.get('blue', '')
    magenta_bright = bright.get('magenta', '')
    cyan_bright = bright.get('cyan', '')

    lines = [
        '[colors.roles]',
        f'text = "{foreground}"',
        f'textSecondary = "{text_secondary}"',
        f'background = "{background}"',
        f'surface = "{surface}"',
        f'border = "{border}"',
        f'puzzleBorder = "{foreground}"',
        f'puzzleInnerBorder = "{puzzle_inner_border}"',
        f'blue = "{blue}"',
        f'red = "{red}"',
        f'green = "{green}"',
        f'yellow = "{yellow}"',
        '',
        '[colors.regions]',
        f'red = "{red}"',
        f'green = "{green}"',
        f'yellow = "{yellow}"',
        f'blue = "{blue}"',
        f'magenta = "{magenta}"',
        f'cyan = "{cyan}"',
        f'redBright = "{red_bright}"',
        f'greenBright = "{green_bright}"',
        f'yellowBright = "{yellow_bright}"',
        f'blueBright = "{blue_bright}"',
        f'magentaBright = "{magenta_bright}"',
        f'cyanBright = "{cyan_bright}"',
    ]

    with open(filepath, 'w') as f:
        f.write('\n'.join(lines) + '\n')

    print(f"Transformed: {filepath}")

    return parse_toml_colors('\n'.join(lines))


def emit_typescript(filepath, sections):
    name_no_ext = os.path.splitext(os.path.basename(filepath))[0]
    camel = to_camel_case(name_no_ext)
    label = to_label(name_no_ext)
    roles = sections.get('colors.roles', {})
    regions = sections.get('colors.regions', {})

    def q(v):
        return f"'{v}'"

    lines = [
        f'// ─── {label.upper()} ' + '─' * max(0, 76 - len(label)) ,
        '',
        f'const {camel}: ThemeColors = {{',
        '  roles: {',
        f"    text: {q(roles.get('text', ''))},",
        f"    textSecondary: {q(roles.get('textSecondary', ''))},",
        f"    background: {q(roles.get('background', ''))},",
        f"    surface: {q(roles.get('surface', ''))},",
        f"    border: {q(roles.get('border', ''))},",
        f"    puzzleBorder: {q(roles.get('puzzleBorder', ''))},",
        f"    puzzleInnerBorder: {q(roles.get('puzzleInnerBorder', ''))},",
        f"    blue: {q(roles.get('blue', ''))},",
        f"    red: {q(roles.get('red', ''))},",
        f"    green: {q(roles.get('green', ''))},",
        f"    yellow: {q(roles.get('yellow', ''))},",
        '  },',
        '  regions: {',
        f"    red: {q(regions.get('red', ''))},",
        f"    green: {q(regions.get('green', ''))},",
        f"    yellow: {q(regions.get('yellow', ''))},",
        f"    blue: {q(regions.get('blue', ''))},",
        f"    magenta: {q(regions.get('magenta', ''))},",
        f"    cyan: {q(regions.get('cyan', ''))},",
        f"    redBright: {q(regions.get('redBright', ''))},",
        f"    greenBright: {q(regions.get('greenBright', ''))},",
        f"    yellowBright: {q(regions.get('yellowBright', ''))},",
        f"    blueBright: {q(regions.get('blueBright', ''))},",
        f"    magentaBright: {q(regions.get('magentaBright', ''))},",
        f"    cyanBright: {q(regions.get('cyanBright', ''))},",
        '  },',
        '};',
        '',
        '// Add to PALETTES:',
        f'//   {camel},',
        '// Add to PALETTE_META:',
        f"//   {camel}: {{ label: '{label}' }},",
        '// Add to ThemeName in types.ts:',
        f"//   | '{camel}'",
    ]

    print('\n'.join(lines))


def main():
    emit_ts = '--ts' in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith('--')]

    if not args:
        print("Usage: python transform_themes.py [--ts] <file.toml> [file2.toml ...]")
        print("       python transform_themes.py [--ts] packs/")
        sys.exit(1)

    files = []
    for path in args:
        if os.path.isdir(path):
            for f in sorted(os.listdir(path)):
                if f.endswith('.toml'):
                    files.append(os.path.join(path, f))
        elif os.path.isfile(path):
            files.append(path)
        else:
            print(f"Warning: {path} not found")

    for filepath in files:
        with open(filepath, 'r') as f:
            content = f.read()

        sections = parse_toml_colors(content)

        # Already transformed if it has colors.roles; otherwise transform first
        if 'colors.roles' not in sections:
            sections = transform_theme(filepath)
        else:
            print(f"Already transformed: {filepath}")

        if emit_ts:
            print()
            emit_typescript(filepath, sections)


if __name__ == '__main__':
    main()
