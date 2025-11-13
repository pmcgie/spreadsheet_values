import isEqual from "lodash/isEqual";
import find from "lodash/find";
import filter from "lodash/filter";
import orderBy from "lodash/orderBy";
import uniq from "lodash/uniq";

/**
 * Transform raw data into pivoted rows for Handsontable
 */
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
        ...pivots.map((p) => (p && p[value] ? p[value] : null)),
        JSON.stringify(pivots.map((p) => (p && p[id] ? p[id] : null)))
      ]);
      used_groups.push(filter_expression);
    }
  });

  return { columns, data: out, groups, id, value, pivot_values };
};

/**
 * Return last changed cell with timestamp (raw user input)
 */
export const changesToData = (array_data, changes) => {
  if (!changes?.length) return [];
  const [row, col, oldValue, newValue] = changes[changes.length - 1];
  const { data, value, groups, id } = array_data;
  const rowData = data[row];
  const total_column = 0; 
  const id_index = col - groups.length + total_column;
  const data_id = JSON.parse(rowData[rowData.length - 1])[id_index];
  return [{
    [id]: data_id,
    [value]: Number(newValue),
    timestamp: new Date().toISOString()
  }];
};

// ...keep applyRow, applySub, applyGrand, cellToGrid, colToLetter as in your current helpers
