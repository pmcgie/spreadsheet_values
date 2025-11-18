import { licenseKey } from '../config.json';
import React, { useCallback, useEffect, useState } from 'react';
import './styles.css';
import isEqual from 'lodash/isEqual';
import find from 'lodash/find';
import filter from 'lodash/filter';
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
import { applyGrand, applyRow, applySub, changesToData, dataToRows } from './helpers';

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

const ExampleSpreadsheet = ({ triggerQuery, model, modelUpdate }) => {

  const [data, setData] = useState([]);
  const [formatted_data, setFormattedData] = useState([]);
  const [all_changes, setAllChanges] = useState([]);

  useEffect(() => {
    if (!isEqual(model.data, data)) {
      refreshData();
    }
  }, [model]);


  useEffect(() => {
    if (all_changes.length > 0) {
      const updated_data = changesToData(
        formatted_data,
        all_changes,
        model.totals?.row_total ? true : false
      );
      modelUpdate({ updated_data });
    }
  }, [all_changes]);


  const refreshData = () => {
    if (!model.data) return;

    setData(model.data);
    setAllChanges([]);
    modelUpdate({ updated_data: [] });

    let formatted = dataToRows(
      model.data,
      model.pivot,
      model.groups,
      model.value,
      model.id
    );

    if (model.totals && formatted.data.length) {
      if (model.totals.row_total) formatted = applyRow(formatted);
      if (model.totals.sub_total) formatted = applySub(formatted);
      if (model.totals.grand_total) formatted = applyGrand(formatted);
    }

    setFormattedData(formatted);

    if (formatted.data.length) {
      hf.setSheetContent(sheetId, formatted.data);
    }
  };


  // FIXED afterChange: dedupe based on row+col, always keeping the newest value
const afterChange = (changes, source) => {
  if (source === "loadData" || !changes) return;

  // Only track real edits
  if (['edit', 'Autofill.fill', 'CopyPaste.cut', 'CopyPaste.paste'].includes(source)) {

    setAllChanges(prev => {
      const map = new Map();

      // keep previous changes
      prev.forEach(ch => {
        map.set(`${ch[0]}-${ch[1]}`, ch);
      });

      changes.forEach(([rowIndex, prop, oldValue, newValue]) => {
        // Prevent crashes when value hasn't changed
        if (oldValue === newValue) return;

        // 🔥 Convert numeric prop → real column name
        // Handsontable sometimes passes a number (index), not the field name
        let colName = prop;
        if (typeof prop === "number") {
          try {
            const hot = hotRef?.current?.hotInstance;
            if (hot) {
              colName = hot.getColHeader(prop);
            }
          } catch (e) {
            console.warn("Failed to resolve column header for prop:", prop);
          }
        }

        // 🔥 Always sanitize numbers like "$5,000,000" → 5000000
        const cleanedValue = normalizeNumber(newValue);

        // Store normalized change
        map.set(`${rowIndex}-${colName}`, [rowIndex, colName, oldValue, cleanedValue]);
      });

      return Array.from(map.values());
    });
  }
};



  const columnSummaryStyle = (row, col) => {
    if (!formatted_data) return {};
    let classNames = [];

    // highlight modified cells
    const found = all_changes.filter(o => o[0] === row && o[1] === col);
    if (found.length) {
      return { className: "changed_cell" };
    }

    if (formatted_data.grand_total_row === row) classNames.push("grand_total");
    if (formatted_data.row_total_column === col) classNames.push("row_total");
    if (formatted_data.sub_total_rows?.includes(row)) classNames.push("sub_total");

    if (classNames.length) {
      return { className: classNames.join(" "), readOnly: true };
    }

    return {};
  };


  if (!formatted_data?.data?.length) return <></>;

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
        fillHandle={{
          autoInsertRow: false,
          autoInsertColumn: false,
        }}
        cells={columnSummaryStyle}
        afterChange={afterChange}
        allowInsertRow={false}
        allowInsertColumn={false}
        formulas={{ engine: hf, sheetName }}
        colHeaders={formatted_data.columns.map((c) => {
          if (model.labels) {
            return model.labels[model.fields.indexOf(c)] || c;
          }
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
