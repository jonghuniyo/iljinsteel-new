# Steelmax 자료실 연동 안내

이 배포본에는 Steelmax 자료를 개인 포털에서 검색·열람·저장할 수 있는 `Steelmax 자료실` 버튼이 추가되어 있습니다.

## 기본 방식

- 포털 화면 왼쪽 아래의 `Steelmax 자료실` 버튼을 누릅니다.
- 키워드 예: `강관`, `SMLS`, `API 5L`, `A106`, `ASTM`, `STS`.
- 글을 열고 `내 자료함 저장`을 누르면 브라우저 `localStorage`에 개인용으로 저장됩니다.
- 원문 출처 링크는 각 글에 함께 표시됩니다.

## Vercel API

새 API 경로는 다음 하나입니다.

```txt
/api/steelmax?action=search&q=강관
/api/steelmax?action=post&id=12345
/api/steelmax?action=categories
```

## 전체 스냅샷을 만들고 싶을 때

권한을 받은 상태에서 전체 게시글을 JSON으로 백업하려면 로컬 PC에서 아래 명령을 실행합니다.

```bash
npm run import:steelmax
```

그러면 `data/steelmax-posts.json` 파일이 생성됩니다. 대량 수집은 원본 서버에 부담을 줄 수 있으므로 필요할 때만 실행하고, 반복 실행은 피하세요.
