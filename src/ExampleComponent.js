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
import {
  applyGrand,
  applyRow,
  applySub,
  changesToData,
  dataToRows,
  parseNumeric
} from './helpers';

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

const ExampleSpreadsheet = (props) => {
  const model = props.model;
  const modelUpdate = props.modelUpdate;

  const [data, setData] = useState([]);
  const [formatted_data, setFormattedData] = useState([]);
  const [all_changes, setAllChanges] = useState([]);

  // Refresh data when model changes
  useEffect(function () {
    if (!isEqual(model.data, data)) {
      refreshData();
    }
  }, [model]);

  // Push changes to model
  useEffect(function () {
    if (all_changes.length > 0) {
      var updated_data = changesToData(
        formatted_data,
        all_changes,
        model.totals && model.totals.row_total
      );
      modelUpdate({ updated_data: updated_data });
    }
  }, [all_changes]);

  // -------------------------
  // REFRESH DATA
  // -------------------------
  function refreshData() {
    if (!model.data) return;

    setData(model.data);
    setAllChanges([]);
    modelUpdate({ updated_data: [] });

    var formatted = dataToRows(model.data, model.pivot, model.groups, model.value, model.id);

    if (model.totals && formatted.data.length > 0) {
      if (model.totals.row_total) formatted = applyRow(formatted);
      if (model.totals.sub_total) formatted = applySub(formatted);
      if (model.totals.grand_total) formatted = applyGrand(formatted);
    }

    setFormattedData(formatted);

    if (formatted.data.length > 0) {
      hf.setSheetContent(sheetId, formatted.data);
    }
  }

  // -------------------------
  // SANITIZE INPUT BEFORE HF
  // -------------------------
  function sanitizeInput(v) {
    if (typeof v !== "string") return v;
    return v.replace(/[$,]/g, "");
  }

  function afterChange(changes, type) {
    if (type === "loadData" || !changes) return;

    var allowedTypes = ['edit', 'Autofill.fill', 'CopyPaste.cut', 'CopyPaste.paste'];
    if (allowedTypes.indexOf(type) > -1) {
      changes.forEach(function (ch) {
        ch[3] = sanitizeInput(ch[3]);
      });

      setAllChanges(function (prev) {
        var map = new Map();
        prev.forEach(function (ch) {
          map.set(ch[0] + "-" + ch[1], ch);
        });
        changes.forEach(function (ch) {
          map.set(ch[0] + "-" + ch[1], ch);
        });
        return Array.from(map.values());
      });
    }
  }

  // -------------------------
  // CELL STYLING + RENDERER
  // -------------------------
  function columnSummaryStyle(row, col) {
    if (!formatted_data) return {};
    var cellMeta = {};
    var classNames = [];

    // highlight edited cells
    for (var i = 0; i < all_changes.length; i++) {
      var o = all_changes[i];
      if (o[0] === row && o[1] === col) {
        classNames.push("changed_cell");
        break;
      }
    }

    if (formatted_data.grand_total_row === row) classNames.push("grand_total");
    if (formatted_data.row_total_column === col) classNames.push("row_total");
    if (formatted_data.sub_total_rows && formatted_data.sub_total_rows.indexOf(row) > -1) {
      classNames.push("sub_total");
    }

    if (classNames.length > 0) cellMeta.className = classNames.join(" ");

    // renderer for numeric / currency
    var rawValue = formatted_data.data[row][col];
    var numeric = parseNumeric(rawValue);
    if (numeric !== null) {
      cellMeta.renderer = function (instance, td, rowR, colR, prop, value, cellProperties) {
        td.textContent = "$" + numeric.toLocaleString();
        if (cellProperties.className) td.className = cellProperties.className;
      };
    }

    return cellMeta;
  }

  if (!formatted_data || !formatted_data.data || formatted_data.data.length === 0) return null;

  // -------------------------
  // RENDER TABLE
  // -------------------------
  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <HotTable
        columnSorting={model.columnSorting ? true : false}
        undoRedo={true}
        contextMenu={model.contextMenu ? true : false}
        manualColumnFreeze={model.fixedColumnsLeft && model.fixedColumnsLeft > 0 ? true : false}
        fixedColumnsLeft={model.fixedColumnsLeft || 0}
        data={formatted_data.data}
        licenseKey={licenseKey}
        colWidths={model.colWidths}
        fillHandle={{ autoInsertRow: false, autoInsertColumn: false }}
        cells={columnSummaryStyle}
        afterChange={afterChange}
        allowInsertRow={false}
        allowInsertColumn={false}
        formulas={{ engine: hf, sheetName: sheetName }}
        colHeaders={formatted_data.columns.map(function (c) {
          if (model.labels && model.fields) {
            var idx = model.fields.indexOf(c);
            return idx >= 0 ? model.labels[idx] : c;
          }
          return c;
        })}
      >
        {formatted_data.columns.map(function (c, i) {
          if (c !== "_ids") {
            return (
              <HotColumn
                key={c}
                data={i}
                readOnly={model.groups && model.groups.indexOf(c) > -1 ? true : false}
                type={model.groups && model.groups.indexOf(c) > -1 ? "numeric" : "text"}
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
