import isEqual from "lodash/isEqual";
import orderBy from "lodash/orderBy";
import find from "lodash/find";
import filter from "lodash/filter";
import uniq from "lodash/uniq";

// Convert string/currency to number
export const parseNumeric = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/\$/g, '').replace(/,/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  }
  return null;
};

// Convert raw data to pivoted rows
export const dataToRows = (data, pivot, groups, value, id) => {
  const pivot_values = uniq(data.map((row) => row[pivot]));
  let columns = [...groups, ...pivot_values, "_ids"];
  let out = [];
  let used_groups = [];

  data.forEach((row) => {
    let cur_group = groups.map((g) => row[g]);
    const filter_expression = Object.fromEntries(
      groups.map((g, i) => [g, cur_group[i]])
    );
    const found_group = find(used_groups, (ug) => isEqual(ug, filter_expression));

    if (!found_group) {
      const items = filter(data, filter_expression);
      const pivots = pivot_values.map((p) => find(items, { [pivot]: p }));
      out.push([
        ...cur_group,
        ...pivots.map((p) => (p && p[value] !== undefined ? parseNumeric(p[value]) : null)),
        JSON.stringify(
          pivots.map((p) => (p && p[id] ? p[id] : null))
        ),
      ]);
      used_groups.push(filter_expression);
    }
  });

  return {
    columns,
    data: out,
    groups,
    id,
    value,
    pivot_values,
  };
};

// Deduplicate changes and build update array
export const changesToData = (array_data, changes, row_total = false) => {
  const { data, value, groups, id } = array_data;
  const map = new Map();

  changes.forEach(change => {
    const key = `${change[0]}-${change[1]}`;
    map.set(key, {
      row: change[0],
      column: change[1],
      new_val: parseNumeric(change[3]),
    });
  });

  return Array.from(map.values()).map((item) => {
    const row = data[item.row];
    const total_column_adj = row_total ? -1 : 0;
    const id_index = item.column - groups.length + total_column_adj;
    const data_id = JSON.parse(row[row.length - 1])[id_index];

    return {
      [id]: data_id,
      [value]: Number(item.new_val),
    };
  });
};

// Add Row Totals
export const applyRow = (formatted_data) => {
  let { data, groups, columns } = formatted_data;
  const insert_index = columns.indexOf(groups[groups.length - 1]) + 1;
  columns.splice(insert_index, 0, "Row Total");
  const last_pivot_index = columns.length - 2;

  data.forEach((row, i) => {
    row.splice(
      insert_index,
      0,
      `=SUM(${cellToGrid(insert_index + 1, i)}:${cellToGrid(last_pivot_index, i)})`
    );
  });

  return { ...formatted_data, data, columns, row_total_column: insert_index };
};

// Add Subtotals
export const applySub = (formatted_data) => {
  let { data, groups, columns } = formatted_data;
  const last_group_index = columns.indexOf(groups[groups.length - 1]);
  let operations = [];
  groups.reverse().forEach((g, j) => {
    const group_index = columns.indexOf(g);
    let last_cell = data[0][group_index];
    let stack = [];

    if (j > 0) {
      data.forEach((row, i) => {
        let curr = row[group_index];
        if (curr !== last_cell) {
          operations.push({ label: last_cell, column: group_index, index: i, stack });
          stack = [i];
        } else stack.push(i);
        last_cell = curr;
      });
      operations.push({ label: last_cell, column: group_index, index: data.length, stack });
    }
  });

  let inserts = 0;
  let sub_total_rows = [];
  operations = orderBy(operations, ['index', 'column'], ['asc', 'desc']);
  operations.forEach((o) => {
    const sum = Array.from({ length: columns.length }).map((_, i) => {
      if (i === o.column) return `${o.label} Total`;
      if (i > last_group_index && i < columns.length - 1) {
        return `=SUM(${o.stack.map((s) => cellToGrid(i, s + inserts)).join(',')})`;
      }
      return "";
    });
    data.splice(o.index + inserts, 0, sum);
    sub_total_rows.push(o.index + inserts);
    inserts++;
  });

  return { ...formatted_data, data, columns, sub_total_rows };
};

// Add Grand Total
export const applyGrand = (formatted_data) => {
  let { data, groups, columns, pivot_values, row_total_column } = formatted_data;
  const id_column_index = columns.indexOf("_ids");
  const filtered = [...data.keys()].filter((i) => data[i][id_column_index]);

  let col_pivots = pivot_values.map((pv) => columns.indexOf(pv));
  if (row_total_column && row_total_column > -1) col_pivots.unshift(row_total_column);

  const sums = col_pivots.map((cp) =>
    filtered.map((f) => `${cellToGrid(cp, f)}`)
  );

  if (!data) return formatted_data;

  data.push([
    ...groups.map((p, i) => (i === 0 ? "Grand Total" : "")),
    ...sums.map((s) => `=SUM(${s.join(',')})`)
  ]);

  return { ...formatted_data, data, grand_total_row: data.length - 1 };
};

// Helpers for HyperFormula
const colToLetter = (col) => {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let out = "";
  while (col >= 0) {
    const mod = col % 26;
    out = letters[mod] + out;
    col = Math.floor(col / 26) - 1;
  }
  return out;
};

export const cellToGrid = (col, row) => {
  return `${colToLetter(col)}${row + 1}`;
};
