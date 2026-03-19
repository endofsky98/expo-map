# expo-map — 전시장 인터랙티브 맵 시스템

전시장 부스 1,000개 이상을 지도처럼 표시하고, 줌/팬·업체 검색·카테고리 필터·부스 클릭 콜백을 제공하는 독립형 전시장 맵 모듈.

## Tech Stack

- **Frontend**: Next.js 14, TypeScript, react-konva, TailwindCSS
- **Backend**: FastAPI, SQLAlchemy, SQLite
- **Image Processing**: Pillow

## Ports

- Frontend: 3009
- Backend: 8008

## Quick Start

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8008 --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev -- -p 3009
```
