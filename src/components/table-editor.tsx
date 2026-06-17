"use client";

import type { TableData } from "@/types/policy";

type Props = {
  tables: TableData[];
  onChange: (tables: TableData[]) => void;
  onBlur: () => void;
  canEdit: boolean;
};

export function TableEditor({ tables, onChange, onBlur, canEdit }: Props) {
  function newId() { return crypto.randomUUID(); }

  function addTable() {
    onChange([...tables, { id: newId(), caption: "", headers: ["항목", "내용"], rows: [["", ""]] }]);
  }

  function update(id: string, patch: Partial<TableData>) {
    onChange(tables.map(t => t.id === id ? { ...t, ...patch } : t));
  }

  function del(id: string) { onChange(tables.filter(t => t.id !== id)); onBlur(); }

  function addRow(id: string) {
    const t = tables.find(x => x.id === id); if (!t) return;
    update(id, { rows: [...t.rows, t.headers.map(() => "")] });
  }

  function removeRow(id: string, ri: number) {
    const t = tables.find(x => x.id === id); if (!t) return;
    update(id, { rows: t.rows.filter((_, i) => i !== ri) }); onBlur();
  }

  function addCol(id: string) {
    const t = tables.find(x => x.id === id); if (!t) return;
    update(id, { headers: [...t.headers, ""], rows: t.rows.map(r => [...r, ""]) });
  }

  function removeCol(id: string, ci: number) {
    const t = tables.find(x => x.id === id); if (!t) return;
    update(id, { headers: t.headers.filter((_, i) => i !== ci), rows: t.rows.map(r => r.filter((_, i) => i !== ci)) }); onBlur();
  }

  function updateHeader(id: string, ci: number, val: string) {
    const t = tables.find(x => x.id === id); if (!t) return;
    update(id, { headers: t.headers.map((h, i) => i === ci ? val : h) });
  }

  function updateCell(id: string, ri: number, ci: number, val: string) {
    const t = tables.find(x => x.id === id); if (!t) return;
    update(id, { rows: t.rows.map((row, r) => r === ri ? row.map((cell, c) => c === ci ? val : cell) : row) });
  }

  return (
    <div className="flex flex-col gap-3">
      {tables.map(table => (
        <div key={table.id} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          {/* 표 헤더 바 */}
          <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2">
            <input
              value={table.caption} readOnly={!canEdit}
              onChange={e => update(table.id, { caption: e.target.value })} onBlur={onBlur}
              placeholder="표 제목 (선택)"
              className="flex-1 bg-transparent text-xs font-bold text-ink outline-none placeholder:font-normal placeholder:text-zinc-400"
            />
            {canEdit && (
              <button type="button" onClick={() => del(table.id)}
                className="text-[11px] font-bold text-red-400 hover:text-red-600">삭제</button>
            )}
          </div>

          {/* 테이블 */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  {table.headers.map((h, ci) => (
                    <th key={ci} className="group relative px-3 py-2 text-left text-xs font-bold text-zinc-500">
                      <input value={h} readOnly={!canEdit}
                        onChange={e => updateHeader(table.id, ci, e.target.value)} onBlur={onBlur}
                        placeholder="헤더" className="w-full min-w-[60px] bg-transparent outline-none" />
                      {canEdit && table.headers.length > 1 && (
                        <button type="button" onClick={() => removeCol(table.id, ci)}
                          className="absolute right-0.5 top-0.5 hidden rounded text-[10px] text-red-400 group-hover:block hover:text-red-600">✕</button>
                      )}
                    </th>
                  ))}
                  {canEdit && (
                    <th className="px-1 py-2">
                      <button type="button" onClick={() => addCol(table.id)}
                        className="text-[11px] font-bold text-brand hover:text-brand/70">+열</button>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, ri) => (
                  <tr key={ri} className="group border-b border-zinc-50 last:border-0 hover:bg-zinc-50/50">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-1.5">
                        <input value={cell} readOnly={!canEdit}
                          onChange={e => updateCell(table.id, ri, ci, e.target.value)} onBlur={onBlur}
                          placeholder="—" className="w-full bg-transparent text-ink outline-none placeholder:text-zinc-300" />
                      </td>
                    ))}
                    {canEdit && (
                      <td className="px-1">
                        <button type="button" onClick={() => removeRow(table.id, ri)}
                          className="hidden text-[10px] text-red-400 group-hover:block hover:text-red-600">✕</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canEdit && (
            <button type="button" onClick={() => addRow(table.id)}
              className="w-full border-t border-zinc-100 py-1.5 text-center text-[11px] font-bold text-zinc-400 hover:bg-zinc-50 hover:text-ink">
              + 행 추가
            </button>
          )}
        </div>
      ))}

      {canEdit && (
        <button type="button" onClick={addTable}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded hover:bg-gray-100 hover:text-gray-700 transition-colors">
          + 표 추가
        </button>
      )}
    </div>
  );
}
