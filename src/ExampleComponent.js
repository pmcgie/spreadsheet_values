import React, { useEffect, useRef, useState } from 'react';
import { HotTable, HotColumn } from '@handsontable/react';
import Handsontable from 'handsontable';
import 'handsontable/dist/handsontable.full.min.css';
import { registerPlugin, AutoColumnSize, ContextMenu, DropdownMenu, UndoRedo } from 'handsontable/plugins';

registerPlugin(AutoColumnSize);
registerPlugin(ContextMenu);
registerPlugin(DropdownMenu);
registerPlugin(UndoRedo);

const ExampleSpreadsheetPlainReactFixed = ({ model }) => {
  const hotRef = useRef(null);
  const [tableData, setTableData] = useState([]);
  const cellIdsRef = useRef([]); // 2D array storing unique ids per cell
  const handledCellsRef = useRef(new Set());

  // Initialize table when model changes
  useEffect(() => {
    if (!model?.data?.length) return;

    const fields = model.fields || [];

    // Prepare table data
    const data = model.data.map((row) => fields.map(f => row[f]));

    // Prepare a 2D array of cell IDs aligned with tableData
    // If each row has multiple unique IDs per field, store them in _idsMap (object)
    // fallback: use the row id itself for all cells
    const cellIds = model.data.map((row) => {
      if (row._idsMap) {
        return fields.map(f => row._idsMap[f]);
      }
      return fields.map(() => row[model.id]);
    });

    setTableData(data);
    cellIdsRef.current = cellIds;
    handledCellsRef.current.clear();
  }, [model]);

  // afterChange handler
  const afterChange = (changes, type) => {
    if (!changes || type !== 'edit') return;

    const hot = hotRef.current.hotInstance;
    const idField = model.id || 'unique_id';
    const valueField = model.value || 'hc';

    changes.forEach(([row, col, oldVal, newVal]) => {
      const data_id = cellIdsRef.current[row][col]; // reliable cell-specific ID
      const cellKey = `${data_id}-${col}`;
      if (handledCellsRef.current.has(cellKey)) return;

      const updatedCell = {
        [idField]: data_id,
        [valueField]: Number(newVal),
        timestamp: new Date().toISOString()
      };

      // Send only the changed cell to parent
      window.parent.postMessage({
        type: 'UPDATED_DATA',
        updated_data: [updatedCell]
      }, '*');

      handledCellsRef.current.add(cellKey);
    });
  };

  if (!tableData?.length) return <></>;

  return (
    <div style={{ width: '100%', height: '100%' }}>
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

export default ExampleSpreadsheetPlainReactFixed;
