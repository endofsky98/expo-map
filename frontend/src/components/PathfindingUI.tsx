import { useState, useEffect, useMemo } from 'react';
import { Navigation, X, MapPin, Building2, Landmark } from 'lucide-react';
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

  // 외부에서 팝업 열기 지원
  useEffect(() => {
    (window as any).__openPathfindingUI = () => setIsOpen(true);
    return () => { delete (window as any).__openPathfindingUI; };
  }, []);

  /* ─── 드롭다운 state ─── */
  const [fromType, setFromType] = useState<'booth'>('booth');
  const [toType, setToType] = useState<'booth' | 'facility'>('booth');
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

  /* ─── 출발 즉시 등록 ─── */
  function handleFromChange(val: string) {
    setFromBoothId(val);
    if (!val) return;
    const b = booths.find(bb => bb.id === Number(val));
    if (b) onSetStart({ boothId: b.id, x: b.x + b.width / 2, y: b.y + b.height / 2, floorId: b.floor_id });
  }

  /* ─── 도착 즉시 등록 (부스) ─── */
  function handleToBoothChange(val: string) {
    setToBoothId(val);
    if (!val) return;
    const b = booths.find(bb => bb.id === Number(val));
    if (b) onSetEnd({ boothId: b.id, x: b.x + b.width / 2, y: b.y + b.height / 2, floorId: b.floor_id });
  }

  /* ─── 도착 즉시 등록 (편의시설) ─── */
  function handleToFacilityChange(val: string) {
    setToFacilityType(val);
    if (!val) return;
    const ref = navStart ?? { x: 3000, y: 4000 };
    const candidates = facilities.filter(f => f.type === val);
    if (candidates.length === 0) return;
    let best: Facility | null = null;
    let bestDist = Infinity;
    for (const f of candidates) {
      const d = Math.hypot(ref.x - f.x, ref.y - f.y);
      if (d < bestDist) { bestDist = d; best = f; }
    }
    if (best) onSetEnd({ facilityType: val, x: best.x, y: best.y, floorId: best.floor_id });
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

  /* 탭 버튼 공통 스타일 */
  const tabCls = (active: boolean) =>
    `flex-1 flex items-center justify-center gap-2 py-3 text-base font-semibold rounded-xl transition-colors ${
      active
        ? 'bg-indigo-600 text-white shadow-md'
        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-[#2a2a2a]'
    }`;

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
          <div className="fixed inset-0 bg-black/30 z-40 md:hidden" onClick={() => setIsOpen(false)} />

          {/* 팝업 */}
          <div className="
            fixed inset-0 flex items-center justify-center z-50 pointer-events-none
            md:absolute md:inset-auto md:top-full md:right-0 md:mt-1 md:flex md:items-start md:justify-end
          ">
            <div className="w-[340px] bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-500/40 rounded-2xl shadow-2xl pointer-events-auto overflow-hidden">

              {/* 헤더 */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700/50">
                <div className="flex items-center gap-2">
                  <Navigation className="h-4 w-4 text-indigo-500" />
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">길찾기</span>
                </div>
                <button onClick={() => setIsOpen(false)} className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  <X className="h-4 w-4 text-gray-400" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                {/* 출발지 */}
                <div>
                  <label className="text-xs font-semibold text-green-600 dark:text-green-400 mb-1.5 block">📍 출발</label>
                  {navStart && !fromBoothId ? (
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700/40">
                      <MapPin className="h-4 w-4 text-green-500 shrink-0" />
                      <span className="text-sm text-green-700 dark:text-green-400 flex-1 truncate">{getLabel(navStart)}</span>
                      <button onClick={() => { onSetStart(null); setFromBoothId(''); }} className="text-green-400 hover:text-red-500 shrink-0"><X className="h-4 w-4" /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <select
                        value={fromBoothId}
                        onChange={(e) => handleFromChange(e.target.value)}
                        className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm dark:border-gray-600 dark:bg-[#252525] dark:text-gray-200 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors"
                      >
                        <option value="">{navStart ? getLabel(navStart) : '부스 선택...'}</option>
                        {booths.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.booth_number} - {ln(b.company?.name) || t('search.unassigned')}
                          </option>
                        ))}
                      </select>
                      {navStart && (
                        <button onClick={() => { onSetStart(null); setFromBoothId(''); }} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"><X className="h-4 w-4" /></button>
                      )}
                    </div>
                  )}
                </div>

                {/* 도착지 */}
                <div>
                  <label className="text-xs font-semibold text-red-500 dark:text-red-400 mb-1.5 block">🏁 도착</label>
                  {/* 부스 / 편의시설 탭 */}
                  <div className="flex gap-1.5 mb-3 p-1.5 bg-gray-100 dark:bg-[#252525] rounded-xl">
                    <button onClick={() => setToType('booth')} className={tabCls(toType === 'booth')}>
                      <Building2 className="h-5 w-5" />
                      부스
                    </button>
                    <button onClick={() => setToType('facility')} className={tabCls(toType === 'facility')}>
                      <Landmark className="h-5 w-5" />
                      편의시설
                    </button>
                  </div>

                  {navEnd && toType === 'booth' && !toBoothId ? (
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40">
                      <MapPin className="h-4 w-4 text-red-500 shrink-0" />
                      <span className="text-sm text-red-700 dark:text-red-400 flex-1 truncate">{getLabel(navEnd)}</span>
                      <button onClick={() => { onSetEnd(null); setToBoothId(''); }} className="text-red-400 hover:text-red-600 shrink-0"><X className="h-4 w-4" /></button>
                    </div>
                  ) : toType === 'booth' ? (
                    <div className="flex items-center gap-1.5">
                      <select
                        value={toBoothId}
                        onChange={(e) => handleToBoothChange(e.target.value)}
                        className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm dark:border-gray-600 dark:bg-[#252525] dark:text-gray-200 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors"
                      >
                        <option value="">{navEnd ? getLabel(navEnd) : '부스 선택...'}</option>
                        {booths.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.booth_number} - {ln(b.company?.name) || t('search.unassigned')}
                          </option>
                        ))}
                      </select>
                      {navEnd && (
                        <button onClick={() => { onSetEnd(null); setToBoothId(''); }} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"><X className="h-4 w-4" /></button>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5">
                      {availableFacilityTypes.map(ft => (
                        <button
                          key={ft}
                          onClick={() => handleToFacilityChange(ft)}
                          className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors border ${
                            toFacilityType === ft
                              ? 'bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-600 dark:text-indigo-300'
                              : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 dark:bg-[#252525] dark:border-gray-600 dark:text-gray-300 dark:hover:bg-[#2a2a2a]'
                          }`}
                        >
                          {FACILITY_LABELS[ft] || ft}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 롱프레스 안내 */}
                <div className="flex items-start gap-1.5 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <span className="text-gray-400 text-xs shrink-0 mt-0.5">💡</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    지도에서 원하는 위치를 <b>길게 터치</b>하면 바로 출발/도착을 지정할 수 있어요
                  </p>
                </div>

                {/* 하단 버튼 */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setIsOpen(false)}
                    className="flex-1 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 transition-colors shadow-sm"
                  >
                    닫기
                  </button>
                  <button
                    onClick={handleClear}
                    className="px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-red-500 border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    초기화
                  </button>
                </div>
              </div>

            </div>
          </div>
        </>
      )}
    </div>
  );
}
