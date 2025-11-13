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

const ExampleSpreadsheetFixed = ({ model }) => {
  const hotRef = useRef(null);
  const [formattedData, setFormattedData] = useState([]);
  const modelRef = useRef(model);

  const initializeTable = () => {
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
    if (!changes?.length) return;
    const hot = hotRef.current.hotInstance;
    const { id: fieldId, value: valueField, groups } = modelRef.current;

    // Only track true user edits, ignore formula recalcs
    if (type !== 'edit') return;

    const [row, col, oldVal, newVal] = changes[changes.length - 1];

    // Ignore totals/subtotals/grand totals
    if (
      formattedData.row_total_column === col ||
      formattedData.grand_total_row === row ||
      formattedData.sub_total_rows?.includes(row)
    ) return;

    const rowData = hot.getDataAtRow(row);
    const id_index = col - groups.length;
    const data_id = JSON.parse(rowData[rowData.length - 1])[id_index];

    const updatedCell = {
      [fieldId]: data_id,
      [valueField]: Number(newVal),
      timestamp: new Date().toISOString()
    };

    // Send updated data
    window.parent.postMessage({
      type: 'UPDATED_DATA',
      updated_data: [updatedCell]
    }, '*');
  };

  const columnSummaryStyle = (row, col) => {
    const classNames = [];
    if (formattedData.grand_total_row === row) classNames.push('grand_total');
    if (formattedData.row_total_column === col) classNames.push('row_total');
    if (formattedData.sub_total_rows?.includes(row)) classNames.push('sub_total');
    return classNames.length ? { className: classNames.join(' '), readOnly: classNames.includes('grand_total') || classNames.includes('row_total') || classNames.includes('sub_total') } : {};
  };

  useEffect(() => {
    initializeTable();
  }, [model]);

  if (!formattedData?.data?.length) return <></>;

  return (
    <HotTable
      ref={hotRef}
      data={formattedData.data}
      colHeaders={formattedData.columns.map(c =>
        modelRef.current?.labels ? modelRef.current.labels[modelRef.current.fields.indexOf(c)] || c : c
      )}
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

export default ExampleSpreadsheetFixed;
