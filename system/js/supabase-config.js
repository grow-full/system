// 아이디로 로그인해서 게임 진행을 여러 기기에서 이어 하기 위한 Supabase 설정.
// 값은 Supabase 대시보드 → Connect 버튼 (또는 Project Settings → Data API / API Keys)에 있습니다.
// anonKey에는 공개용 키(sb_publishable_… 또는 anon 키)만 넣으세요. 공개돼도 괜찮은 키이고,
// saves 테이블의 RLS 정책이 각자 자기 데이터만 보게 막아 줍니다.
// ⚠️ service_role / sb_secret_ 키는 절대 넣으면 안 됩니다.
//
// null로 바꾸면 로그인 버튼이 꺼지고, 진행은 이 기기에만 저장됩니다.
const SUPABASE_CONFIG = {
  url: 'https://amkckpwlzdzenckxewbv.supabase.co',
  anonKey: 'sb_publishable_JcexF754SnLl4qFcg0rF1g_gbm35jcg',
};
