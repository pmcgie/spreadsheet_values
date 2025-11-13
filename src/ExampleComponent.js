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

// Single HyperFormula instance used by the component.
// Keep it outside the component so formulas persist across renders.
const hf = HyperFormula.buildEmpty({
    licenseKey: 'internal-use-in-handsontable'
});
const sheetName = hf.addSheet("main");
const sheetId = hf.getSheetId(sheetName);

const ExampleSpreadsheet = ({ triggerQuery, model, modelUpdate }) => {
    // Component state preserved, structure unchanged.
    const [data, setData] = useState([]);
    const [formatted_data, setFormattedData] = useState([]);
    const [all_changes, setAllChanges] = useState([]);

    // keep a ref to indicate when we're programmatically loading data,
    // so afterChange can ignore those events if necessary.
    const loadingRef = useRef(false);

    // --- Refresh when model changes (preserve original behavior) ---
    useEffect(() => {
        if (!isEqual(model.data, data)) {
            refreshData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [model]);

    // --- When either formatted_data or all_changes change, recalc updated_data ---
    useEffect(() => {
        // Guards to avoid race conditions:
        if (!formatted_data || !formatted_data.data || !formatted_data.data.length) return;
        if (!all_changes || !all_changes.length) {
            // if there are no changes, ensure model has an empty updated_data
            modelUpdate({ updated_data: [] });
            return;
        }

        // Call changesToData with the freshest formatted_data and deduped changes.
        const updated_data = changesToData(
            formatted_data,
            all_changes,
            (model.totals && model.totals.row_total) ? model.totals.row_total : false
        );

        modelUpdate({ updated_data });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [all_changes, formatted_data]);

    // --- refreshData: use model.data directly (avoid stale setState reliance),
    // clear HF sheet before setting content, and reset changes ---
    const refreshData = () => {
        if (!model.data) return;

        const incoming = model.data; // use fresh incoming data

        // indicate we're loading so afterChange can ignore load events if they appear
        loadingRef.current = true;

        setData(incoming); // keep state for parity with existing code
        setAllChanges([]); // reset tracked changes on refresh
        modelUpdate({ updated_data: [] }); // clear any previous updated_data

        let formatted = dataToRows(incoming, model.pivot, model.groups, model.value, model.id);

        if (model.totals && formatted && formatted.data && formatted.data.length) {
            if (model.totals.row_total) { formatted = applyRow(formatted); }
            if (model.totals.sub_total) formatted = applySub(formatted);
            if (model.totals.grand_total) { formatted = applyGrand(formatted); }
        }

        setFormattedData(formatted);

        if (formatted && formatted.data && formatted.data.length) {
            // Clear HyperFormula sheet to avoid stale references/offsets
            try {
                hf.clearSheet(sheetId);
            } catch (e) {
                // clearSheet may not exist in some versions; fall back to setSheetContent with []
                // but we still try to avoid stale content
            }
            hf.setSheetContent(sheetId, formatted.data);
        }

        // small timeout to allow Handsontable internal load events to finish (prevents capturing load events)
        // Note: this is a short-lived local timing guard, not an async promise that defers work.
        setTimeout(() => {
            loadingRef.current = false;
        }, 0);
    }

    // --- afterChange with dedupe and guards ---
    const afterChange = (changes, type) => {
        // ignore internal loadData
        if (type === 'loadData') {
            return;
        }

        // also ignore events that happen while we're programmatically loading
        if (loadingRef.current) return;

        if (!changes || !changes.length) return;

        // Only handle useful types (same as original)
        const relevantTypes = ['edit','Autofill.fill','CopyPaste.cut','CopyPaste.paste'];
        if (relevantTypes.indexOf(type) === -1) return;

        // Changes are arrays like [row, propOrColIndex, oldValue, newValue]
        // Merge them into existing all_changes but dedupe by row:col (keep the latest)
        setAllChanges(prev => {
            // Build a map keyed by row:col -> change (keeps last occurrence)
            const map = {};

            // start from previous changes (so earlier edits to other cells are preserved)
            if (prev && prev.length) {
                prev.forEach(c => {
                    if (!c || c.length < 2) return;
                    const key = `${c[0]}:${c[1]}`;
                    map[key] = c;
                });
            }

            // overlay with the incoming changes (these are the most recent)
            changes.forEach(c => {
                if (!c || c.length < 2) return;
                const key = `${c[0]}:${c[1]}`;
                map[key] = c;
            });

            // return deduped array (preserve order of keys as they were inserted into map)
            return Object.values(map);
        });
    }

    // --- style function for cells (keeps original intent) ---
    const columnSummaryStyle = (row, col) => {
        if (!formatted_data) return {}
        let classNames = [];

        // Mark changed cells using the deduped all_changes array
        if (all_changes && all_changes.length) {
            // faster lookup by building a set of keys once
            const keySet = new Set(all_changes.map(c => `${c[0]}:${c[1]}`));
            if (keySet.has(`${row}:${col}`)) {
                return { className: 'changed_cell' };
            }
        }

        if (formatted_data.grand_total_row && row === formatted_data.grand_total_row) {
            classNames.push('grand_total')
        }
        if (formatted_data.row_total_column && col === formatted_data.row_total_column) {
            classNames.push('row_total')
        }
        if (formatted_data.sub_total_rows && formatted_data.sub_total_rows.indexOf(row) > -1) {
            classNames.push('sub_total')
        }
        if (classNames.length) {
            return {className: classNames.join(' '), readOnly: true}
        } else {
            return {}
        }
    }

    // --- render: preserve original structure and props ---
    if (formatted_data.data && formatted_data.data.length) {
        return  <div style={{height: '100vh', width: '100vw'}}>
            <HotTable
                columnSorting={(Boolean(model.columnSorting))}
                undoRedo={true}
                contextMenu={(Boolean(model.contextMenu))}
                manualColumnFreeze={(model.fixedColumnsLeft && Number(model.fixedColumnsLeft)>0)?true:false}
                fixedColumnsLeft={(model.fixedColumnsLeft && Number(model.fixedColumnsLeft)>0)?model.fixedColumnsLeft:0}
                data={formatted_data.data}
                licenseKey={licenseKey}
                colWidths={model.colWidths}
                fillHandle={{
                    autoInsertRow: false,
                    autoInsertColumn: false
                }}
                cells={columnSummaryStyle}
                afterChange={afterChange}
                allowInsertRow={false}
                allowInsertColumn={false}
                formulas={{engine: hf, sheetName}}
                colHeaders={formatted_data.columns.map(c=>{
                    if (model.labels) {
                        return model.labels[model.fields.indexOf(c)] || c
                    }
                    return c
                })}
            >
            {formatted_data.columns.map((c,i)=>{
                if (c!=='_ids') {
                    return <HotColumn
                        key={c}
                        data={i}
                        readOnly={model.groups.indexOf(c)>-1}
                        type={(model.groups.indexOf(c)>-1)?"numeric":"text"}
                    />
                } else {
                    return <React.Fragment key={c} />
                }
            })}
        </HotTable>
        </div>
    } else {
        return <React.Fragment />
    }
}

export default ExampleSpreadsheet;
