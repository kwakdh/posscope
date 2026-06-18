-- policies.item_id, feature_tabs.item_id를 uuid → text로 변경
-- 이유: home 탭 같은 가상 항목(home_pos-app 등)을 슬러그 문자열로 저장해야 하므로
-- 기존 UUID 값은 text 캐스팅 시 동일한 문자열로 보존됨 (데이터 손실 없음)

ALTER TABLE policies ALTER COLUMN item_id TYPE text;
ALTER TABLE feature_tabs ALTER COLUMN item_id TYPE text;
