/* ─────────────────────────────────────────────────────────
   학생 응답 서버(Firebase) 설정
   Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹) → firebaseConfig 값을
   아래 빈칸에 붙여넣으면 모든 컴퓨터·학생 휴대폰에서 자동으로 연결됩니다.
   여기에 값을 넣어 배포하면 앱의 [설정 → 학생 응답 서버] 메뉴는 숨겨집니다.
   (비워 두면 그 메뉴에서 각자 붙여넣어 쓸 수 있습니다.)
   ───────────────────────────────────────────────────────── */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCpN0tKHcPZDltghHws2emUJql2aCLvKSM",
  authDomain: "ezclass-for-k.firebaseapp.com",
  projectId: "ezclass-for-k",
  storageBucket: "ezclass-for-k.firebasestorage.app",
  messagingSenderId: "690514124592",
  appId: "1:690514124592:web:a946f8d1d9bc7b3d68b2f5"
};

/* 보안 규칙(firestore.rules)에 넣은 선생님 이메일 — 앱의 [보안 규칙 복사]에도 이 목록이 들어갑니다 */
window.TEACHER_EMAILS = [
  'pol082753@gmail.com',
  'pol0827@goedu.kr'
];

/* 교사 로그인 때 먼저 골라 줄 계정 (로그인 창에 이 계정이 바로 뜹니다) */
window.LOGIN_EMAIL = 'pol0827@goedu.kr';
