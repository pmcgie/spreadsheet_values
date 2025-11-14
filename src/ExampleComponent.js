import React, { useEffect, useRef, useState } from 'react';
import { HotTable, HotColumn } from '@handsontable/react';
import Handsontable from 'handsontable';
import 'handsontable/dist/handsontable.full.min.css';
import { registerPlugin, AutoColumnSize, ContextMenu, DropdownMenu, UndoRedo } from 'handsontable/plugins';

registerPlugin(AutoColumnSize);
registerPlugin(ContextMenu);
registerPlugin(DropdownMenu);
registerPlugin(UndoRedo);

const ExampleSpreadsheetPlainReact = ({ model }) => {
  const hotRef = useRef(null);
  const [tableData, setTableData] = useState([]);
  const handledCellsRef = useRef(new Set());

  // Initialize table when model changes
  useEffect(() => {
    if (!model?.data?.length) return;

    const fields = model.fields || [];
    const data = model.data.map((row) => {
      return fields.map(f => row[f]);
    }).map((row, i) => {
      // Append _ids array for mapping
      return [...row, JSON.stringify(model.data[i]._ids || [])];
    });

    setTableData(data);
    handledCellsRef.current.clear();
  }, [model]);

  const afterChange = (changes, type) => {
    if (!changes?.length || type !== 'edit') return;

    const hot = hotRef.current.hotInstance;
    const fields = model.fields || [];
    const idField = model.id || 'unique_id';
    const valueField = model.value || 'hc';

    changes.forEach(([row, col, oldVal, newVal]) => {
      const rowData = hot.getDataAtRow(row);
      const data_id = JSON.parse(rowData[rowData.length - 1])[col];
      const cellKey = `${data_id}-${col}`;

      if (handledCellsRef.current.has(cellKey)) return;

      const updatedCell = {
        [idField]: data_id,
        [valueField]: Number(newVal),
        timestamp: new Date().toISOString()
      };

      // Send updated data to parent window (Retool)
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

export default ExampleSpreadsheetPlainReact;
