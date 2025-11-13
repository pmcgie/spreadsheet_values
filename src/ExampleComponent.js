import { licenseKey } from '../config.json';
import React, { useEffect, useState, useRef } from 'react';
import './styles.css';
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

// HyperFormula instance
const hf = HyperFormula.buildEmpty({ licenseKey: 'internal-use-in-handsontable' });
const sheetName = hf.addSheet("main");
const sheetId = hf.getSheetId(sheetName);

const ExampleSpreadsheet = ({ model, modelUpdate }) => {
  const [formattedData, setFormattedData] = useState([]);
  const [dirtyCells, setDirtyCells] = useState({});
  const hotRef = useRef(null);
  const loadingRef = useRef(false);

  // Initialize table when model.data changes
  useEffect(() => {
    if (model.data?.length) {
      initializeTable(model.data);
      setDirtyCells({});
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

  const flushEditor = () => {
    const hotInstance = hotRef.current?.hotInstance;
    if (hotInstance?.getActiveEditor?.()) {
      hotInstance.getActiveEditor().finishEditing(false);
    }
  };

  // HOT callback: mark dirty cells but do not commit yet
  const afterChange = (changes, type) => {
    if (!changes?.length || type === 'loadData' || loadingRef.current) return;
    const relevantTypes = ['edit','Autofill.fill','CopyPaste.cut','CopyPaste.paste'];
    if (!relevantTypes.includes(type)) return;

    const hotInstance = hotRef.current?.hotInstance;
    if (!hotInstance || !formattedData?.data) return;

    flushEditor();

    setDirtyCells(prev => {
      const next = { ...prev };
      changes.forEach(([rowIndex, colIndex, oldValue, newValue]) => {
        const colName = formattedData.columns[colIndex];
        const rowId = formattedData.data[rowIndex][model.id];
        if (!next[rowId]) next[rowId] = {};
        next[rowId][colName] = newValue;
        next[rowId][model.id] = rowId;
      });
      return next;
    });
  };

  // Commit all dirty cells to model.updated_data
  const commitChanges = () => {
    modelUpdate({ updated_data: Object.values(dirtyCells) });
    setDirtyCells({});
  };

  // Highlight dirty cells
  const columnSummaryStyle = (row, col) => {
    const classNames = [];

    if (formattedData.grand_total_row === row) classNames.push('grand_total');
    if (formattedData.row_total_column === col) classNames.push('row_total');
    if (formattedData.sub_total_rows?.includes(row)) classNames.push('sub_total');

    const rowId = formattedData.data?.[row]?.[model.id];
    const colName = formattedData.columns[col];
    if (rowId && dirtyCells[rowId]?.[colName] !== undefined) classNames.push('dirty_cell');

    return classNames.length ? { className: classNames.join(' '), readOnly: false } : {};
  };

  if (!formattedData?.data?.length) return <></>;

  return (
    <div style={{ height: '100vh', width: '100vw' }}>
      <button
        onClick={commitChanges}
        style={{ position: 'absolute', zIndex: 1000, top: 10, right: 10 }}
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
