# Standardized Test Format for Sieve Rules

## Structure

```typescript
describe("NN. RuleName", () => {
  describe("NN.1 Category Name", () => {
    it("NN.1.1 specific behavior description", () => {
      // Arrange
      const board: Board = { grid: [...], stars: N };
      const cells: CellState[][] = [...];

      // Act
      const result = ruleName(board, cells);

      // Assert
      expect(result).toBe(true/false);
      expect(cells[r][c]).toBe("star"/"marked"/"unknown");
    });
  });
});
```

## Numbering Convention

| Level    | Format   | Example  |
| -------- | -------- | -------- |
| Rule     | `NN.`    | `05.`    |
| Category | `NN.N`   | `05.1`   |
| Test     | `NN.N.N` | `05.1.1` |

Rule numbers match directory prefixes (01, 02, ... 14).

## Standard Categories

| Order | Category             | Description                                          |
| ----- | -------------------- | ---------------------------------------------------- |
| 1     | **Primary behavior** | Rule applies correctly (places stars or marks cells) |
| 2     | **Variant cases**    | Row/column/region variants, multi-star puzzles       |
| 3     | **No-op cases**      | Rule correctly returns false (nothing to do)         |
| 4     | **Edge cases**       | Boundaries, minimum grids, batch behavior            |
| 5     | **Spec gaps**        | Additional coverage beyond spec (optional)           |

## Category Naming Examples

```
NN.1 Row-based behavior
NN.2 Column-based behavior
NN.3 Region-based behavior
NN.4 No-op cases
NN.5 Edge cases
```

Or for simpler rules:

```
NN.1 Marks cells correctly
NN.2 No-op cases
NN.3 Edge cases
```

## Test Name Convention

Format: `NN.N.N verb + specific condition`

Good:

- `05.1.1 places star when 1 unknown, needs 1 star`
- `08.1.1 marks middle cell in 1×3 region when star would break tiling`
- `10.3.1 returns false when no regions contained within row set`

Avoid:

- Vague descriptions: `works correctly`
- Missing context: `marks cell`
- No verb: `single cell region`

## Helper Functions

Place helpers at top of file, before first `describe`:

```typescript
/** Create cells grid from compact string representation */
function makeCells(rows: string[]): CellState[][] {
  return rows.map((row) =>
    row.split("").map((c) => {
      if (c === ".") return "unknown";
      if (c === "x") return "marked";
      if (c === "*") return "star";
      throw new Error(`Unknown cell: ${c}`);
    }),
  );
}
```

## Assertions

Prefer specific assertions over generic:

```typescript
// Good: explicit expected state
expect(cells).toEqual([
  ["star", "marked", "marked"],
  ["marked", "unknown", "unknown"],
  ["marked", "unknown", "unknown"],
]);

// Good: targeted checks for large grids
expect(cells[0][2]).toBe("star");
expect(cells[1][0]).toBe("marked");

// Avoid: vague counts
expect(cells.flat().filter((c) => c === "marked").length).toBeGreaterThan(0);
```

## File Template

```typescript
import { describe, it, expect } from "vitest";
import ruleName from "./ruleName";
import { Board, CellState } from "../../helpers/types";

describe("NN. Rule Name", () => {
  describe("NN.1 Primary behavior", () => {
    it("NN.1.1 description of main case", () => {
      const board: Board = {
        grid: [
          [0, 0, 0],
          [0, 0, 0],
          [0, 0, 0],
        ],
        stars: 1,
      };
      const cells: CellState[][] = [
        ["unknown", "unknown", "unknown"],
        ["unknown", "unknown", "unknown"],
        ["unknown", "unknown", "unknown"],
      ];

      const result = ruleName(board, cells);

      expect(result).toBe(true);
      expect(cells).toEqual([...]);
    });
  });

  describe("NN.2 No-op cases", () => {
    it("NN.2.1 returns false when nothing to do", () => {
      // ...
      expect(result).toBe(false);
    });
  });

  describe("NN.3 Edge cases", () => {
    it("NN.3.1 handles minimum grid size", () => {
      // ...
    });
  });
});
```
