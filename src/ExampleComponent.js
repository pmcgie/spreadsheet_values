import React, { useEffect, useRef, useState } from "react";
import Handsontable from "handsontable";
import "handsontable/dist/handsontable.full.min.css";
import {
  applyCellEdit,
  calculateGrandTotals,
  cleanNumber,
} from "./helper";

export default function ExampleComponent({ data }) {
  const hotRef = useRef(null);
  const containerRef = useRef(null);

  const [changesToData, setChangesToData] = useState([]);

  useEffect(() => {
    if (!containerRef.current) return;

    hotRef.current = new Handsontable(containerRef.current, {
      data,
      rowHeaders: true,
      colHeaders: true,
      width: "100%",
      height: 450,
      licenseKey: "non-commercial-and-evaluation",

      // Allow all editing
      manualColumnResize: true,
      manualRowResize: true,

      afterChange: (change, source) => {
        if (source === "loadData" || !change) return;

        change.forEach(([rowIndex, prop, oldValue, newValue]) => {
          if (oldValue === newValue) return;

          const row = data[rowIndex];
          const rowId = row.rowId;

          // Save update cleanly & isolated
          setChangesToData((prev) =>
            applyCellEdit(prev, rowId, prop, newValue)
          );
        });
      },
    });

    return () => {
      if (hotRef.current) hotRef.current.destroy();
    };
  }, [data]);

  const totals = calculateGrandTotals(data, changesToData);

  return (
    <div style={{ padding: 20 }}>
      <h2>Editable Table</h2>
      <div
        ref={containerRef}
        style={{
          border: "1px solid #ccc",
          marginBottom: "20px",
        }}
      />

      <h3>Grand Totals</h3>
      <pre>{JSON.stringify(totals, null, 2)}</pre>
    </div>
  );
}
