# ILJIN Portal Vercel 재배포 안내

이 프로젝트는 Vercel에서 `dist` 폴더를 정적 출력물로 배포하고, `api/*.mjs` 파일을 Vercel API Routes로 사용합니다.

## 1. 오피넷 API Key 연결

오피넷에서 받은 무료 API Key는 코드에 직접 넣지 말고 Vercel 환경변수로 등록합니다.

1. Vercel 접속
2. `iljin-portal` 프로젝트 선택
3. `Settings` 클릭
4. `Environment Variables` 클릭
5. 아래 값 추가

| Name | Value | Environment |
| --- | --- | --- |
| `OPINET_API_KEY` | `<오피넷 무료 API Key>` | Production, Preview, Development |

6. `Save` 클릭

환경변수를 새로 추가하거나 수정한 뒤에는 반드시 재배포해야 새 값이 반영됩니다.

## 2. GitHub에 수정본 업로드

수정본 폴더:

```text
C:\Users\IJMAIL\Desktop\iljin-portal-VERCEL-STEELMAX-20260601-work
```

이 폴더의 파일 전체를 GitHub 저장소에 업로드합니다.

중요:

- `assets/`
- `api/`
- `netlify/functions/`
- `dist/`
- `package.json`
- `vercel.json`

위 폴더와 파일이 함께 올라가야 합니다.

## 3. Vercel 재배포

GitHub에 push하면 Vercel이 자동 배포됩니다.

자동 배포가 바로 안 되면:

1. Vercel 프로젝트 접속
2. `Deployments` 클릭
3. 가장 최근 배포 오른쪽 메뉴 클릭
4. `Redeploy` 클릭
5. `Use existing Build Cache`는 꺼도 됩니다.
6. `Redeploy` 실행

## 4. 배포 후 확인

배포가 끝나면 홈페이지에서 아래 항목을 확인합니다.

- 유가 시세에 `WTI 원유`, `브렌트 원유`, `국내 휘발유 평균`, `국내 경유 평균`이 표시되는지 확인
- `국내 휘발유/경유 평균가격 표시에는 Vercel 환경변수...` 안내 문구가 사라졌는지 확인
- 상단의 `철강·강관 검색` 버튼이 열리는지 확인

## 5. 문제 해결

국내 휘발유/경유가 계속 안 나오면 아래를 확인합니다.

- Vercel 환경변수 이름이 정확히 `OPINET_API_KEY`인지 확인
- 환경변수 등록 후 새로 재배포했는지 확인
- 오피넷 무료 API 호출 가능 건수가 남아 있는지 확인
- Vercel 배포 로그에서 `/api/metals` 관련 오류가 있는지 확인

