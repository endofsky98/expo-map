import { useState, useEffect, useMemo } from 'react';
import { Navigation, X, MapPin } from 'lucide-react';
import { Booth, Facility } from '@/types';
import { useI18n } from '@/lib/i18n';

/* ─── 편의시설 종류별 한글 라벨 ─── */
const FACILITY_LABELS: Record<string, string> = {
  restroom: '화장실',
  restroom_male: '남자화장실',
  restroom_female: '여자화장실',
  emergency_exit: '비상구',
  stairs: '계단',
  elevator: '엘리베이터',
  escalator: '에스컬레이터',
  nursing_room: '수유실',
  info_desk: '안내데스크',
  first_aid: '응급처치',
  locker: '보관함',
  atm: 'ATM',
  cafe: '카페',
  charging: '충전소',
  wifi: 'Wi-Fi',
  smoking: '흡연실',
};

interface NavPoint {
  boothId?: number;
  facilityType?: string;
  x: number;
  y: number;
  floorId?: number;
}

interface PathfindingUIProps {
  booths: Booth[];
  facilities: Facility[];
  navStart: NavPoint | null;
  navEnd: NavPoint | null;
  onSetStart: (p: NavPoint | null) => void;
  onSetEnd: (p: NavPoint | null) => void;
  onFloorSwitch?: (floorId: number) => void;
}

export default function PathfindingUI({
  booths, facilities, navStart, navEnd, onSetStart, onSetEnd, onFloorSwitch,
}: PathfindingUIProps) {
  const { t, ln } = useI18n();
  const [isOpen, setIsOpen] = useState(false);

  /* ─── 드롭다운 state ─── */
  const [fromType, setFromType] = useState<'booth'>('booth');          // 출발은 부스만
  const [toType, setToType] = useState<'booth' | 'facility'>('booth'); // 도착은 부스 or 편의시설
  const [fromBoothId, setFromBoothId] = useState('');
  const [toBoothId, setToBoothId] = useState('');
  const [toFacilityType, setToFacilityType] = useState('');

  /* 실제 편의시설 종류 목록 (DB에 있는 것만) */
  const availableFacilityTypes = useMemo(() => {
    const types = new Set(facilities.map(f => f.type));
    return Array.from(types).sort();
  }, [facilities]);

  /* navStart/navEnd 변경 시 드롭다운 동기화 */
  useEffect(() => {
    if (navStart?.boothId) setFromBoothId(String(navStart.boothId));
    else setFromBoothId('');
  }, [navStart]);

  useEffect(() => {
    if (navEnd?.boothId) { setToType('booth'); setToBoothId(String(navEnd.boothId)); }
    else setToBoothId('');
  }, [navEnd]);

  /* ─── 길찾기 실행 ─── */
  function handleFind() {
    // 출발: 드롭다운에서 선택 or 기존 navStart
    let start = navStart;
    if (fromBoothId) {
      const b = booths.find(bb => bb.id === Number(fromBoothId));
      if (b) start = { boothId: b.id, x: b.x + b.width / 2, y: b.y + b.height / 2, floorId: b.floor_id };
    }
    if (!start) return;

    // 도착
    if (toType === 'booth') {
      if (!toBoothId) return;
      const b = booths.find(bb => bb.id === Number(toBoothId));
      if (!b) return;
      onSetStart(start);
      onSetEnd({ boothId: b.id, x: b.x + b.width / 2, y: b.y + b.height / 2, floorId: b.floor_id });
      if (start.floorId && onFloorSwitch) onFloorSwitch(start.floorId);
    } else {
      // 편의시설 → 가장 가까운 해당 타입 시설 찾기
      if (!toFacilityType) return;
      const candidates = facilities.filter(f => f.type === toFacilityType);
      if (candidates.length === 0) return;
      let best: Facility | null = null;
      let bestDist = Infinity;
      for (const f of candidates) {
        const d = Math.hypot(start.x - f.x, start.y - f.y);
        if (d < bestDist) { bestDist = d; best = f; }
      }
      if (!best) return;
      onSetStart(start);
      onSetEnd({ facilityType: toFacilityType, x: best.x, y: best.y, floorId: best.floor_id });
      if (start.floorId && onFloorSwitch) onFloorSwitch(start.floorId);
    }
    setIsOpen(false);
  }

  function handleClear() {
    setFromBoothId('');
    setToBoothId('');
    setToFacilityType('');
    onSetStart(null);
    onSetEnd(null);
  }

  function getLabel(nav: NavPoint | null): string {
    if (!nav) return '—';
    if (nav.boothId) {
      const b = booths.find(bb => bb.id === nav.boothId);
      if (b) {
        const cn = b.company?.name;
        return cn ? (typeof cn === 'string' ? cn : (cn as any).ko || (cn as any).en || b.booth_number) : b.booth_number;
      }
    }
    if (nav.facilityType) return FACILITY_LABELS[nav.facilityType] || nav.facilityType;
    // 근처 부스 이름
    let bestDist = Infinity, bestName = '선택 지점';
    for (const b of booths) {
      const d = Math.hypot(nav.x - (b.x + b.width / 2), nav.y - (b.y + b.height / 2));
      if (d < bestDist) {
        bestDist = d;
        const cn = b.company?.name;
        bestName = cn ? (typeof cn === 'string' ? cn : (cn as any).ko || (cn as any).en || b.booth_number) : b.booth_number;
      }
    }
    return `${bestName} 근처`;
  }

  const hasRoute = navStart || navEnd;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
          ${isOpen || hasRoute
            ? 'bg-indigo-600 text-white dark:bg-indigo-500'
            : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 dark:bg-[#1e1e1e] dark:text-gray-300 dark:border-gray-500/40 dark:hover:bg-[#2a2a2a]'
          }`}
      >
        <Navigation className="h-3.5 w-3.5" />
        {t('route.title')}
      </button>

      {isOpen && (
        <>
          {/* 배경 오버레이 (모바일) */}
          <div className="fixed inset-0 bg-black/20 z-40 md:hidden" onClick={() => setIsOpen(false)} />

          {/* 팝업: 모바일=화면 중앙, 데스크탑=버튼 아래 */}
          <div className="
            fixed inset-0 flex items-center justify-center z-50 pointer-events-none
            md:absolute md:inset-auto md:top-full md:right-0 md:mt-1 md:flex md:items-start md:justify-end
          ">
            <div className="w-80 bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-500/40 rounded-xl shadow-xl p-4 pointer-events-auto">

              {/* 출발지 */}
              <div className="mb-3">
                <label className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase">출발</label>
                {navStart && !fromBoothId ? (
                  <div className="flex items-center gap-2 mt-1 px-2.5 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700/40">
                    <MapPin className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    <span className="text-xs text-green-700 dark:text-green-400 flex-1 truncate">{getLabel(navStart)}</span>
                    <button onClick={() => { onSetStart(null); setFromBoothId(''); }} className="text-green-400 hover:text-red-500 shrink-0"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 mt-1">
                    <select
                      value={fromBoothId}
                      onChange={(e) => setFromBoothId(e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded border border-gray-200 bg-white text-xs dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-200 outline-none"
                    >
                      <option value="">{navStart ? getLabel(navStart) : '부스 선택...'}</option>
                      {booths.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.booth_number} - {ln(b.company?.name) || t('search.unassigned')}
                        </option>
                      ))}
                    </select>
                    {navStart && (
                      <button onClick={() => { onSetStart(null); setFromBoothId(''); }} className="p-1 text-gray-400 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                )}
              </div>

              {/* 도착지 */}
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <label className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase">도착</label>
                  <div className="flex gap-1 ml-auto">
                    <button
                      onClick={() => setToType('booth')}
                      className={`px-2 py-0.5 text-[10px] rounded-full transition-colors ${toType === 'booth' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' : 'text-gray-400 hover:text-gray-600'}`}
                    >부스</button>
                    <button
                      onClick={() => setToType('facility')}
                      className={`px-2 py-0.5 text-[10px] rounded-full transition-colors ${toType === 'facility' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' : 'text-gray-400 hover:text-gray-600'}`}
                    >편의시설</button>
                  </div>
                </div>

                {navEnd && toType === 'booth' && !toBoothId ? (
                  <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40">
                    <MapPin className="h-3.5 w-3.5 text-red-500 shrink-0" />
                    <span className="text-xs text-red-700 dark:text-red-400 flex-1 truncate">{getLabel(navEnd)}</span>
                    <button onClick={() => { onSetEnd(null); setToBoothId(''); }} className="text-red-400 hover:text-red-600 shrink-0"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ) : toType === 'booth' ? (
                  <div className="flex items-center gap-1">
                    <select
                      value={toBoothId}
                      onChange={(e) => setToBoothId(e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded border border-gray-200 bg-white text-xs dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-200 outline-none"
                    >
                      <option value="">{navEnd ? getLabel(navEnd) : '부스 선택...'}</option>
                      {booths.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.booth_number} - {ln(b.company?.name) || t('search.unassigned')}
                        </option>
                      ))}
                    </select>
                    {navEnd && (
                      <button onClick={() => { onSetEnd(null); setToBoothId(''); }} className="p-1 text-gray-400 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                ) : (
                  <select
                    value={toFacilityType}
                    onChange={(e) => setToFacilityType(e.target.value)}
                    className="w-full px-2 py-1.5 rounded border border-gray-200 bg-white text-xs dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-200 outline-none"
                  >
                    <option value="">편의시설 선택...</option>
                    {availableFacilityTypes.map(ft => (
                      <option key={ft} value={ft}>{FACILITY_LABELS[ft] || ft}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* 버튼 */}
              <div className="flex gap-2">
                <button
                  onClick={handleFind}
                  disabled={(!navStart && !fromBoothId) || (toType === 'booth' ? (!navEnd && !toBoothId) : !toFacilityType)}
                  className="flex-1 px-3 py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 disabled:opacity-40 transition-colors"
                >
                  {t('route.find')}
                </button>
                <button
                  onClick={handleClear}
                  className="px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                >
                  {t('route.clear')}
                </button>
              </div>

            </div>
          </div>
        </>
      )}
    </div>
  );
}
