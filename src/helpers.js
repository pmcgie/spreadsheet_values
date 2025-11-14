import isEqual from "lodash/isEqual";
import find from "lodash/find";
import filter from "lodash/filter";
import uniq from "lodash/uniq";

/* ============================================================
 * 1. Convert raw data → pivoted rows for Handsontable
 * ============================================================ */
export const dataToRows = (data, pivot, groups, value, id) => {
  const pivot_values = uniq(data.map((row) => row[pivot]));
  let columns = [...groups, ...pivot_values, "_ids"];
  let out = [];
  let used_groups = [];

  data.forEach((row) => {
    let cur_group = groups.map((g) => row[g]);
    const filter_expression = Object.fromEntries(groups.map((g, i) => [g, cur_group[i]]));

    const found_group = find(used_groups, (ug) => isEqual(ug, filter_expression));
    if (!found_group) {
      const items = filter(data, filter_expression);
      const pivots = pivot_values.map((p) => find(items, { [pivot]: p }));

      out.push([
        ...cur_group,
        ...pivots.map((p) => (p && p[value] != null ? p[value] : null)),
        JSON.stringify(pivots.map((p) => (p && p[id] ? p[id] : null)))
      ]);

      used_groups.push(filter_expression);
    }
  });

  return { columns, data: out, groups, id, value, pivot_values };
};


/* ============================================================
 * 2. Convert Handsontable change event → ONE clean row
 * ============================================================ */
export const changesToData = (array_data, changes) => {
  if (!changes?.length) return [];

  const { data, value, groups, id, pivot_values } = array_data;

  // HOT gives us: [rowIndex, colIndex, oldValue, newValue]
  const [row, col, oldValue, newValue] = changes[changes.length - 1];

  // If the change is inside one of the group columns → ignore it
  if (col < groups.length) return [];

  const rowData = data[row];
  if (!rowData) return [];

  // Parse unique_ids column (the last col)
  const ids_list = JSON.parse(rowData[rowData.length - 1]);

  // Align pivot index:
  const pivotIndex = col - groups.length;

  // Prevent misalignment or bad indexes
  if (pivotIndex < 0 || pivotIndex >= ids_list.length) return [];

  const unique_id = ids_list[pivotIndex];

  return [
    {
      [id]: unique_id,
      [value]: newValue === "" || newValue === null ? null : Number(newValue),
      pivot: pivot_values[pivotIndex],
      timestamp: new Date().toISOString()
    }
  ];
};


/* ============================================================
 * 3. Apply row subtotals
 * ============================================================ */
export const applyRow = (hot, row, groupsLength, pivotCount) => {
  let sum = 0;
  for (let i = 0; i < pivotCount; i++) {
    const v = hot.getDataAtCell(row, groupsLength + i);
    if (v != null && v !== "" && !isNaN(v)) sum += Number(v);
  }
  return sum;
};


/* ============================================================
 * 4. Apply subtotal section (this is optional)
 * ============================================================ */
export const applySub = (hot, rows, groupsLength, pivotCount) => {
  let out = 0;
  rows.forEach((r) => {
    const v = applyRow(hot, r, groupsLength, pivotCount);
    out += v;
  });
  return out;
};


/* ============================================================
 * 5. Apply overall grand total
 * ============================================================ */
export const applyGrand = (hot, groupsLength, pivotCount) => {
  let total = 0;
  for (let r = 0; r < hot.countRows(); r++) {
    total += applyRow(hot, r, groupsLength, pivotCount);
  }
  return total;
};


/* ============================================================
 * 6. Convert a col index → Excel letter (A, B, C...)
 * ============================================================ */
export const colToLetter = (column) => {
  let temp;
  let letter = "";
  while (column >= 0) {
    temp = column % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = Math.floor(column / 26) - 1;
  }
  return letter;
};


/* ============================================================
 * 7. Convert a {row, col} → "A1" style coordinate
 * ============================================================ */
export const cellToGrid = (row, col) => {
  return `${colToLetter(col)}${row + 1}`;
};
