# Krazydad Puzzle Testing

Testing solver against 1000 puzzles from Krazydad's 10x10 2-star collection.

## Process

1. **Converted raw data to SBN format** - Transformed `random_sample_10x10.txt` (CSV with regions as uppercase letters) into compact SBN format (`{size}x{stars}.{LAYOUT_LETTERS}`)

2. **Ran solver on all 1000 puzzles** - Tracked rule usage statistics and solve rate

3. **Results**: 849/1000 solved (85%), 151 stuck

4. **Filtered unsolved puzzles** - Extracted the 151 puzzles that got stuck for further analysis

5. **Traced stuck puzzles** - Step-by-step solve attempts to identify where the solver gets blocked

## Data Formats

**Input** (`random_sample_10x10.txt`):

```
10,10,2,"AAAABBBBB...","0101000000..." # comment
```

**SBN** (`puzzles.sbn`):

```
10x2.AAAABBBBBCAAD...
```

## Commands

### Convert raw data to SBN format

```bash
./scripts/convert-to-sbn.sh random_sample_10x10.txt > puzzles.sbn
```

### Find first three unsolved puzzles

```bash
head -3 unsolved_clean.sbn | npx tsx src/sieve/cli.ts --file /dev/stdin --trace
```

### Run solver and get rule usage stats

```bash
npx tsx src/sieve/cli.ts --file puzzles.sbn
```

### Filter unsolved puzzles

```bash
npx tsx src/sieve/cli.ts --file puzzles.sbn --unsolved > unsolved.sbn 2>&1
cut -d' ' -f1 unsolved.sbn > unsolved_clean.sbn
```

### Trace puzzles

```bash
# Trace first 5 unsolved puzzles
head -1 unsolved_clean.sbn | npx tsx src/sieve/cli.ts --file /dev/stdin --trace

# Trace a specific puzzle (e.g., puzzle 3)
sed -n '3p' unsolved_clean.sbn | npx tsx src/sieve/cli.ts --file /dev/stdin --trace

# Trace all unsolved puzzles to a file
npx tsx src/sieve/cli.ts --file unsolved_clean.sbn --trace > trace_all.txt 2>&1
```

### Verbose mode (per-puzzle results)

```bash
npx tsx src/sieve/cli.ts --file puzzles.sbn --verbose
```
