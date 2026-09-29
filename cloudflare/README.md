# Cloudflare 비밀번호 연결

지금은 사용할 필요가 없습니다. 나중에 서버에서 Gemini API 키를 숨길 때 이 코드를 별도로 배포하세요. 프런트엔드는 GitHub Pages에 그대로 둡니다.

## 설정

1. Cloudflare 계정을 준비하고 Node.js가 설치된 컴퓨터에서 이 `cloudflare` 폴더를 엽니다.
2. `wrangler.jsonc`의 `ALLOWED_ORIGINS`를 본인 GitHub Pages **origin**으로 바꿉니다. 예: `https://petrick0255-create.github.io` (저장소 경로, 마지막 `/` 제외). 여러 주소는 쉼표로 구분합니다.
3. `namespace_id`는 계정에서 다른 Rate Limiter와 겹치지 않는 양의 정수 문자열로 선택합니다.
4. 아래 명령을 순서대로 실행합니다. Secret 입력창에 실제 값을 입력합니다. 코드나 wrangler.jsonc에 비밀을 적지 마세요.

```bash
npx wrangler login
npx wrangler deploy
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put APP_PASSWORD
```

첫 deploy 직후에는 Secret이 없으므로 요청이 차단됩니다. Secret 둘을 등록하면 사용할 수 있습니다. APP_PASSWORD에는 길고 무작위적인 비밀번호를 사용하세요.

5. 웹앱의 **연결 설정 → Cloudflare · 비밀번호**를 선택합니다.
6. Worker 주소 `https://jnb-line-cinema-api.계정.workers.dev`와 비밀번호를 입력합니다. `/api/generate`는 앱이 붙입니다.
7. 그림을 생성하여 연결을 확인합니다. 이후 브라우저의 저장된 Gemini 키는 삭제해도 됩니다.

## 이 코드가 보호하는 범위

- 허용한 origin의 요청만 CORS 허용. 실제 인증은 서버에서 비밀번호를 확인합니다.
- 비밀번호 확인 전 IP별 시도 제한, 확인 후 공유 계정 생성 요청 제한. 기본은 각 60초에 12회입니다. Rate Limiter binding이 없으면 요청을 차단합니다.
- 비밀번호는 브라우저 메모리에만 있고, 새로고침하면 다시 입력합니다. HTTPS 요청의 Authorization 헤더로 전달합니다.
- Worker는 지정한 이미지 모델·단일 이미지 입력·1K 출력만 전달합니다. 임의 URL 요청이나 도구 호출을 허용하지 않습니다.
- 본문 최대 20MiB. 자동 재시도 없음. 본문·키·비밀번호를 로그에 출력하지 않습니다.
- Cloudflare의 위치별 Rate Limiter는 엄밀한 전 세계 총량/비용 제한이 아닙니다. 결제 한도는 Gemini 프로젝트에서 관리하세요.
- 이 방식은 **Gemini 호출 권한**을 보호합니다. GitHub Pages의 HTML·JS 파일 자체는 공개되어 있습니다. 사이트 전체 접근을 제한하려면 별도의 호스팅/Cloudflare Access 구성이 필요합니다.

`wrangler deploy`는 직접 실행하는 별도 배포 단계입니다. 제공된 ZIP만으로 Worker가 자동 배포되지는 않습니다.
