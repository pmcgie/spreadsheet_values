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
 * 2. Convert Handsontable change event → only currently changed cells
 * ============================================================ */
export const changesToData = (array_data, changes) => {
  if (!changes?.length) return [];

  const { data, value, id, pivot_values, columns } = array_data;

  return changes.map(([row, col, oldVal, newVal]) => {
    const rowData = data[row];
    if (!rowData) return null;

    // Map by column header to pivot index
    const columnName = columns[col];
    const pivotIndex = pivot_values.indexOf(columnName);
    if (pivotIndex === -1) return null;

    const unique_id_list = JSON.parse(rowData[rowData.length - 1]);
    const unique_id = unique_id_list[pivotIndex];

    return {
      [id]: unique_id,
      [value]: newVal === "" || newVal == null ? null : Number(newVal),
      pivot: columnName,
      timestamp: new Date().toISOString(),
    };
  }).filter(Boolean);
};

/* ============================================================
 * 3. Apply row totals
 * ============================================================ */
export const applyRow = (formatted_data) => {
  let { data, groups, columns } = formatted_data;
  const insert_index = columns.indexOf(groups[groups.length - 1]) + 1;
  const last_pivot_index = columns.length - 2;

  data.forEach((row, i) => {
    row.splice(
      insert_index,
      0,
      `=SUM(${cellToGrid(insert_index + 1, i)}:${cellToGrid(last_pivot_index, i)})`
    );
  });

  columns.splice(insert_index, 0, "Row Total");

  return { ...formatted_data, data, columns, row_total_column: insert_index };
};

/* ============================================================
 * 4. Apply subtotals
 * ============================================================ */
export const applySub = (formatted_data) => {
  let { data, groups, columns } = formatted_data;
  const last_group_index = columns.indexOf(groups[groups.length - 1]);
  let operations = [];
  groups.slice().reverse().forEach((g, j) => {
    const group_index = columns.indexOf(g);
    let last_cell = data[0][group_index];
    let stack = [];

    if (j > 0) {
      data.forEach((row, i) => {
        let curr = row[group_index];
        if (curr !== last_cell) {
          operations.push({ label: last_cell, column: group_index, index: i, stack });
          stack = [i];
        } else {
          stack.push(i);
        }
        last_cell = curr;
      });
      operations.push({ label: last_cell, column: group_index, index: data.length, stack });
    }
  });

  let inserts = 0;
  let sub_total_rows = [];
  operations = operations.sort((a, b) => a.index - b.index || b.column - a.column);

  operations.forEach((o) => {
    const sum = Array.from({ length: columns.length }).map((_, i) => {
      if (i === o.column) return `${o.label} Total`;
      if (i > last_group_index && i < columns.length - 1) {
        return `=SUM(${o.stack.map((s) => cellToGrid(i, s + inserts)).join(",")})`;
      }
      return "";
    });

    data.splice(o.index + inserts, 0, sum);
    sub_total_rows.push(o.index + inserts);
    inserts++;
  });

  return { ...formatted_data, data, columns, sub_total_rows };
};

/* ============================================================
 * 5. Apply grand total
 * ============================================================ */
export const applyGrand = (formatted_data) => {
  let { data, groups, columns, row_total_column, pivot_values } = formatted_data;
  const id_column_index = columns.indexOf("_ids");
  const filtered = [...data.keys()].filter((i) => data[i][id_column_index]);

  let col_pivots = pivot_values.map((pv) => columns.indexOf(pv));
  if (row_total_column && row_total_column > -1) col_pivots.unshift(row_total_column);

  const sums = col_pivots.map((cp) => filtered.map((f) => `${cellToGrid(cp, f)}`));
  data.push([...groups.map((p, i) => (i === 0 ? "Grand Total" : "")), ...sums.map((s) => `=SUM(${s.join(",")})`)]);

  return { ...formatted_data, data, grand_total_row: data.length - 1 };
};

/* ============================================================
 * 6. Column index → Excel letter
 * ============================================================ */
export const colToLetter = (col) => {
  let letters = "";
  while (col >= 0) {
    letters = String.fromCharCode((col % 26) + 65) + letters;
    col = Math.floor(col / 26) - 1;
  }
  return letters;
};

/* ============================================================
 * 7. Cell coordinates → "A1" style
 * ============================================================ */
export const cellToGrid = (col, row) => `${colToLetter(col)}${row + 1}`;
