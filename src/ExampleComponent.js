import { licenseKey } from '../config.json';
import React, { useEffect, useState, useRef } from 'react';
import './styles.css';
import isEqual from 'lodash/isEqual';
import { HotTable, HotColumn } from "@handsontable/react";
import "handsontable/dist/handsontable.min.css";
import { registerPlugin, AutoColumnSize, Autofill, ColumnSummary, ColumnSorting, ManualColumnFreeze, ContextMenu, DropdownMenu, UndoRedo } from 'handsontable/plugins';
import { HyperFormula } from 'hyperformula';
import { applyGrand, applyRow, applySub, dataToRows } from './helpers';

registerPlugin(AutoColumnSize);
registerPlugin(Autofill);
registerPlugin(ColumnSummary);
registerPlugin(ColumnSorting);
registerPlugin(ManualColumnFreeze);
registerPlugin(ContextMenu);
registerPlugin(DropdownMenu);
registerPlugin(UndoRedo);

// HyperFormula instance for formula evaluation
const hf = HyperFormula.buildEmpty({ licenseKey: 'internal-use-in-handsontable' });
const sheetName = hf.addSheet("main");
const sheetId = hf.getSheetId(sheetName);

const ExampleSpreadsheet = ({ model, modelUpdate }) => {
  const [data, setData] = useState([]);
  const [formatted_data, setFormattedData] = useState([]);
  const hotRef = useRef(null);
  const loadingRef = useRef(false);

  // Refresh HOT & HF when model.data changes
  useEffect(() => {
    if (!isEqual(model.data, data)) {
      refreshData();
    }
    modelUpdate({ updated_data: [] });
  }, [model]);

  const refreshData = () => {
    if (!model.data) return;

    loadingRef.current = true;
    setData(model.data);

    let formatted = dataToRows(model.data, model.pivot, model.groups, model.value, model.id);

    if (model.totals && formatted?.data?.length) {
      if (model.totals.row_total) formatted = applyRow(formatted);
      if (model.totals.sub_total) formatted = applySub(formatted);
      if (model.totals.grand_total) formatted = applyGrand(formatted);
    }

    setFormattedData(formatted);

    if (formatted?.data?.length) {
      try { hf.clearSheet(sheetId); } catch (e) {}
      hf.setSheetContent(sheetId, formatted.data);

      if (hotRef.current) {
        hotRef.current.loadData(formatted.data);
      }
    }

    setTimeout(() => { loadingRef.current = false; }, 0);
  };

  // Capture exactly what the user entered
  const afterChange = (changes, type) => {
    if (!changes?.length) return;
    if (type === 'loadData' || loadingRef.current) return;

    const relevantTypes = ['edit', 'Autofill.fill', 'CopyPaste.cut', 'CopyPaste.paste'];
    if (!relevantTypes.includes(type)) return;

    const hotInstance = hotRef.current?.hotInstance;
    if (!hotInstance) return;

    // 🔹 Get **current visible values** exactly as the user entered
    const currentValues = hotInstance.getData();

    // 🔹 Optionally update HyperFormula for formula evaluation
    currentValues.forEach((rowData, row) => {
      rowData.forEach((val, col) => {
        // Only set formulas if needed; raw values are already in HOT
        hf.setCellContents({ sheet: sheetId, row, col }, val);
      });
    });

    // 🔹 Send **raw current HOT values** back to Retool
    modelUpdate({ updated_data: currentValues });
  };

  // Cell styling for totals
  const columnSummaryStyle = (row, col) => {
    if (!formatted_data) return {};
    let classNames = [];

    if (formatted_data.grand_total_row && row === formatted_data.grand_total_row) classNames.push('grand_total');
    if (formatted_data.row_total_column && col === formatted_data.row_total_column) classNames.push('row_total');
    if (formatted_data.sub_total_rows?.includes(row)) classNames.push('sub_total');

    if (classNames.length) return { className: classNames.join(' '), readOnly: true };
    return {};
  };

  if (formatted_data?.data?.length) {
    return (
      <div style={{ height: '100vh', width: '100vw' }}>
        <HotTable
          ref={hotRef}
          columnSorting={Boolean(model.columnSorting)}
          undoRedo={true}
          contextMenu={Boolean(model.contextMenu)}
          manualColumnFreeze={model.fixedColumnsLeft && Number(model.fixedColumnsLeft) > 0}
          fixedColumnsLeft={model.fixedColumnsLeft && Number(model.fixedColumnsLeft) > 0 ? model.fixedColumnsLeft : 0}
          data={formatted_data.data}
          licenseKey={licenseKey}
          colWidths={model.colWidths}
          fillHandle={{ autoInsertRow: false, autoInsertColumn: false }}
          cells={columnSummaryStyle}
          afterChange={afterChange}
          allowInsertRow={false}
          allowInsertColumn={false}
          formulas={{ engine: hf, sheetName }}
          colHeaders={formatted_data.columns.map(c => model.labels ? model.labels[model.fields.indexOf(c)] || c : c)}
        >
          {formatted_data.columns.map((c, i) =>
            c !== '_ids' ? (
              <HotColumn
                key={c}
                data={i}
                readOnly={model.groups.indexOf(c) > -1}
                type={model.groups.indexOf(c) > -1 ? 'numeric' : 'text'}
              />
            ) : (
              <React.Fragment key={c} />
            )
          )}
        </HotTable>
      </div>
    );
  } else {
    return <React.Fragment />;
  }
};

export default ExampleSpreadsheet;
