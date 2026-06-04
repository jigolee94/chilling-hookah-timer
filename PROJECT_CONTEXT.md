# PROJECT_CONTEXT.md

## Project: Chilling Timer

This project is a Vite + React web/PWA app used by hookah bar staff to manage hookah timers by table.

Main staff-app repository:

```text
jigolee94/chilling-hookah-timer
```

Planned separate manager-app repository:

```text
jigolee94/chilling-admin-overview
```

The manager overview app should be separate from this staff app. Do not add manager overview screens into this repo unless explicitly requested.

---

## Core Product Purpose

Chilling Timer helps staff manage hookah preparation and maintenance timing in real store operations.

Typical timer stages:

1. 숯 뒤집기
2. 시샤 히팅 시작
3. 후카 나감
4. 숯 털기/1개 올림
5. 숯 1개 뒤집기
6. 숯 1개 교체

The app must be fast and mobile-friendly.

---

## Most Important Rule

Do not break the existing local timer flow.

The app must continue working even if any of these fail:

- Firestore
- Firebase Cloud Messaging
- Cloud Functions
- server sync
- internet connection
- push notification permission

The local timer logic is the source of operational reliability.

---

## Staff Mode / Admin Mode

The app has two modes:

```text
직원 모드
관리자 모드
```

Do not shorten these labels to `직원` or `관리자`.

### Admin Login

Default admin ID and password:

```text
ID: admin
PW: 1004
```

UI rules:

- Do not show text like `기본 비밀번호는 1004입니다.`
- The admin login modal must ask for both ID and password.
- The admin login modal must appear high enough on mobile so the keyboard does not cover it.
- The modal should be scroll-safe on small screens.

---

## Presets

Supported presets include:

- 칠링 성수점
- 언더시티

Current desired first screen default:

```text
칠링 성수점
```

Preset changes should apply both:

1. table layout
2. timer stage durations

Be careful with localStorage keys because changing them can reset user data.

---

## Table Layout

The layout uses:

- `layoutWidth`
- `layoutHeight`
- table `x`
- table `y`

Tables should be rendered like a floor plan. Do not enlarge table cards or overlays in a way that makes nearby tables overlap visually. Alert overlays should stay inside table card bounds.

The table move button should show text:

```text
자리이동
```

Do not use only an icon for this action.

---

## Alert / Overlay Behavior

There are three important overlay types.

### 1. Yellow `임박` overlay

Purpose: warning only.

Behavior:

- Tapping/clicking `임박` should only dismiss the urgent warning.
- It must not confirm the stage.
- It must not move to the next stage.
- `임박` is not the same as `확인`.

### 2. Red `확인` overlay

Purpose: actual confirmation action after a timer is due or overdue.

Behavior:

- Tapping/clicking red `확인` confirms the current stage.
- This can move the timer to the next stage.
- It should record confirmation history and score.

Only the red confirmation overlay should advance stages.

### 3. Green `숯 뚜껑 열어주기` overlay

Purpose: mid-stage reminder during `숯 털기/1개 올림`.

Behavior:

- It appears when the `숯 털기/1개 올림` stage has 10 minutes remaining.
- It should show green blinking UI.
- Tapping/clicking it should only dismiss this reminder.
- It must not confirm the stage.
- It must not trigger underlying table buttons.
- Once dismissed for the same timer/stage, it should not repeatedly reappear when the user presses `+1분` or `-1분`.

### Overlay click isolation

All alert overlays must consume clicks and prevent underlying buttons from being triggered.

Use:

```js
event.preventDefault();
event.stopPropagation();
```

Do not let overlay taps click the table card, add button, delete button, or popup controls behind the overlay.

---

## Important Recent Bug Fixes To Preserve

Do not regress these behaviors:

1. `임박` overlay only dismisses urgent warning; it does not advance stage.
2. `확인` overlay is the only overlay that confirms a stage.
3. `임박`, `확인`, and `숯 뚜껑 열어주기` overlays do not accidentally click buttons behind them.
4. `숯 뚜껑 열어주기` disappears when tapped.
5. `숯 뚜껑 열어주기` does not reappear repeatedly after being dismissed and then adjusting time with `-1분` or `+1분`.
6. Admin ID/password inputs should not be hidden by the mobile keyboard.
7. Mode labels must be `직원 모드` and `관리자 모드`.
8. Confirmation history should not always be expanded in the timer popup.
9. Confirmation history should open only when the user taps `확인 히스토리 보기`.
10. The history button should sit below the timer delete button.
11. The PWA icon should have a rounded/maskable look, not a sharp square look.

---

## Confirmation History

Each table/timer popup should include a timer delete button.

Below it, show:

```text
확인 히스토리 보기
```

Do not show confirmation history immediately. It should open only after the user taps the history button, ideally in a separate modal/popup.

---

## Score System

When a red `확인` action is pressed, score based on delay after scheduled time:

- within 10 seconds: 5 points
- within 20 seconds: 4 points
- after 20 seconds: 3 points

No 2-point or 1-point score.

Scores should be stored at the time of confirmation so later preset/timer changes do not alter old scores.

---

## Work Shift / Closing Report

The app has a shift flow:

- 영업 시작
- 퇴근
- 마감 완료

### Shift handoff rule

When staff change shifts:

- Starting a new shift must not reset active timers.
- Closing a shift must not delete active timers.
- Existing timers should keep running across shift handoff.

### Hookah count rule

For a staff member's closing report:

- Count hookahs newly started during that shift.
- Do not require the hookah cycle to be fully completed.
- If staff A starts a hookah before leaving, it counts toward staff A even if it finishes during staff B's shift.
- It should not count again for staff B.

### Closing report UI rules

- The closing report popup should be scrollable on mobile.
- `오늘 일한 시간` should appear at the top.
- `영업 시작시간` and `영업 마감시간` should both be visible.
- `가장 늦어졌던 단계` should sit beside `많이 나간 테이블` to reduce popup height.
- The old large message card like `오늘 총 몇개 만들었어요! 오늘도 수고하셨어요!` was removed.
- `오늘 일한 시간` and `오늘 평균 응대 점수` should not have special colored backgrounds.
- On the final smoke closing page, the text should be exactly:

```text
오늘도 고생 많았어요
```

No period at the end.

---

## Alarm Rules

### 1-minute urgent alarm

All timer stages should consistently use 1 minute remaining as the urgent threshold.

Do not use mixed thresholds like 30 seconds, 3 minutes, or 5 minutes.

### Overdue confirmation alarm

When a timer reaches its due time:

- Show red full-table confirmation overlay.
- If the user does not confirm, local alarm can repeat every 15 seconds while the app is open.

### Coal lid alarm

For the `숯 털기/1개 올림` stage:

- At 10 minutes remaining, show green `숯 뚜껑 열어주기` reminder.
- Sound should be `띵동` where:
  - `띵` is lower
  - `동` is higher

### Background notifications

Current PWA/browser local notifications cannot fully guarantee sound when the app is completely closed or phone screen is off.

For more reliable background alerts, use:

- Firebase Cloud Messaging
- Cloud Functions
- Firestore scheduled notification documents

But do not break local timers if Firebase fails.

---

## Firebase / Future Server Push Plan

Server push notification design should use:

- Firestore
- Firebase Cloud Messaging
- Cloud Functions scheduled every 1 minute

Do not write `remainingSeconds` every second to Firestore.

Use timestamp-based data:

- `nextTaskAt`
- `servedAt`
- `scheduledServedAt`
- `estimatedEndAt`
- `updatedAt`
- `fireAt`

Suggested Firestore paths:

```text
stores/{storeId}
stores/{storeId}/devices/{deviceId}
stores/{storeId}/timers/{timerId}
stores/{storeId}/scheduledNotifications/{notificationId}
```

### scheduledNotifications example

```js
{
  timerId: "timer_123",
  tableId: "table-3",
  tableName: "테이블 3",
  type: "urgent" | "coalLidOpen" | "overdue" | "refill",
  title: "테이블 3 확인 필요",
  body: "시샤 히팅 시작 시간이 됐어요.",
  fireAt: Timestamp,
  sent: false,
  cancelled: false,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp()
}
```

### Server push behavior

- Local app open: existing 15-second repeat can remain.
- App closed/background: server push should generally repeat only in 1-minute intervals.
- Do not attempt to write or check Firestore every second.

---

## Manager Admin Overview App

A separate admin app is planned.

Repository:

```text
jigolee94/chilling-admin-overview
```

This should be separate from this branch/staff app.

Purpose:

- Read Firestore
- Show all branches/stores
- Let manager select a branch
- Show that branch's table layout and timer status
- Help estimate when tables will be available for reservations

Reservation estimate rule:

```text
estimatedEndAt = servedAt + 90 minutes
```

If `servedAt` is missing:

```text
estimatedEndAt = scheduledServedAt + 90 minutes
```

The manager app should show:

- store cards
- branch detail view
- table layout using layoutWidth/layoutHeight/x/y
- current timer stage
- served time
- estimated end time
- earliest available table if full

---

## Design Style

Keep the existing Chilling Timer visual style:

- dark background
- red point color
- rounded cards
- mobile-first
- bold Korean text
- simple operational UI
- avoid clutter

Staff-facing UI should stay fast and simple.

Admin/settings UI can be more detailed.

---

## Development Rules For Codex

Before modifying code:

1. Read this `PROJECT_CONTEXT.md`.
2. Preserve existing local timer behavior.
3. Do not create a new app unless explicitly requested.
4. For this staff app, modify the existing React/Vite app.
5. Run:

```bash
npm run build
```

6. Report:
   - files changed
   - behavior changed
   - any limitations
   - whether build succeeded

When editing alert overlays, always verify:

- `임박` only dismisses warning
- `확인` advances stage
- `숯 뚜껑 열어주기` only dismisses reminder
- no underlying buttons are accidentally clicked
