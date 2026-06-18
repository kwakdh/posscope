---
name: project-pos-apk-analysis
description: "KCP POS 앱 APK 분석 결과 (v2.17.4 빌드491) — 기술스택, 연동단말기 스펙, 기능 목록, 배달 플랫폼"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9b6a4360-d2a3-473d-a41e-1c6eead3a2f1
---

APK: devEtc-2.17.4-491.apk (dev 환경용 플레이버). [[project_kcp_pos]] [[project_pos_app_structure]] 참조.

**Why:** APK 내 JSON·에셋파일 분석 기반. 소스코드(libapp.so)는 네이티브 컴파일이라 읽기 불가, 아래 내용은 JSON/에셋명 기반으로 파악한 것.

---

## 기술 스택
- **Flutter** (Dart + Native Android)
- POS Plus / POS Pro **두 variant** 동시 지원 (아이콘·로고·스플래시 각각 존재)
- 로컬 DB: SQLite (`libsqlite3.so`)
- 데이터 저장: DataStore (`libdatastore_shared_counter.so`)
- 바코드 스캔: Google MLKit barhopper v3 (`libbarhopper_v3.so`)
- 시리얼 포트 통신: `libserialport.so` (프린터 등)
- KCP 결제 처리: `libkcp_pos_data_processor.so`
- JY NDK: `libjyndklib.so` (QUAD-CORE A40i 단말기 전용)

---

## 연동 단말기 스펙

### CAT (통합 단말기) — 응답 타임아웃 121초
| 모델 | 카메라 | NFC | 카드리더 | 사인패드 | 영수증 | 현금서랍 | 자동절단 | 듀얼리더 | ApplePay |
|------|--------|-----|----------|----------|--------|----------|----------|----------|----------|
| KCP-C2100 | O | O | O | O | 3인치 | O | O | O | O |
| KCP-C3100 | X | O | O | O | 3인치 | O | O | X | X |
| KCP-X990 | O | O | O | O | X | X | X | X | O |
| KCPSCS4200 | O | O | O | O | 3인치 | O | O | O | O |

### 외부 리더기 — 응답 타임아웃 31초
| 모델 | 카메라 | NFC | 카드리더 | 사인패드 | 보안 | 영수증 | 듀얼리더 | ApplePay | 특이사항 |
|------|--------|-----|----------|----------|------|--------|----------|----------|----------|
| KCP-RA200N | O | O | O | X | X | X | O | X | |
| KCP-800 | O | O | O | O | X | X | O | O | |
| KCP-440D | X | O | O | X | X | X | X | X | |
| MCD-2000 | X | X | O | X | X | X | X | X | BT(mtu=23) |
| KCP-M4400 | O | O | O | X | O | 3인치 | O | O | BT(mtu=158) |
| KCP-330D | X | O | O | X | X | X | X | X | |
| TS-KC-RA0002 | O | O | O | O | X | X | X | X | |
| KCP-500 | O | O | O | O | X | X | O | X | |

### 기기 모드
- **테이블오더 활성화 기기**: EI101F, G10
- **블루투스 단말기**: KCP-M4400, MCD2000

---

## 결제 관련 오디오 (플로우 확인)
- `selectPayment.mp3` → 결제 수단 선택 화면
- `processingCard.mp3` → 카드 처리 중
- `processingEasy.mp3` → 간편결제 처리 중
- `paymentSuccess.mp3` / `paymentFailed.mp3` → 결제 성공/실패
- `orderStart.mp3` → 주문 시작
- `orderAccepted.mp3` / `orderAcceptedVoice.mp3` → 주문 접수 (음성 안내 별도 존재)

---

## 배달 플랫폼 연동
연동 플랫폼: **배민, 배민라이더, 쿠팡이츠, 요기요, 요기요라이더**

배민 상세 알림음:
- `baeminInitFail.wav` — 배민 초기화 실패
- `cookRequested.wav` — 조리 요청
- `notiBaemin.wav` / `notiBaemin1.wav` — 일반 주문 알림
- `notiBaeminStore.wav` — 스토어 알림
- `notiBaeminTakeout.mp3` — 테이크아웃 알림
- `orderChangeState.wav` — 주문 상태 변경
- `orderDelay.wav` — 주문 지연

---

## 주요 기능 목록 (에셋명 기반)

| 기능 | 근거 에셋 |
|------|-----------|
| 간편결제 신청 플로우 | apply_easy_pay_1.svg / apply_easy_pay_2.svg, easypay_join.svg |
| 바코드 스캐너 설정 (모바일/윈도우 별도 가이드) | barcode_scanner_setting_mobile_1/2.svg, barcode_scanner_setting_window.svg |
| 긴급 결제 모드 (emergency mode) | emergency/emergency_enable_payment.svg, guide_emergency_mode.png |
| 매장 등록 플로우 (4단계) | join_store_1~4.svg, join_store_flow.svg |
| 태블릿 오더 (QR 카드 읽기, 테이블 관리) | tablet_order/ 폴더 전체 (arrow, card, qr, game 등) |
| QR 픽업 주문 / QR 테이블 주문 | qr_pickup_banner.png, qr_table_banner.png |
| 광고 기능 | advert_device.png, advert_naverplace.png |
| 네이버플레이스 연동 | linked_naverplace.png, advert_naverplace.png |
| 다국어 지원 | tablet_order/language.svg |
| OMS 주문관리 뱃지 | oms_badge_icon.svg |
| 주문키트 | order_kit/orderkit_join.png |
| BLE 핀 페어링 가이드 | blePinExample.png |
| NFC 초기 설정 가이드 | hello_set_nfc.png |
| 프린터 초기 설정 가이드 (3단계) | hello_set_print_1~3.png |
| 서명 패드 | sign.png |
| 날씨 정보 표시 | sunny/rain/snow/wind.svg |
| 모드 전환 | mode_change.svg |
| 분할 결제 | split.svg, payment_icon_split.svg |
| 상담 기능 | counsel.svg |
| 대시보드 커스터마이즈 | dashboard_customize_outlined.svg |

---

## 결제 수단 아이콘
`payment_icon_card.svg`, `payment_icon_cash.svg`, `payment_icon_easy.svg`, `payment_icon_split.svg` → 카드/현금/간편결제/분할결제 4종 확인
