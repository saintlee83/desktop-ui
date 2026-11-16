// Korean for the core part of the interface: English text as written in the code → Korean.
export const koCore: Record<string, string> = {
  // ---- lib/actions.ts ----
  "Deleted “{title}”": "“{title}” 세션을 삭제했어요",
  Undo: "실행 취소",
  "Deleted {n} session": "세션 {n}개를 삭제했어요",
  "Deleted {n} sessions": "세션 {n}개를 삭제했어요",
  "Copied the last response": "마지막 응답을 복사했어요",
  "Couldn't open the folder chooser: {error}": "폴더 선택 창을 열지 못했어요: {error}",
  "Add a folder to use Agent and Plan modes": "에이전트·계획 모드를 쓰려면 폴더를 추가하세요",
  "Add folder": "폴더 추가",
  "Deleted project “{name}”": "“{name}” 프로젝트를 삭제했어요",
  "Couldn't open a window: {error}": "창을 열지 못했어요: {error}",
  "This session has no folder": "이 세션에는 폴더가 없어요",
  "Couldn't open {file}: {error}": "{file} 파일을 열지 못했어요: {error}",
  "Couldn't show {file}: {error}": "{file} 파일의 위치를 열지 못했어요: {error}",
  "Couldn't reapply {file}: {error}": "{file} 파일에 변경 사항을 다시 적용하지 못했어요: {error}",
  "Couldn't revert {file}: {error}": "{file} 파일을 되돌리지 못했어요: {error}",
  "Reapplied the changes to {file}": "{file} 파일에 변경 사항을 다시 적용했어요",
  "Reverted {file}": "{file} 파일을 되돌렸어요",

  // ---- lib/store.ts ----
  "New session": "새 세션",
  "Couldn't save: storage is full. Export or delete old sessions in Settings › Data.":
    "저장하지 못했어요: 저장 공간이 가득 찼어요. 설정 › 데이터에서 오래된 세션을 내보내거나 삭제하세요.",
  Open: "열기",
  "Stopped with an error: {message}": "오류로 중지됐어요: {message}",
  Done: "완료",
  "Waiting for approval: {tool}": "승인 대기 중: {tool}",
  "a tool": "도구",
  "Untitled project": "제목 없는 프로젝트",
  "{title} (branch)": "{title} (분기)",
  "Branched into “{title}”": "“{title}” 세션으로 분기했어요",

  // ---- lib/data.ts: the Markdown export ----
  Assistant: "어시스턴트",
  You: "나",
  "Attached: {files}": "첨부: {files}",
  // Modes by id, after the model's name in a heading.
  agent: "에이전트",
  plan: "계획",
  "(reverted)": "(되돌림)",
  "Error: {message}": "오류: {message}",
  "something went wrong": "문제가 생겼어요",
  "Stopped by user": "사용자가 중지했어요",

  // ---- lib/data.ts: export, backup, import ----
  "Exported “{title}”": "“{title}” 세션을 내보냈어요",
  "Couldn't export: {error}": "내보내지 못했어요: {error}",
  "Backed up {n} session": "세션 {n}개를 백업했어요",
  "Backed up {n} sessions": "세션 {n}개를 백업했어요",
  "Couldn't back up: {error}": "백업하지 못했어요: {error}",
  "this isn't an Agent Desktop backup": "Agent Desktop 백업 파일이 아니에요",
  "Imported {n} session": "세션 {n}개를 가져왔어요",
  "Imported {n} sessions": "세션 {n}개를 가져왔어요",
  "Nothing new in that backup": "이 백업에는 새로 가져올 것이 없어요",
  "Couldn't import: {error}": "가져오지 못했어요: {error}",

  // ---- lib/attach.ts ----
  "pasted image.png": "붙여넣은 이미지.png",
  "pasted file": "붙여넣은 파일",
  "Attach files": "파일 첨부",

  // ---- lib/attention.ts ----
  "Couldn't use {shortcut} as the global shortcut: {error}": "{shortcut} 조합을 전역 단축키로 쓸 수 없어요: {error}",

  // ---- lib/native.ts ----
  "only in the app": "앱에서만 할 수 있어요",
  Export: "내보내기",

  // ---- lib/folders.ts ----
  "Choose a folder": "폴더 선택",

  // ---- lib/util.ts: relative times and date groups ----
  now: "방금",
  "{n}m": "{n}분",
  "{n}h": "{n}시간",
  "{n}d": "{n}일",
  Today: "오늘",
  Yesterday: "어제",
  "Previous 7 days": "지난 7일",
  "Previous 30 days": "지난 30일",
  Older: "그 이전",

  // ---- App.tsx ----
  "Resize sidebar": "사이드바 크기 조절",
  "Resize side panel": "사이드 패널 크기 조절",

  // ---- lib/sections.ts (SECTIONS, rendered through t()) ----
  Chat: "채팅",
  Code: "코드",
  "Conversation; add a folder and the agent works in it": "대화. 폴더를 추가하면 에이전트가 그 폴더에서 작업해요",
  "Coding sessions in a repository": "저장소에서 하는 코딩 세션",

  // ---- lib/clis.ts (CLIS; product names other than Shell stay as they are) ----
  Shell: "셸",
  "This session": "이 세션",
  "Other CLIs, in their own sessions": "다른 CLI (각자의 세션에서 실행)",
  Plain: "기본",
  "This session as a CLI: same conversation, same agent": "이 세션을 CLI로: 같은 대화, 같은 에이전트",
  "Anthropic's coding agent": "Anthropic의 코딩 에이전트",
  "OpenAI's coding agent": "OpenAI의 코딩 에이전트",
  "Google's coding agent": "Google의 코딩 에이전트",
  "Sourcegraph's coding agent": "Sourcegraph의 코딩 에이전트",
  "Your login shell, nothing started": "아무것도 실행하지 않은 로그인 셸",

  // ---- lib/theme.ts (SCHEMES) ----
  Ink: "잉크",
  Graphite: "그래파이트",
  Mono: "모노",
  Sand: "샌드",
  Sage: "세이지",
  Slate: "슬레이트",
  "Warm paper and ink": "따뜻한 종이와 잉크",
  "Cool, even grays": "차갑고 고른 회색",
  "Pure black and white": "순수한 흑백",
  "Parchment and umber": "양피지와 짙은 갈색",
  "Gray with a green cast": "초록빛이 도는 회색",
  "Gray with a blue cast": "푸른빛이 도는 회색",
};
