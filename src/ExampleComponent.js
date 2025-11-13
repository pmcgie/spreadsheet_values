import { licenseKey } from '../config.json';
import React, { useEffect, useState, useRef } from 'react';
import './styles.css';
import { HotTable, HotColumn } from "@handsontable/react";
import "handsontable/dist/handsontable.min.css";
import { registerPlugin, AutoColumnSize, Autofill, ColumnSummary, ColumnSorting, ManualColumnFreeze, ContextMenu, DropdownMenu, UndoRedo } from 'handsontable/plugins';
import { HyperFormula } from 'hyperformula';
import { applyGrand, applyRow, applySub, dataToRows } from './helpers';

// Register plugins
registerPlugin(AutoColumnSize);
registerPlugin(Autofill);
registerPlugin(ColumnSummary);
registerPlugin(ColumnSorting);
registerPlugin(ManualColumnFreeze);
registerPlugin(ContextMenu);
registerPlugin(DropdownMenu);
registerPlugin(UndoRedo);

// HyperFormula instance
const hf = HyperFormula.buildEmpty({ licenseKey: 'internal-use-in-handsontable' });
const sheetName = hf.addSheet("main");
const sheetId = hf.getSheetId(sheetName);

const ExampleSpreadsheet = ({ model, modelUpdate }) => {
  const [formattedData, setFormattedData] = useState([]);
  const hotRef = useRef(null);
  const loadingRef = useRef(false);
  const accumulatedChangesRef = useRef({}); // user-edited cells

  // Initialize table when model.data changes
  useEffect(() => {
    if (model.data?.length) {
      initializeTable(model.data);
      accumulatedChangesRef.current = {};
      modelUpdate({ updated_data: [] });
    }
  }, [model.data]);

  const initializeTable = (data) => {
    loadingRef.current = true;

    let formatted = dataToRows(data, model.pivot, model.groups, model.value, model.id);

    if (model.totals && formatted?.data?.length) {
      if (model.totals.row_total) formatted = applyRow(formatted);
      if (model.totals.sub_total) formatted = applySub(formatted);
      if (model.totals.grand_total) formatted = applyGrand(formatted);
    }

    setFormattedData(formatted);

    setTimeout(() => {
      if (hotRef.current) hotRef.current.loadData(formatted.data);
      try { hf.clearSheet(sheetId); } catch(e) {}
      hf.setSheetContent(sheetId, formatted.data);
      loadingRef.current = false;
    }, 0);
  };

  // Commit in-progress editor
  const flushEditor = () => {
    const hotInstance = hotRef.current?.hotInstance;
    if (hotInstance?.getActiveEditor?.()) hotInstance.getActiveEditor().finishEditing(false);
  };

  // AfterChange handler: accumulate user changes
  const afterChange = (changes, type) => {
    if (!changes?.length || type === 'loadData' || loadingRef.current) return;
    const relevantTypes = ['edit','Autofill.fill','CopyPaste.cut','CopyPaste.paste'];
    if (!relevantTypes.includes(type)) return;

    const hotInstance = hotRef.current?.hotInstance;
    if (!hotInstance || !formattedData?.data) return;

    flushEditor();

    changes.forEach(([rowIndex, colIndex, oldValue, newValue]) => {
      const colName = formattedData.columns[colIndex];
      const rowId = formattedData.data[rowIndex][model.id];

      if (!accumulatedChangesRef.current[rowId]) accumulatedChangesRef.current[rowId] = {};
      accumulatedChangesRef.current[rowId][colName] = newValue;
      accumulatedChangesRef.current[rowId][model.id] = rowId;
    });

    // Immediately update latest cell in model.updated_data if desired
    // modelUpdate({ updated_data: Object.values(accumulatedChangesRef.current) });
  };

  // Commit all accumulated changes manually
  const commitChanges = () => {
    modelUpdate({ updated_data: Object.values(accumulatedChangesRef.current) });
    accumulatedChangesRef.current = {};
  };

  // Apply HyperFormula/totals without overwriting user changes
  const applyFormulaValuesSafely = (hotData) => {
    return hotData.map((row, rowIndex) => {
      const rowId = row[model.id];
      const newRow = [...row];

      formattedData.columns.forEach((colName, colIndex) => {
        // Only overwrite if user hasn't changed this cell
        if (!accumulatedChangesRef.current[rowId]?.[colName]) {
          try {
            const hfValue = hf.getCellValue(sheetId, rowIndex, colIndex);
            if (hfValue !== undefined) newRow[colIndex] = hfValue;
          } catch (e) {}
        }
      });
      return newRow;
    });
  };

  // Highlight dirty cells
  const columnSummaryStyle = (row, col) => {
    const classNames = [];

    if (formattedData.grand_total_row === row) classNames.push('grand_total');
    if (formattedData.row_total_column === col) classNames.push('row_total');
    if (formattedData.sub_total_rows?.includes(row)) classNames.push('sub_total');

    const rowId = formattedData.data?.[row]?.[model.id];
    const colName = formattedData.columns[col];
    if (rowId && accumulatedChangesRef.current[rowId]?.[colName] !== undefined) {
      classNames.push('dirty_cell');
    }

    return classNames.length ? { className: classNames.join(' '), readOnly: false } : {};
  };

  if (!formattedData?.data?.length) return <></>;

  return (
    <div style={{ height: '100vh', width: '100vw', position: 'relative' }}>
      <button
        onClick={commitChanges}
        style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000 }}
      >
        Commit Changes
      </button>

      <HotTable
        ref={hotRef}
        data={formattedData.data}
        colHeaders={formattedData.columns.map(c => model.labels ? model.labels[model.fields.indexOf(c)] || c : c)}
        columnSorting={Boolean(model.columnSorting)}
        undoRedo={true}
        contextMenu={Boolean(model.contextMenu)}
        manualColumnFreeze={model.fixedColumnsLeft && Number(model.fixedColumnsLeft) > 0}
        fixedColumnsLeft={model.fixedColumnsLeft && Number(model.fixedColumnsLeft) > 0 ? model.fixedColumnsLeft : 0}
        colWidths={model.colWidths}
        fillHandle={{ autoInsertRow: false, autoInsertColumn: false }}
        allowInsertRow={false}
        allowInsertColumn={false}
        cells={columnSummaryStyle}
        afterChange={afterChange}
        formulas={{ engine: hf, sheetName }}
      >
        {formattedData.columns.map((c, i) =>
          c !== '_ids' ? (
            <HotColumn
              key={c}
              data={i}
              readOnly={model.groups.indexOf(c) > -1}
              type={model.groups.indexOf(c) > -1 ? 'numeric' : 'text'}
            />
          ) : <React.Fragment key={c} />
        )}
      </HotTable>
    </div>
  );
};

export default ExampleSpreadsheet;
