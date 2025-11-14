import React, { useEffect, useRef, useState } from "react";
import Handsontable from "handsontable";
import "handsontable/dist/handsontable.full.min.css";

export default function Spreadsheet({ model, onChange }) {
  const tableRef = useRef(null);
  const hotRef = useRef(null);

  // Local storage of visible grid
  const [gridData, setGridData] = useState([]);

  // Convert model.data into Handsontable format
  useEffect(() => {
    if (!model?.data) return;

    const rows = model.data.map(row => {
      // row includes pivot values + JSON array of ids
      return [...row];
    });

    setGridData(rows);
  }, [model]);

  // Initialize Handsontable
  useEffect(() => {
    if (!tableRef.current) return;

    hotRef.current = new Handsontable(tableRef.current, {
      data: gridData,
      rowHeaders: true,
      colHeaders: model?.columns || [],
      licenseKey: "non-commercial-and-evaluation",
      width: "100%",
      height: 500,
      manualColumnMove: true,
      manualRowMove: true,
      contextMenu: true,

      // *********** CRITICAL FIX ***************
      // Only returns cells edited NOW.
      afterChange: (changes, source) => {
        if (!changes || source === "loadData") return;

        const latestUpdates = [];

        changes.forEach(change => {
          const [rowIndex, colIndex, oldVal, newVal] = change;

          if (rowIndex == null || colIndex == null) return;
          if (newVal === oldVal) return;

          const row = hotRef.current.getSourceDataAtRow(rowIndex);
          if (!row) return;

          // Last column always contains JSON of IDs from pivot
          const idJson = row[row.length - 1];
          let idArray = [];

          try {
            idArray = JSON.parse(idJson);
          } catch (e) {
            console.error("ID array parse error", e);
            return;
          }

          // Determine which ID corresponds to this edited pivot column
          const pivotIndex = colIndex - model.groups.length;
          const uniqueId = idArray[pivotIndex];

          if (!uniqueId) return;

          latestUpdates.push({
            [model.id]: uniqueId,
            [model.value]: Number(newVal),
            timestamp: Date.now()
          });
        });

        // 🚀 Send back ONLY the cell(s) changed now
        onChange({ updated_data: latestUpdates });
      }
      // *****************************************
    });

    return () => {
      if (hotRef.current) hotRef.current.destroy();
    };
  }, [gridData]);

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <div ref={tableRef} />
    </div>
  );
}
