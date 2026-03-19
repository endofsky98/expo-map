import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type Locale = 'ko' | 'en';

const translations: Record<Locale, Record<string, string>> = {
  en: {
    'app.title': 'Expo Map',
    'nav.admin': 'Admin',
    'nav.dashboard': 'Dashboard',
    'nav.booths': 'Booths',
    'nav.companies': 'Companies',
    'nav.categories': 'Categories',
    'nav.images': 'Images',
    'nav.floors': 'Floors / Halls',
    'nav.facilities': 'Facilities',
    'nav.corridors': 'Corridors',
    'nav.viewMap': 'View Map',
    'nav.logout': 'Logout',
    'search.placeholder': 'Search booths or companies...',
    'search.noResults': 'No booths found',
    'search.unassigned': 'Unassigned',
    'map.loading': 'Loading map...',
    'map.error': 'Unable to load map data. Please check if the server is running.',
    'map.retry': 'Retry',
    'map.noData': 'No map data yet',
    'map.noDataDesc': 'Upload a map image and add booths in the admin panel.',
    'map.goAdmin': 'Go to Admin',
    'filter.all': 'All',
    'floor.select': 'Select Floor',
    'hall.select': 'Select Hall',
    'facility.restroom': 'Restroom',
    'facility.emergency_exit': 'Emergency Exit',
    'facility.stairs': 'Stairs',
    'facility.elevator': 'Elevator',
    'facility.escalator': 'Escalator',
    'facility.filter': 'Facility Filter',
    'facility.showAll': 'Show All',
    'route.title': 'Find Route',
    'route.from': 'From',
    'route.to': 'To',
    'route.find': 'Find Route',
    'route.clear': 'Clear',
    'route.notFound': 'No route found between the selected booths. The path may be blocked or disconnected.',
    'route.distance': 'Distance',
    'route.floorsUsed': 'Floors',
    'route.selectBooth': 'Select a booth...',
    'login.title': 'Admin Login',
    'login.username': 'Username',
    'login.password': 'Password',
    'login.submit': 'Sign In',
    'login.error': 'Invalid username or password',
    'admin.panel': 'Admin Panel',
    'admin.quickActions': 'Quick Actions',
    'admin.manageBooths': 'Manage Booths',
    'admin.uploadImage': 'Upload Map Image',
    'admin.viewMap': 'View Map',
    'admin.sampleData': 'Sample Data',
    'admin.sampleDesc': 'Load sample booths, companies, and categories for testing.',
    'admin.loadSample': 'Load Sample Data',
    'admin.loading': 'Loading...',
    'admin.addBooth': 'Add Booth',
    'admin.addCompany': 'Add Company',
    'admin.addCategory': 'Add Category',
    'admin.addFloor': 'Add Floor',
    'admin.addHall': 'Add Hall',
    'admin.addFacility': 'Add Facility',
    'admin.uploadCSV': 'Upload CSV',
    'admin.csvTemplate': 'CSV Template',
    'admin.sampleConfirm': 'This will load sample data. Continue?',
    'admin.sampleFailed': 'Failed to load sample data. Is the backend running?',
    'admin.noData': 'No data yet',
    'admin.actions': 'Actions',
    'admin.edit': 'Edit',
    'admin.delete': 'Delete',
    'admin.save': 'Save',
    'admin.cancel': 'Cancel',
    'admin.name': 'Name',
    'admin.color': 'Color',
    'admin.category': 'Category',
    'admin.company': 'Company',
    'admin.boothNumber': 'Booth Number',
    'admin.position': 'Position',
    'admin.size': 'Size',
    'admin.active': 'Active',
    'admin.floor': 'Floor',
    'admin.hall': 'Hall',
    'admin.order': 'Order',
    'admin.type': 'Type',
    'admin.subtype': 'Subtype',
    'admin.upload.title': 'Map Images',
    'admin.upload.drop': 'Drop an image here or click to upload',
    'admin.upload.formats': 'PNG, JPG, or WebP recommended',
    'admin.upload.allImages': 'All Images',
    'admin.upload.setCurrent': 'Set as Current',
    'admin.upload.current': 'Current',
  },
  ko: {
    'app.title': '엑스포 맵',
    'nav.admin': '관리자',
    'nav.dashboard': '대시보드',
    'nav.booths': '부스',
    'nav.companies': '업체',
    'nav.categories': '카테고리',
    'nav.images': '이미지',
    'nav.floors': '층 / 홀',
    'nav.facilities': '편의시설',
    'nav.corridors': '통로 네트워크',
    'nav.viewMap': '지도 보기',
    'nav.logout': '로그아웃',
    'search.placeholder': '부스 또는 업체 검색...',
    'search.noResults': '검색 결과가 없습니다',
    'search.unassigned': '미배정',
    'map.loading': '지도 로딩 중...',
    'map.error': '지도 데이터를 불러올 수 없습니다. 서버가 실행 중인지 확인해주세요.',
    'map.retry': '재시도',
    'map.noData': '아직 지도 데이터가 없습니다',
    'map.noDataDesc': '관리자 패널에서 지도 이미지를 업로드하고 부스를 추가하세요.',
    'map.goAdmin': '관리자로 이동',
    'filter.all': '전체',
    'floor.select': '층 선택',
    'hall.select': '홀 선택',
    'facility.restroom': '화장실',
    'facility.emergency_exit': '비상구',
    'facility.stairs': '계단',
    'facility.elevator': '엘리베이터',
    'facility.escalator': '에스컬레이터',
    'facility.filter': '편의시설 필터',
    'facility.showAll': '전체 표시',
    'route.title': '길찾기',
    'route.from': '출발',
    'route.to': '도착',
    'route.find': '경로 찾기',
    'route.clear': '초기화',
    'route.notFound': '선택한 부스 사이의 경로를 찾을 수 없습니다. 통로가 차단되었거나 연결되지 않았을 수 있습니다.',
    'route.distance': '거리',
    'route.floorsUsed': '경유 층',
    'route.selectBooth': '부스를 선택하세요...',
    'login.title': '관리자 로그인',
    'login.username': '아이디',
    'login.password': '비밀번호',
    'login.submit': '로그인',
    'login.error': '아이디 또는 비밀번호가 올바르지 않습니다',
    'admin.panel': '관리자 패널',
    'admin.quickActions': '빠른 작업',
    'admin.manageBooths': '부스 관리',
    'admin.uploadImage': '맵 이미지 업로드',
    'admin.viewMap': '지도 보기',
    'admin.sampleData': '샘플 데이터',
    'admin.sampleDesc': '테스트용 샘플 부스, 업체, 카테고리를 로드합니다.',
    'admin.loadSample': '샘플 데이터 로드',
    'admin.loading': '로딩 중...',
    'admin.addBooth': '부스 추가',
    'admin.addCompany': '업체 추가',
    'admin.addCategory': '카테고리 추가',
    'admin.addFloor': '층 추가',
    'admin.addHall': '홀 추가',
    'admin.addFacility': '편의시설 추가',
    'admin.uploadCSV': 'CSV 업로드',
    'admin.csvTemplate': 'CSV 템플릿',
    'admin.sampleConfirm': '샘플 데이터를 로드합니다. 계속하시겠습니까?',
    'admin.sampleFailed': '샘플 데이터 로드 실패. 백엔드 서버가 실행 중인가요?',
    'admin.noData': '데이터가 없습니다',
    'admin.actions': '작업',
    'admin.edit': '수정',
    'admin.delete': '삭제',
    'admin.save': '저장',
    'admin.cancel': '취소',
    'admin.name': '이름',
    'admin.color': '색상',
    'admin.category': '카테고리',
    'admin.company': '업체',
    'admin.boothNumber': '부스 번호',
    'admin.position': '위치',
    'admin.size': '크기',
    'admin.active': '활성',
    'admin.floor': '층',
    'admin.hall': '홀',
    'admin.order': '순서',
    'admin.type': '유형',
    'admin.subtype': '세부 유형',
    'admin.upload.title': '맵 이미지',
    'admin.upload.drop': '이미지를 드래그하거나 클릭하여 업로드',
    'admin.upload.formats': 'PNG, JPG 또는 WebP 권장',
    'admin.upload.allImages': '모든 이미지',
    'admin.upload.setCurrent': '현재 이미지로 설정',
    'admin.upload.current': '현재',
  },
};

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  ln: (name: string | Record<string, string> | null | undefined) => string;
}

const I18nContext = createContext<I18nContextType>({
  locale: 'en',
  setLocale: () => {},
  t: (key) => key,
  ln: () => '',
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('expo-map-locale');
      if (saved === 'ko' || saved === 'en') return saved;
    }
    return 'en';
  });

  const handleSetLocale = useCallback((newLocale: Locale) => {
    setLocale(newLocale);
    if (typeof window !== 'undefined') {
      localStorage.setItem('expo-map-locale', newLocale);
    }
  }, []);

  const t = useCallback(
    (key: string): string => {
      return translations[locale]?.[key] || translations['en']?.[key] || key;
    },
    [locale]
  );

  const ln = useCallback(
    (name: string | Record<string, string> | null | undefined): string => {
      if (!name) return '';
      if (typeof name === 'string') return name;
      return name[locale] || name['en'] || name['ko'] || Object.values(name)[0] || '';
    },
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale: handleSetLocale, t, ln }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
