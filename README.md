# LXP 툴킷 사이트 + 관리자 대시보드

기존 Artifact 쇼케이스를 **실제 웹사이트(Cloudflare Pages)** 로 옮긴 것.
방문·다운로드 수치를 모아 `/admin` 에서 비밀번호로 확인한다.

```
index.html            쇼케이스 (기존 디자인 그대로 + 하단에 집계 스크립트)
admin.html            /admin 관리자 대시보드 (비밀번호 게이트)
functions/api/hit.js  POST /api/hit   방문·클릭 기록 → KV
functions/api/stats.js POST /api/stats 비번 검증 후 집계 + GitHub Releases 실다운로드 수
_headers              /admin, /api 색인 차단
```

## 집계 방식

| 지표 | 출처 | 정확도 |
|---|---|---|
| 누적 페이지뷰 / 일자별 | 사이트 로드·해시 이동마다 `/api/hit` → KV `stats` 키 | 근사치 (KV 원자적 증가 없음, 동시 접속 겹치면 드물게 누락) |
| 도구별 "사이트 클릭" | 받기 버튼 클릭마다 `/api/hit` | 근사치 |
| 도구별 "실제 다운로드" | GitHub Releases API `download_count` | 정확. GitHub가 직접 집계 |

봇 User-Agent 는 서버에서 걸러낸다. 날짜는 UTC 자정 기준, 최근 180일만 KV에 유지.

---

## 배포 (한 번만)

### 1. 이 폴더를 GitHub 저장소에 올린다 — 기존 `kjh01140/lxp-toolkit` 재사용

```bash
cd C:/Users/kjh01/lxp-toolkit-site
git init
git add .
git commit -m "LXP toolkit site + admin dashboard"
git branch -M main
git remote add origin https://github.com/kjh01140/lxp-toolkit.git
git pull origin main --allow-unrelated-histories   # 기존 README 와 병합
git push -u origin main
```

> Releases(zip 2개)는 그대로 유지된다 — 브랜치 내용과 무관.

### 2. Cloudflare Pages 프로젝트 생성

1. dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. `kjh01140/lxp-toolkit` 선택
3. 빌드 설정:
   - Framework preset: **None**
   - Build command: **(비움)**
   - Build output directory: **`/`**
4. **Save and Deploy** → `https://lxp-toolkit.pages.dev` 같은 주소가 나온다

### 3. KV 네임스페이스 만들고 바인딩

1. **Workers & Pages** → **KV** → **Create a namespace** → 이름 `lxp-stats`
2. Pages 프로젝트 → **Settings** → **Bindings** (또는 Functions → KV namespace bindings)
   - Variable name: **`STATS`**  ←  이 이름 정확히
   - KV namespace: `lxp-stats`
   - **Production 과 Preview 둘 다** 추가

### 4. 환경변수

Pages 프로젝트 → **Settings** → **Environment variables** → Production:

| 이름 | 값 | 필수 |
|---|---|---|
| `ADMIN_PW` | 원하는 관리자 비밀번호 | ✅ (Secret 로 저장 권장) |
| `GH_REPO` | `kjh01140/lxp-toolkit` | 선택 (기본값 동일) |
| `SITE_ORIGIN` | 배포된 주소 (예 `https://lxp-toolkit.pages.dev`) | 선택 (스팸 완화) |

저장 후 **Deployments → 최신 배포 → Retry deployment** (환경변수는 재배포해야 적용).

### 5. 확인

- `https<주소>/` 몇 번 새로고침
- `https<주소>/admin` → 비밀번호 입력 → 숫자 뜨는지 확인
- 받기 버튼 눌러보고 관리자에서 "사이트 클릭" +1 되는지 확인

### 6. (선택) 친구들에게 줄 링크 교체

새 주소가 안정되면 기존 Artifact 대신 이 주소를 배포 링크로 쓰면 된다.
커스텀 도메인을 붙이려면 Pages → Custom domains.

---

## 수정할 때

`index.html` / `admin.html` / `functions/` 고치고 `git push` 하면 Cloudflare가 자동 재배포.

## 비용

Cloudflare Pages·Functions·KV 모두 무료 티어로 충분:
- Functions 무료 100,000 req/day
- KV 무료 100,000 read/day · 1,000 write/day (방문 1건 = write 1건)
