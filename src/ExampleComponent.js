import { licenseKey } from '../config.json';
import React, { useEffect, useState, useRef } from 'react';
import './styles.css'
import isEqual from 'lodash/isEqual'
import { HotTable, HotColumn } from "@handsontable/react";
import "handsontable/dist/handsontable.min.css";
import { registerPlugin, AutoColumnSize, Autofill, ColumnSummary, ColumnSorting, ManualColumnFreeze, ContextMenu, DropdownMenu, UndoRedo} from 'handsontable/plugins';
import { HyperFormula } from 'hyperformula';
import { applyGrand, applyRow, applySub, changesToData, dataToRows } from './helpers';

registerPlugin(AutoColumnSize);
registerPlugin(Autofill);
registerPlugin(ColumnSummary);
registerPlugin(ColumnSorting );
registerPlugin(ManualColumnFreeze);
registerPlugin(ContextMenu);
registerPlugin(DropdownMenu);
registerPlugin(UndoRedo);

// HyperFormula instance shared across renders
const hf = HyperFormula.buildEmpty({
    licenseKey: 'internal-use-in-handsontable'
});
const sheetName = hf.addSheet("main");
const sheetId = hf.getSheetId(sheetName);

const ExampleSpreadsheet = ({ triggerQuery, model, modelUpdate }) => {
    const [data, setData] = useState([]);
    const [formatted_data, setFormattedData] = useState([]);
    const [all_changes, setAllChanges] = useState([]);
    const loadingRef = useRef(false);

    // --- Reset updated values whenever model changes ---
    useEffect(() => {
        setAllChanges([]);
        modelUpdate({ updated_data: [] });

        if (!isEqual(model.data, data)) {
            refreshData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [model]);

    // --- Reset updated values whenever formatted_data regenerates ---
    useEffect(() => {
        if (!formatted_data?.data?.length) return;

        setAllChanges([]);
        modelUpdate({ updated_data: [] });
    }, [formatted_data]);

    // --- Apply changes to updated_data and immediately reset ---
    useEffect(() => {
        if (!formatted_data?.data?.length) return;
        if (!all_changes?.length) return;

        // Make a fresh copy to avoid mutating state
        const formattedCopy = JSON.parse(JSON.stringify(formatted_data));

        const updated_data = changesToData(
            formattedCopy,
            all_changes,
            (model.totals && model.totals.row_total) ? model.totals.row_total : false
        );

        modelUpdate({ updated_data });

        // Reset all_changes so edits are not reapplied
        setAllChanges([]);
    }, [all_changes, formatted_data]);

    const refreshData = () => {
        if (!model.data) return;

        const incoming = model.data; // fresh reference

        loadingRef.current = true; // prevent capturing load events

        setData(incoming);
        setAllChanges([]);
        modelUpdate({ updated_data: [] });

        let formatted = dataToRows(incoming, model.pivot, model.groups, model.value, model.id);

        if (model.totals && formatted?.data?.length) {
            if (model.totals.row_total) { formatted = applyRow(formatted); }
            if (model.totals.sub_total) formatted = applySub(formatted);
            if (model.totals.grand_total) { formatted = applyGrand(formatted); }
        }

        setFormattedData(formatted);

        if (formatted?.data?.length) {
            try {
                hf.clearSheet(sheetId); // prevent stale HF content
            } catch (e) { /* ignore */ }
            hf.setSheetContent(sheetId, formatted.data);
        }

        // small delay to allow Handsontable load events to finish
        setTimeout(() => {
            loadingRef.current = false;
        }, 0);
    }

    const afterChange = (changes, type) => {
        if (type === 'loadData') return;
        if (loadingRef.current) return; // ignore changes during refresh
        if (!changes?.length) return;

        const relevantTypes = ['edit','Autofill.fill','CopyPaste.cut','CopyPaste.paste'];
        if (!relevantTypes.includes(type)) return;

        // Deduplicate by row:col keeping latest value
        setAllChanges(prev => {
            const map = {};

            prev.forEach(c => {
                if (!c || c.length < 2) return;
                const key = `${c[0]}:${c[1]}`;
                map[key] = c;
            });

            changes.forEach(c => {
                if (!c || c.length < 2) return;
                const key = `${c[0]}:${c[1]}`;
                map[key] = c;
            });

            return Object.values(map);
        });
    }

    const columnSummaryStyle = (row, col) => {
        if (!formatted_data) return {};
        let classNames = [];

        if (all_changes?.length) {
            const keySet = new Set(all_changes.map(c => `${c[0]}:${c[1]}`));
            if (keySet.has(`${row}:${col}`)) return { className: 'changed_cell' };
        }

        if (formatted_data.grand_total_row && row === formatted_data.grand_total_row) classNames.push('grand_total');
        if (formatted_data.row_total_column && col === formatted_data.row_total_column) classNames.push('row_total');
        if (formatted_data.sub_total_rows?.includes(row)) classNames.push('sub_total');

        if (classNames.length) return { className: classNames.join(' '), readOnly: true };
        return {};
    }

    if (formatted_data?.data?.length) {
        return <div style={{height: '100vh', width: '100vw'}}>
            <HotTable
                columnSorting={Boolean(model.columnSorting)}
                undoRedo={true}
                contextMenu={Boolean(model.contextMenu)}
                manualColumnFreeze={model.fixedColumnsLeft && Number(model.fixedColumnsLeft) > 0}
                fixedColumnsLeft={model.fixedColumnsLeft && Number(model.fixedColumnsLeft) > 0 ? model.fixedColumnsLeft : 0}
                data={formatted_data.data}
                licenseKey={licenseKey}
                colWidths={model.colWidths}
                fillHandle={{ autoInsertRow: false, autoInsertColumn: false }}
                cells={columnSummaryStyle}
                afterChange={afterChange}
                allowInsertRow={false}
                allowInsertColumn={false}
                formulas={{ engine: hf, sheetName }}
                colHeaders={formatted_data.columns.map(c => model.labels ? model.labels[model.fields.indexOf(c)] || c : c)}
            >
                {formatted_data.columns.map((c,i) => {
                    if (c !== '_ids') {
                        return <HotColumn
                            key={c}
                            data={i}
                            readOnly={model.groups.indexOf(c) > -1}
                            type={model.groups.indexOf(c) > -1 ? "numeric" : "text"}
                        />
                    } else {
                        return <React.Fragment key={c} />;
                    }
                })}
            </HotTable>
        </div>
    } else {
        return <React.Fragment />;
    }
}

export default ExampleSpreadsheet;
