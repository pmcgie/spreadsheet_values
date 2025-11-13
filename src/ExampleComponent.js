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

// HyperFormula instance (for formulas/totals only)
const hf = HyperFormula.buildEmpty({ licenseKey: 'internal-use-in-handsontable' });
const sheetName = hf.addSheet("main");
const sheetId = hf.getSheetId(sheetName);

const ExampleSpreadsheet = ({ model, modelUpdate }) => {
  const [formattedData, setFormattedData] = useState([]);
  const hotRef = useRef(null);
  const loadingRef = useRef(false);

  // Initialize table on mount or when model.data changes
  useEffect(() => {
    if (model.data?.length) {
      initializeTable(model.data);
      modelUpdate({ updated_data: [] });
    }
  }, [model.data]);

  const initializeTable = (data) => {
    loadingRef.current = true;

    // Pivot/format data for HOT
    let formatted = dataToRows(data, model.pivot, model.groups, model.value, model.id);

    if (model.totals && formatted?.data?.length) {
      if (model.totals.row_total) formatted = applyRow(formatted);
      if (model.totals.sub_total) formatted = applySub(formatted);
      if (model.totals.grand_total) formatted = applyGrand(formatted);
    }

    setFormattedData(formatted);

    setTimeout(() => {
      if (hotRef.current) {
        hotRef.current.loadData(formatted.data);
      }
      try { hf.clearSheet(sheetId); } catch(e) {}
      hf.setSheetContent(sheetId, formatted.data);
      loadingRef.current = false;
    }, 0);
  };

  // Commit editor value before reading HOT
  const flushEditor = () => {
    const hotInstance = hotRef.current?.hotInstance;
    if (hotInstance?.getActiveEditor && hotInstance.getActiveEditor()) {
      const editor = hotInstance.getActiveEditor();
      if (editor && editor.finishEditing) editor.finishEditing(false);
    }
  };

  // Push HOT values to Retool
  const pushUpdatedData = () => {
    flushEditor();
    const hotInstance = hotRef.current?.hotInstance;
    if (!hotInstance) return;
    const currentValues = hotInstance.getData(); // HOT values = truth
    modelUpdate({ updated_data: currentValues });
  };

  // HOT callbacks
  const afterChange = (changes, type) => {
    if (!changes?.length || type === 'loadData' || loadingRef.current) return;
    const relevantTypes = ['edit', 'Autofill.fill', 'CopyPaste.cut', 'CopyPaste.paste'];
    if (!relevantTypes.includes(type)) return;

    pushUpdatedData();
  };

  const afterSelectionEnd = () => {
    pushUpdatedData();
  };

  // Optional: refresh with latest external data safely
  const refreshLatestData = (newData) => {
    if (!newData?.length) return;

    const hotInstance = hotRef.current?.hotInstance;
    if (!hotInstance) return;

    // Pivot/format new data
    let formatted = dataToRows(newData, model.pivot, model.groups, model.value, model.id);
    if (model.totals && formatted?.data?.length) {
      if (model.totals.row_total) formatted = applyRow(formatted);
      if (model.totals.sub_total) formatted = applySub(formatted);
      if (model.totals.grand_total) formatted = applyGrand(formatted);
    }

    // Clear HOT and reload new data safely
    hotInstance.clear();
    hotInstance.loadData(formatted.data);
    modelUpdate({ updated_data: [] });

    try { hf.clearSheet(sheetId); } catch(e) {}
    hf.setSheetContent(sheetId, formatted.data);

    setFormattedData(formatted);
  };

  // Cell styling for totals
  const columnSummaryStyle = (row, col) => {
    if (!formattedData) return {};
    const classNames = [];

    if (formattedData.grand_total_row === row) classNames.push('grand_total');
    if (formattedData.row_total_column === col) classNames.push('row_total');
    if (formattedData.sub_total_rows?.includes(row)) classNames.push('sub_total');

    if (classNames.length) return { className: classNames.join(' '), readOnly: true };
    return {};
  };

  if (!formattedData?.data?.length) return <></>;

  return (
    <div style={{ height: '100vh', width: '100vw' }}>
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
        afterSelectionEnd={afterSelectionEnd}
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
