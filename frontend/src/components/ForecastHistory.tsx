import { useEffect, useState } from 'react';
import { floodlensApi } from '../api/floodlensApi';
import type { ForecastRecord, ForecastComparison } from '../types';

export function ForecastHistory({ stationCode, refreshKey }: { stationCode: string | null; refreshKey: number }) {
  const [mode, setMode] = useState<'shadow' | 'replay'>('shadow');
  const key = `${stationCode}/${mode}/${refreshKey}`;
  const [historyState, setHistoryState] = useState<{ key: string; records: ForecastRecord[]; error: string }>({ key: '', records: [], error: '' });
  const [comparisonState, setComparisonState] = useState<{ key: string; id: number; result: ForecastComparison | null; error: string } | null>(null);
  const [selection, setSelection] = useState<{ key: string; id: number } | null>(null);
  const selectedId = selection?.key === key ? selection.id : null;
  const records = historyState.key === key ? historyState.records : [];
  const comparison = comparisonState?.key === key && comparisonState.id === selectedId ? comparisonState.result : null;
  const error = (comparisonState?.key === key && comparisonState.id === selectedId ? comparisonState.error : '') || (historyState.key === key ? historyState.error : '');
  useEffect(() => {
    let cancelled = false;
    if (stationCode) floodlensApi.getForecastHistory(stationCode, mode)
      .then(data => { if (!cancelled) setHistoryState({ key, records: data, error: '' }); })
      .catch(err => { if (!cancelled) setHistoryState({ key, records: [], error: String(err) }); });
    return () => { cancelled = true; };
  }, [stationCode, key, mode]);
  useEffect(() => {
    let cancelled = false;
    if (selectedId !== null) floodlensApi.getForecastComparison(selectedId)
      .then(data => { if (!cancelled) setComparisonState({ key, id: selectedId, result: data, error: '' }); })
      .catch(err => { if (!cancelled) setComparisonState({ key, id: selectedId, result: null, error: String(err) }); });
    return () => { cancelled = true; };
  }, [selectedId, key]);
  if (!stationCode) return null;
  return (
    <details className="mt-4 rounded-3xl bg-white/85 border border-slate-200 p-5 text-sm">
      <summary className="cursor-pointer font-semibold text-slate-800">ประวัติผลพยากรณ์และค่าจริง</summary>
      <label className="block mt-3 text-slate-600">แหล่งผลพยากรณ์
        <select value={mode} onChange={event => setMode(event.target.value as 'shadow' | 'replay')} className="ml-3 border rounded-lg p-2">
          <option value="shadow">ข้อมูล RID เพื่อทดลอง</option><option value="replay">ทดสอบย้อนหลัง</option>
        </select>
      </label>
      {error && <p className="text-amber-700 mt-2" role="status">{error}</p>}
      {!records.length && <p className="text-slate-500 mt-3">ยังไม่มีผลพยากรณ์ที่บันทึกไว้ในโหมดนี้</p>}
      {!!records.length && <div className="overflow-x-auto mt-3"><table className="w-full text-left text-xs">
        <thead><tr><th>เวลาอ้างอิงข้อมูล (ไทย)</th><th>+1h</th><th>+2h</th><th>+3h</th><th>ข้อมูลเข้า</th><th /></tr></thead>
        <tbody>{records.map(record => <tr key={record.id} className="border-t border-slate-100">
          <td className="py-2">{new Date(record.forecast_time).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</td>
          <td>{record.predicted_1h.toFixed(2)}</td><td>{record.predicted_2h.toFixed(2)}</td><td>{record.predicted_3h.toFixed(2)}</td>
          <td>{record.data_quality_status === 'PARTIAL_INPUTS' ? 'ไม่ครบ' : 'ครบ'}</td>
          <td><button type="button" className="text-sky-700 p-2" onClick={() => { setComparisonState(null); setSelection({ key, id: record.id }); }}>เทียบค่าจริง</button></td>
        </tr>)}</tbody>
      </table></div>}
      {comparison && <div className="mt-3 text-slate-600">
        <p className="font-semibold">ผลรอบ #{comparison.forecast_id} · หน่วยเมตรตามรายงาน</p>
        {comparison.items.map(item => <p key={item.lead_time_hours} className="mt-1">+{item.lead_time_hours}h: ทำนาย {item.predicted_level.toFixed(2)} · ค่าจริง {item.actual_level?.toFixed(2) ?? 'ยังไม่มีข้อมูล RID'} · คลาดเคลื่อน {item.mae_error?.toFixed(2) ?? '—'}</p>)}
      </div>}
    </details>
  );
}
