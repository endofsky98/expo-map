#!/bin/bash
# deploy.sh — expo-map EC2 배포 스크립트
# 사용: ./deploy.sh
# 전제: ~/.ssh/ec2_deploy 키 존재, EC2에 PM2 설치됨

set -e

EC2_IP="3.36.108.114"
EC2_PORT="31222"
EC2_USER="Administrator"
EC2_KEY="$HOME/.ssh/ec2_deploy"
EC2_PROJECT="C:/Users/Administrator/Documents/aiproject/expo-map"
FRONTEND_NAME="expo-map-frontend"
BACKEND_NAME="expo-map-backend"

echo "=== [1/5] Git pull ==="
cd "$(dirname "$0")"
git pull origin main

echo "=== [2/5] 백엔드 의존성 설치 ==="
cd backend
pip install -r requirements.txt
cd ..

echo "=== [3/5] 프론트엔드 빌드 ==="
cd frontend
npm install
npm run build  # package.json build에 static 복사 포함

echo "=== [4/5] EC2 배포 ==="
cd .next/standalone
tar czf /tmp/expo-standalone.tar.gz .
echo "tar 크기: $(du -sh /tmp/expo-standalone.tar.gz | cut -f1)"

cd "$(dirname "$0")"

# 서비스 중지 + 기존 standalone 삭제
ssh -i "$EC2_KEY" -p "$EC2_PORT" "$EC2_USER@$EC2_IP" \
  "set PM2_HOME=C:\\Users\\Administrator\\.pm2 && (pm2 stop $FRONTEND_NAME || echo skip) && (pm2 stop $BACKEND_NAME || echo skip) && (if exist \"$EC2_PROJECT\\frontend\\standalone\" rmdir /s /q \"$EC2_PROJECT\\frontend\\standalone\") && mkdir \"$EC2_PROJECT\\frontend\\standalone\""

# 파일 업로드
scp -i "$EC2_KEY" -P "$EC2_PORT" /tmp/expo-standalone.tar.gz "$EC2_USER@$EC2_IP:C:/Users/Administrator/Documents/aiproject/expo-map/expo-standalone.tar.gz"

# 압축 해제 + 서비스 재시작
ssh -i "$EC2_KEY" -p "$EC2_PORT" "$EC2_USER@$EC2_IP" \
  "cd \"$EC2_PROJECT\\frontend\\standalone\" && tar xzf ..\\..\\expo-standalone.tar.gz && del ..\\..\\expo-standalone.tar.gz && cd \"$EC2_PROJECT\\backend\" && pip install -r requirements.txt && set PM2_HOME=C:\\Users\\Administrator\\.pm2 && pm2 restart $BACKEND_NAME && pm2 restart $FRONTEND_NAME && pm2 save"

echo "=== [5/5] 헬스체크 ==="
sleep 3
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://$EC2_IP:3009")
if [ "$STATUS" = "200" ] || [ "$STATUS" = "307" ]; then
  echo "배포 성공 (HTTP $STATUS)"
else
  echo "헬스체크 실패 (HTTP $STATUS)"
  exit 1
fi
