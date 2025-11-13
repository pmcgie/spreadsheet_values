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

// HyperFormula instance
const hf = HyperFormula.buildEmpty({ licenseKey: 'internal-use-in-handsontable' });
const sheetName = hf.addSheet("main");
const sheetId = hf.getSheetId(sheetName);

const ExampleSpreadsheetBulkAware = ({ model }) => {
  const hotRef = useRef(null);
  const [formattedData, setFormattedData] = useState([]);
  const modelRef = useRef(model);

  // Initialize / refresh Handsontable data
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

  // afterChange handler: single vs bulk edits
  const afterChange = (changes, type) => {
    if (!changes?.length || type === 'loadData') return;

    const hotInstance = hotRef.current.hotInstance;
    const { id: fieldId, value: valueField, groups } = modelRef.current;
    let updated_cells = [];

    const bulkTypes = ['Autofill.fill', 'CopyPaste.paste', 'CopyPaste.cut'];
    if (bulkTypes.includes(type)) {
      // Bulk update → send all changed cells
      changes.forEach(([row, col, oldVal, newVal]) => {
        const rowData = hotInstance.getDataAtRow(row);
        const id_index = col - groups.length;
        const data_id = JSON.parse(rowData[rowData.length - 1])[id_index];
        updated_cells.push({
          [fieldId]: data_id,
          [valueField]: Number(newVal),
          timestamp: new Date().toISOString()
        });
      });
    } else {
      // Single cell → only last changed cell
      const [row, col, oldVal, newVal] = changes[changes.length - 1];
      const rowData = hotInstance.getDataAtRow(row);
      const id_index = col - groups.length;
      const data_id = JSON.parse(rowData[rowData.length - 1])[id_index];
      updated_cells.push({
        [fieldId]: data_id,
        [valueField]: Number(newVal),
        timestamp: new Date().toISOString()
      });
    }

    // Send updated data to Retool parent / iframe
    if (window.parent) {
      window.parent.postMessage({
        type: 'UPDATED_DATA',
        updated_data: updated_cells
      }, '*');
    }
  };

  // Styling for totals/subtotals
  const columnSummaryStyle = (row, col) => {
    const classNames = [];
    if (formattedData.grand_total_row === row) classNames.push('grand_total');
    if (formattedData.row_total_column === col) classNames.push('row_total');
    if (formattedData.sub_total_rows?.includes(row)) classNames.push('sub_total');
    return classNames.length ? { className: classNames.join(' '), readOnly: false } : {};
  };

  // Refresh table on model changes
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

export default ExampleSpreadsheetBulkAware;
