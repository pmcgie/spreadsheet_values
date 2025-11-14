import React, { useEffect, useRef, useState } from "react";
import { HotTable, HotColumn } from "@handsontable/react";
import Handsontable from "handsontable";
import "handsontable/dist/handsontable.full.min.css";
import {
  registerPlugin,
  AutoColumnSize,
  ContextMenu,
  DropdownMenu,
  UndoRedo,
} from "handsontable/plugins";

registerPlugin(AutoColumnSize);
registerPlugin(ContextMenu);
registerPlugin(DropdownMenu);
registerPlugin(UndoRedo);

const ExampleSpreadsheetRetoolDerived = ({ model }) => {
  const hotRef = useRef(null);
  const [tableData, setTableData] = useState([]);
  const cellIdsRef = useRef([]); // 2D array storing unique ids per cell
  const initializedRef = useRef(false);

  // Initialize table only once or when fields/rows change
  useEffect(() => {
    if (!model?.data?.length) return;
    if (initializedRef.current) return;

    const fields = model.fields || [];

    // Build table values
    const data = model.data.map((row) => fields.map((f) => row[f]));

    // Build _ids mapping aligned with table cells
    const cellIds = model.data.map((row) => {
      if (row._idsMap) return fields.map((f) => row._idsMap[f]);
      return fields.map(() => row[model.id]);
    });

    setTableData(data);
    cellIdsRef.current = cellIds;
    initializedRef.current = true;
  }, [model]);

  // Handle edits in Handsontable
  const afterChange = (changes, type) => {
    if (!changes || type !== "edit") return;

    const hot = hotRef.current.hotInstance;
    const idField = model.id || "unique_id";
    const valueField = model.value || "hc";

    // Update tableData in place
    setTableData((prev) => {
      const updated = [...prev];
      changes.forEach(([row, col, oldVal, newVal]) => {
        updated[row] = [...updated[row]];
        updated[row][col] = Number(newVal);
      });
      return updated;
    });

    // Send **only the changed cells**
    const updatedCells = changes.map(([row, col, oldVal, newVal]) => ({
      [idField]: cellIdsRef.current[row][col],
      [valueField]: Number(newVal),
      timestamp: new Date().toISOString(),
    }));

    window.parent.postMessage(
      {
        type: "UPDATED_DATA",
        updated_data: updatedCells,
      },
      "*"
    );
  };

  // Function to derive full updated_data from table
  const getFullUpdatedData = () => {
    const idField = model.id || "unique_id";
    const valueField = model.value || "hc";

    const updatedData = [];
    tableData.forEach((row, rowIndex) => {
      row.forEach((val, colIndex) => {
        updatedData.push({
          [idField]: cellIdsRef.current[rowIndex][colIndex],
          [valueField]: val,
          timestamp: new Date().toISOString(),
        });
      });
    });
    return updatedData;
  };

  if (!tableData?.length) return <></>;

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <HotTable
        ref={hotRef}
        data={tableData}
        colHeaders={model.labels || model.fields}
        rowHeaders={true}
        width="100%"
        height="100%"
        stretchH="all"
        manualColumnResize={true}
        manualRowResize={true}
        allowInsertRow={false}
        allowInsertColumn={false}
        fillHandle={false}
        contextMenu={true}
        undoRedo={true}
        afterChange={afterChange}
      >
        {(model.fields || []).map((f, i) => (
          <HotColumn key={f} data={i} type="numeric" readOnly={false} />
        ))}
      </HotTable>

      {/* Optional: button to post full current table state */}
      <button
        onClick={() => {
          const fullData = getFullUpdatedData();
          window.parent.postMessage(
            { type: "UPDATED_DATA", updated_data: fullData },
            "*"
          );
        }}
      >
        Send Full Updated Data
      </button>
    </div>
  );
};

export default ExampleSpreadsheetRetoolDerived;
