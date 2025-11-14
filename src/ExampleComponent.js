import React, { useEffect, useRef, useState } from "react";
import Handsontable from "handsontable";
import "handsontable/dist/handsontable.full.css";

export default function Spreadsheet({ model, updateModel }) {
  const tableRef = useRef(null);
  const hotRef = useRef(null);

  const [tableData, setTableData] = useState([]);
  const cellIdsRef = useRef([]); // 2D array → each (row,col) has unique_id + hc

  // ---------------------------
  // Initialize table from model
  // ---------------------------
  useEffect(() => {
    if (model?.data && model?.data.length > 0) {
      const incoming = model.data.map(row => row.hc_values);
      const ids = model.data.map(row => row.unique_ids);

      setTableData(incoming);
      cellIdsRef.current = ids;
    }
  }, [model]);

  // ---------------------------
  // Setup Handsontable
  // ---------------------------
  useEffect(() => {
    if (!tableRef.current || tableData.length === 0) return;

    if (hotRef.current) hotRef.current.destroy();

    const hot = new Handsontable(tableRef.current, {
      data: tableData,
      rowHeaders: true,
      colHeaders: model?.columns || true,
      licenseKey: "non-commercial-and-evaluation",
      manualColumnMove: true,
      manualRowMove: true,
      contextMenu: true,
      width: "100%",
      height: 450,

      // -----------------------------------
      // ON CELL CHANGE — ONLY RETURN CHANGED
      // -----------------------------------
      afterChange: (changes, source) => {
        if (!changes || source === "loadData") return;

        const changedCells = [];

        changes.forEach(([visualRow, visualCol, oldVal, newVal]) => {
          // ignore unchanged
          if (oldVal === newVal) return;

          // convert visual → physical coordinates
          const physicalRow = hot.toPhysicalRow(visualRow);
          const physicalCol = hot.toPhysicalColumn(visualCol);

          // correct unique_id based on the physical location
          const uniqueId = cellIdsRef.current?.[physicalRow]?.[physicalCol];

          // update model for Retool
          changedCells.push({
            row: physicalRow,
            column: physicalCol,
            unique_id: uniqueId,
            hc: Number(newVal),
            timestamp: new Date().toISOString(),
          });
        });

        // ONLY send changed cells to updated_data
        updateModel({
          ...model,
          updated_data: changedCells,
        });
      },
    });

    hotRef.current = hot;
  }, [tableData]);

  return (
    <div
      ref={tableRef}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        border: "1px solid #ddd",
      }}
    />
  );
}
