import { licenseKey } from '../config.json';
import React, { useEffect, useState } from 'react';
import './styles.css';
import isEqual from 'lodash/isEqual';
import { HotTable, HotColumn } from "@handsontable/react";
import "handsontable/dist/handsontable.min.css";
import {
  registerPlugin,
  AutoColumnSize,
  Autofill,
  ColumnSummary,
  ColumnSorting,
  ManualColumnFreeze,
  ContextMenu,
  DropdownMenu,
  UndoRedo
} from 'handsontable/plugins';
import { HyperFormula } from 'hyperformula';
import { applyGrand, applyRow, applySub, changesToData, dataToRows, parseNumeric } from './helpers';

registerPlugin(AutoColumnSize);
registerPlugin(Autofill);
registerPlugin(ColumnSummary);
registerPlugin(ColumnSorting);
registerPlugin(ManualColumnFreeze);
registerPlugin(ContextMenu);
registerPlugin(DropdownMenu);
registerPlugin(UndoRedo);

const hf = HyperFormula.buildEmpty({
  licenseKey: 'internal-use-in-handsontable'
});
const sheetName = hf.addSheet("main");
const sheetId = hf.getSheetId(sheetName);

const ExampleSpreadsheet = ({ model, modelUpdate }) => {
  const [data, setData] = useState([]);
  const [formatted_data, setFormattedData] = useState([]);
  const [all_changes, setAllChanges] = useState([]);

  useEffect(() => {
    if (!isEqual(model.data, data)) refreshData();
  }, [model]);

  useEffect(() => {
    if (all_changes.length > 0) {
      const updated_data = changesToData(formatted_data, all_changes, model.totals?.row_total);
      modelUpdate({ updated_data });
    }
  }, [all_changes]);

  function refreshData() {
    if (!model.data) return;
    setData(model.data);
    setAllChanges([]);
    modelUpdate({ updated_data: [] });

    let formatted = dataToRows(model.data, model.pivot, model.groups, model.value, model.id);

    // Convert all $/comma to numeric BEFORE applying totals
    formatted.data = formatted.data.map(row => row.map(cell => parseNumeric(cell) ?? cell));

    if (model.totals && formatted.data.length) {
      if (model.totals.row_total) formatted = applyRow(formatted);
      if (model.totals.sub_total) formatted = applySub(formatted);
      if (model.totals.grand_total) formatted = applyGrand(formatted);
    }

    hf.setSheetContent(sheetId, formatted.data);
    setFormattedData(formatted);
  }

  function afterChange(changes, type) {
    if (type === "loadData" || !changes) return;
    const allowedTypes = ['edit', 'Autofill.fill', 'CopyPaste.cut', 'CopyPaste.paste'];
    if (allowedTypes.includes(type)) {
      setAllChanges(prev => {
        const map = new Map();
        prev.forEach(ch => map.set(`${ch[0]}-${ch[1]}`, ch));
        changes.forEach(ch => {
          ch[3] = parseNumeric(ch[3]) ?? ch[3];
          map.set(`${ch[0]}-${ch[1]}`, ch);
        });
        return Array.from(map.values());
      });
    }
  }

  function columnSummaryStyle(row, col) {
    if (!formatted_data) return {};
    const cellMeta = {};
    const classNames = [];

    for (let i = 0; i < all_changes.length; i++) {
      const o = all_changes[i];
      if (o[0] === row && o[1] === col) {
        classNames.push("changed_cell");
        break;
      }
    }

    if (formatted_data.grand_total_row === row) classNames.push("grand_total");
    if (formatted_data.row_total_column === col) classNames.push("row_total");
    if (formatted_data.sub_total_rows?.includes(row)) classNames.push("sub_total");
    if (classNames.length) cellMeta.className = classNames.join(" ");

    const rawValue = formatted_data.data[row][col];
    const numeric = parseNumeric(rawValue);
    if (numeric !== null) {
      cellMeta.renderer = (instance, td) => {
        td.textContent = "$" + numeric.toLocaleString();
        if (cellMeta.className) td.className = cellMeta.className;
      };
    }

    return cellMeta;
  }

  if (!formatted_data?.data?.length) return null;

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <HotTable
        columnSorting={!!model.columnSorting}
        undoRedo={true}
        contextMenu={!!model.contextMenu}
        manualColumnFreeze={model.fixedColumnsLeft > 0}
        fixedColumnsLeft={model.fixedColumnsLeft || 0}
        data={formatted_data.data}
        licenseKey={licenseKey}
        colWidths={model.colWidths}
        fillHandle={{ autoInsertRow: false, autoInsertColumn: false }}
        cells={columnSummaryStyle}
        afterChange={afterChange}
        allowInsertRow={false}
        allowInsertColumn={false}
        formulas={{ engine: hf, sheetName }}
        colHeaders={formatted_data.columns.map((c) => {
          if (model.labels) return model.labels[model.fields.indexOf(c)] || c;
          return c;
        })}
      >
        {formatted_data.columns.map((c, i) => {
          if (c !== "_ids") {
            return (
              <HotColumn
                key={c}
                data={i}
                readOnly={model.groups.includes(c)}
                type={model.groups.includes(c) ? "numeric" : "text"}
              />
            );
          }
          return <React.Fragment key={c} />;
        })}
      </HotTable>
    </div>
  );
};

export default ExampleSpreadsheet;
