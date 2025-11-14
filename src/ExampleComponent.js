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

const ExampleSpreadsheetChangedCellOnlyLive = ({ model }) => {
  const hotRef = useRef(null);
  const [tableData, setTableData] = useState([]);
  const cellIdsRef = useRef([]); // 2D array storing unique ids per cell
  const initializedRef = useRef(false);

  // Initialize table once
  useEffect(() => {
    if (!model?.data?.length) return;
    if (initializedRef.current) return;

    const fields = model.fields || [];

    const data = model.data.map((row) => fields.map((f) => row[f]));

    const cellIds = model.data.map((row) => {
      if (row._idsMap) return fields.map((f) => row._idsMap[f]);
      return fields.map(() => row[model.id]);
    });

    setTableData(data);
    cellIdsRef.current = cellIds;
    initializedRef.current = true;
  }, [model]);

  // afterChange handler
  const afterChange = (changes, type) => {
    if (!changes || type !== "edit") return;

    // Update tableData
    setTableData((prev) => {
      const updated = [...prev];
      changes.forEach(([row, col, oldVal, newVal]) => {
        updated[row] = [...updated[row]];
        updated[row][col] = Number(newVal);
      });
      return updated;
    });

    // Send **only cells currently marked "changed_cell"**
    const hot = hotRef.current.hotInstance;
    const updatedCells = [];

    hot.rootElement.querySelectorAll("td.changed_cell").forEach((td) => {
      const coords = hot.getCoords(td);
      if (!coords) return;
      const { row, col } = coords;
      const data_id = cellIdsRef.current[row][col];
      const valueField = model.value || "hc";
      const idField = model.id || "unique_id";

      updatedCells.push({
        [idField]: data_id,
        [valueField]: Number(tableData[row][col]),
        timestamp: new Date().toISOString(),
      });
    });

    window.parent.postMessage(
      { type: "UPDATED_DATA", updated_data: updatedCells },
      "*"
    );
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
    </div>
  );
};

export default ExampleSpreadsheetChangedCellOnlyLive;
