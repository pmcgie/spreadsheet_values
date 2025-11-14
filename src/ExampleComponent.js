import React, { useEffect, useRef } from "react";
import Handsontable from "handsontable";
import "handsontable/dist/handsontable.full.min.css";

export default function HotEditor({ model, onChange }) {
  const hotRef = useRef(null);
  const containerRef = useRef(null);

  // Keep last reported changes so we do not duplicate output
  const lastCycleIds = useRef(new Set());

  // Initialize HOT once
  useEffect(() => {
    if (!containerRef.current) return;

    hotRef.current = new Handsontable(containerRef.current, {
      data: model?.data ?? [],
      rowHeaders: true,
      colHeaders: model?.columns ?? [],
      licenseKey: "non-commercial-and-evaluation",

      afterChange: function (changes, source) {
        if (source === "loadData" || !changes) return;

        // Reset the changed-cell tracker on every new input event
        lastCycleIds.current = new Set();

        // Allow HOT to finish adding changed_cell classes before processing
        setTimeout(() => {
          const hot = hotRef.current;
          const updated = [];

          // Scan DOM for any cells with class "changed_cell"
          const changedCells = containerRef.current.querySelectorAll(
            ".changed_cell"
          );

          changedCells.forEach((cell) => {
            const row = hot.getCoords(cell).row;
            const col = hot.getCoords(cell).col;
            const prop = hot.colToProp(col);
            const rowData = hot.getSourceDataAtRow(row);

            if (!rowData) return;
            const unique_id = rowData.unique_id;
            const hc = rowData.hc;
            const value = hot.getDataAtCell(row, col);

            // Avoid duplicates within the same edit cycle
            const hash = `${unique_id}-${prop}`;
            if (lastCycleIds.current.has(hash)) return;
            lastCycleIds.current.add(hash);

            updated.push({
              unique_id,
              hc,
              column: prop,
              value,
            });
          });

          // Output only THIS cycle's changed cells
          onChange({ updated_data: updated });
        });
      },

      cells(row, col) {
        return {
          className: "cell_default"
        };
      }
    });
  }, []);

  // If Retool updates data externally, reload HOT
  useEffect(() => {
    if (!hotRef.current || !model?.data) return;
    hotRef.current.loadData(model.data);
  }, [model?.data]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", overflow: "hidden" }}
    />
  );
}
