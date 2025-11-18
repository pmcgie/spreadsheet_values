import isEqual from "lodash/isEqual";

/**
 * Clean any numeric-like value:
 *  - Removes $ , and spaces
 *  - Converts "" to 0
 *  - Supports decimals and negatives
 */
export function cleanNumber(value) {
  if (value === null || value === undefined) return 0;

  // Convert to string
  let str = String(value).trim();

  // Remove currency symbols, commas, spaces
  str = str.replace(/[\$,]/g, "");

  // Empty -> 0
  if (str === "") return 0;

  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * Safely compare values with numeric cleaning.
 */
export function valuesAreEqual(a, b) {
  return cleanNumber(a) === cleanNumber(b);
}

/**
 * Given an existing changesToData array, update ONLY the changed cell.
 */
export function applyCellEdit(changesToData, rowId, colName, newValue) {
  const cleaned = cleanNumber(newValue);

  // Find if this cell already has an edit recorded
  const idx = changesToData.findIndex(
    (c) => c.rowId === rowId && c.colName === colName
  );

  if (idx >= 0) {
    // Update existing edit
    const updated = [...changesToData];
    updated[idx] = { rowId, colName, value: cleaned };
    return updated;
  }

  // Insert new edit
  return [...changesToData, { rowId, colName, value: cleaned }];
}

/**
 * Compute grand totals based on original + override changesToData
 */
export function calculateGrandTotals(rows, changesToData) {
  const totals = {};

  for (const row of rows) {
    for (const colName of Object.keys(row)) {
      if (colName === "rowId") continue;

      // base value
      let base = cleanNumber(row[colName]);

      // override?
      const override = changesToData.find(
        (c) => c.rowId === row.rowId && c.colName === colName
      );

      const value = override ? override.value : base;

      totals[colName] = (totals[colName] || 0) + value;
    }
  }

  return totals;
}
