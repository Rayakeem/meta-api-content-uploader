# meta-api-content-uploader

# Meta SNS 콘텐츠 업로드 api (Facebook page / Instagram / Threads)

이 프로젝트는 Meta API(Facebook Graph API, Instagram Graph API, Threads API)를 이용하여 Facebook page, Instagram, Threads에 콘텐츠를 업로드할 수 있도록 구성된 Node.js 기반 api 입니다.
운영하고 있는 TokNow - sns 콘텐츠 생성 및 다송출 서비스에서 sns 다송출 코드를 샘플로 분리하여 기록한 샘플 코드 입니다.
각 SNS 플랫폼의 인증 및 게시물 업로드 흐름을 코드로 구현했으며, 플랫폼별로 각각 로그인 및 게시 기능이 분리되어 있습니다.
아래 각각 플랫폼마다의 실행 로직을 따라 구현하면 됩니다.
샘플코드이므로 ui는 따로 제공되지 않습니다.

# 사용 기술
1. node.js
2. mongoDB

# 실행 방법
1. .env 파일에 각 플랫폼의 앱 정보 및 토큰 설정을 추가해야 합니다.
2. 각 파일의 redirect url을 작성하세요.
3. 아래 플랫폼 실행 절차에 따라 진행하시면 됩니다.

## 플랫폼별 사용법
✅ Facebook
- facebook은 page에 콘텐츠가 올라가기 떄문에 page의 정보를 가져와야합니다.
톡나우에서는 로그인 -> 페이지 조회 -> 페이지 저장 (유저 데이터를 디비에 저장)하는 방식을 사용했습니다.
- ui의 플로우상 로그인을 한 후에 바로 페이지 조회 및 저장을 하기 위해서 페이스북 토큰과 웹 JWT 유저의 정보를 담아 프론트에게 전달해야했는데 Url에 노출시킬 수 없어서 세션을 만들어 저장한 후 해당 세션을 쿼리로 전달하였습니다.
엑세스토큰을 세션에 담아 데이터베이스에 저장한 후 TTL 사용하여 시간내에 삭제되도록 구현했습니다.

로그인:
	•	endpoint: /api/auth/facebook/login
	•	url/callback으로 리디렉션되며 사용자 액세스 토큰을 수신

페이지 조회 및 저장:
  •	endpoint: /api/auth/facebook/pages 
  페이스북 페이지를 조회합니다.

  •	endpoint: /api/auth/facebook/select-page
  페이스북 페이지를 데이터베이스에 저장합니다.

콘텐츠 업로드:
	•	endpoint: /api/upload/facebook/upload
	•	multipart/form-data 형식으로 message, file 전송
	•	연결된 Facebook 페이지에 게시물 업로드

✅ Instagram
Instagram의 플로우는 로그인 -> short Token 발급 -> long live Token으로 교체 -> 정보요청 -> 데이터 저장 -> 프론트로 리디렉션 입니다.

로그인:
  •	endpoint: /api/auth/instagram/login
	•	url/callback으로 리디렉션되며 사용자 액세스 토큰을 수신

콘텐츠 업로드:
	•	엔드포인트: /api/upload/instagram/upload
	•	비즈니스 혹은 프로페셔널 Instagram 계정 필요
	•	message, file을 포함한 multipart/form-data 요청 처리
  •	업로드 흐름
	•	엔드포인트: /api/upload/instagram/upload 미디어 컨테이너 생성 및 게시물 발행
	•	/media, /media_publish Graph API 엔드포인트 사용

✅ Threads
threads 로그인의 플로우는 로그인 -> short Token 발급 -> long live Token으로 교체 -> 정보요청 -> 데이터 저장 -> 프론트로 리디렉션 입니다.

콘텐츠 업로드는 단일 게시물과 캐러셀 게시물 업로드로 나누어져있습니다.

로그인:
	•	엔드포인트: /api/auth/threads/login
	•	url/callback으로 리디렉션되며 사용자 액세스 토큰을 수신

콘텐츠 업로드:
	•	엔드포인트: /api/upload/threads/upload
	•	엔드포인트: /api/upload/threads/upload/carousel