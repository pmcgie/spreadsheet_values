import React, { useEffect, useState, useRef } from 'react';
import { HotTable, HotColumn } from '@handsontable/react';
import 'handsontable/dist/handsontable.min.css';
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

const hf = HyperFormula.buildEmpty({ licenseKey: 'internal-use-in-handsontable' });
const sheetName = hf.addSheet("main");
const sheetId = hf.getSheetId(sheetName);

const ExampleSpreadsheetSingleCell = () => {
  const [formattedData, setFormattedData] = useState([]);
  const hotRef = useRef(null);
  const modelRef = useRef(null);

  const initializeTable = (model) => {
    modelRef.current = model;

    let formatted = dataToRows(model.data, model.pivot, model.groups, model.value, model.id);

    if (model.totals && formatted?.data?.length) {
      if (model.totals.row_total) formatted = applyRow(formatted);
      if (model.totals.sub_total) formatted = applySub(formatted);
      if (model.totals.grand_total) formatted = applyGrand(formatted);
    }

    setFormattedData(formatted);

    setTimeout(() => {
      if (hotRef.current) hotRef.current.loadData(formatted.data);
      hf.clearSheet(sheetId);
      hf.setSheetContent(sheetId, formatted.data);
    }, 0);
  };

  const afterChange = (changes, type) => {
    if (!changes?.length || type === 'loadData') return;

    const relevantTypes = ['edit','Autofill.fill','CopyPaste.cut','CopyPaste.paste'];
    if (!relevantTypes.includes(type)) return;

    const [row, col, oldValue, newValue] = changes[changes.length - 1];
    const hotInstance = hotRef.current.hotInstance;
    const rowId = hotInstance.getDataAtCell(row, modelRef.current.fields.indexOf(modelRef.current.id));
    const colName = formattedData.columns[col];

    const changedCell = {
      [modelRef.current.id]: rowId,
      [colName]: newValue,
      timestamp: new Date().toISOString()
    };

    // Send to Retool
    if (window.parent) {
      window.parent.postMessage({
        type: 'UPDATED_DATA',
        updated_data: [changedCell]
      }, '*');
    }
  };

  const columnSummaryStyle = (row, col) => {
    const classNames = [];
    if (formattedData.grand_total_row === row) classNames.push('grand_total');
    if (formattedData.row_total_column === col) classNames.push('row_total');
    if (formattedData.sub_total_rows?.includes(row)) classNames.push('sub_total');
    return classNames.length ? { className: classNames.join(' '), readOnly: false } : {};
  };

  useEffect(() => {
    const handler = (event) => {
      if (event.data?.type === 'SET_MODEL') initializeTable(event.data.model);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  if (!formattedData?.data?.length) return <></>;

  return (
    <HotTable
      ref={hotRef}
      data={formattedData.data}
      colHeaders={formattedData.columns.map(c => modelRef.current?.labels ? modelRef.current.labels[modelRef.current.fields.indexOf(c)] || c : c)}
      columnSorting={Boolean(modelRef.current?.columnSorting)}
      undoRedo={true}
      contextMenu={Boolean(modelRef.current?.contextMenu)}
      manualColumnFreeze={modelRef.current?.fixedColumnsLeft && Number(modelRef.current.fixedColumnsLeft) > 0}
      fixedColumnsLeft={modelRef.current?.fixedColumnsLeft || 0}
      colWidths={modelRef.current?.colWidths}
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
            readOnly={modelRef.current?.groups?.includes(c)}
            type={modelRef.current?.groups?.includes(c) ? 'numeric' : 'text'}
          />
        ) : <React.Fragment key={c} />
      )}
    </HotTable>
  );
};

export default ExampleSpreadsheetSingleCell;
