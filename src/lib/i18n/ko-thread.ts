// Korean for the thread part of the interface: English text as written in the code → Korean.
export const koThread: Record<string, string> = {
  // ui.tsx: shared controls
  Loading: "불러오는 중",
  Copy: "복사",
  Copied: "복사됨",

  // Picker
  none: "없음",
  "Select {label}": "{label} 선택",

  // FolderPicker
  "Add folder": "폴더 추가",
  "Choose another folder…": "다른 폴더 선택…",
  "Choose folder…": "폴더 선택…",
  Recent: "최근",
  "Remove folder": "폴더 제거",
  "Couldn't open the folder chooser: {error}": "폴더 선택 창을 열지 못했어요: {error}",
  Folder: "폴더",
  "This folder can't be found": "이 폴더를 찾을 수 없어요",
  "Give the agent a folder to work in": "에이전트가 작업할 폴더를 지정하세요",

  // ModePicker
  Mode: "모드",
  Agent: "에이전트",
  "Reads, edits and runs commands": "파일을 읽고 수정하며 명령을 실행해요",
  Plan: "계획",
  "Explores read-only, proposes a plan": "읽기 전용으로 살펴보고 계획을 제안해요",
  Terminal: "터미널",
  "This session as a CLI, in a full-window terminal": "이 세션을 전체 창 터미널에서 CLI로 사용해요",
  "Back to the chat": "채팅으로 돌아가기",
  "Switch mode": "모드 전환",

  // Markdown
  "Couldn't open the link: {error}": "링크를 열지 못했어요: {error}",

  // Thread: new-session screen
  "How can I help you today?": "오늘은 무엇을 도와드릴까요?",
  "Chat with any model. Add a folder and the agent can work in it.":
    "어떤 모델과도 채팅할 수 있어요. 폴더를 추가하면 에이전트가 그 안에서 작업할 수 있어요.",
  "Brainstorm ideas": "아이디어 브레인스토밍",
  "Help me brainstorm ideas for ": "다음 주제로 아이디어를 브레인스토밍해 주세요: ",
  "Explain a concept": "개념 설명",
  "Explain, step by step, how ": "다음이 어떻게 이루어지는지 단계별로 설명해 주세요: ",
  "Draft a message": "메시지 초안 쓰기",
  "Draft a short, friendly message to ": "짧고 친근한 메시지 초안을 써 주세요. 받는 사람: ",
  "Compare options": "선택지 비교",
  "Compare the trade-offs between ": "다음 선택지들의 장단점을 비교해 주세요: ",
  "What should we work on?": "어떤 작업을 할까요?",
  "The agent can read, edit and run commands in {folder}, with your approval.":
    "승인을 받으면 에이전트가 {folder}에서 파일을 읽고 수정하며 명령을 실행할 수 있어요.",
  "your folder": "폴더",
  "Tidy up a folder": "폴더 정리",
  "Organize the files in ": "다음 폴더의 파일을 정리해 주세요: ",
  "Summarize documents": "문서 요약",
  "Read and summarize the documents in ": "다음 위치의 문서를 읽고 요약해 주세요: ",
  "Clean up data": "데이터 정리",
  "Clean up and reformat the data in ": "다음 데이터를 정리하고 형식을 다시 맞춰 주세요: ",
  "Plan a project": "프로젝트 계획",
  "Break this project into steps and work through them: ": "이 프로젝트를 단계별로 나누고 하나씩 진행해 주세요: ",
  "What are we building?": "무엇을 만들어 볼까요?",
  "A coding agent for {folder}: it reads, edits and runs commands, and shows you every diff.":
    "{folder}에서 코드를 읽고 수정하며 명령을 실행하고, 모든 diff를 보여 주는 코딩 에이전트예요.",
  "your repository": "저장소",
  "Fix a bug": "버그 수정",
  "Find and fix the bug where ": "다음 버그를 찾아서 고쳐 주세요: ",
  "Write tests": "테스트 작성",
  "Write tests for ": "다음에 대한 테스트를 작성해 주세요: ",
  "Explain this codebase": "코드베이스 설명",
  "Give me a tour of this codebase: the main modules and how they fit together.":
    "이 코드베이스를 소개해 주세요. 주요 모듈과 모듈들이 어떻게 맞물리는지 알려 주세요.",
  "Refactor a module": "모듈 리팩터링",
  "Refactor ": "다음을 리팩터링해 주세요: ",

  // Thread
  "Scroll to bottom": "맨 아래로 스크롤",

  // ToolCard: what a tool call is doing / did
  Reading: "읽는 중",
  Read: "읽음",
  Editing: "수정 중",
  Edited: "수정함",
  Running: "실행 중",
  Ran: "실행함",
  Searching: "검색 중",
  Searched: "검색함",
  Fetching: "가져오는 중",
  Fetched: "가져옴",
  Denied: "거부됨",

  // ToolCard: permission
  "Allow {name}?": "{name}을(를) 허용할까요?",
  Deny: "거부",
  Allow: "허용",
  "For the rest of this session": "이 세션이 끝날 때까지 적용돼요",
  "Always allow this command": "이 명령 항상 허용",
  "Allow all edits": "모든 수정 허용",
  "Allow all reads": "모든 읽기 허용",
  "Allow all searches": "모든 검색 허용",
  "Allow all fetches": "모든 가져오기 허용",

  // ToolCard
  "Undone from the Changes panel": "변경 사항 패널에서 되돌렸어요",
  Reverted: "되돌림",
  "Open in editor": "편집기에서 열기",

  // MessageView: thinking
  "Thinking…": "생각 중…",
  "Thought for {n}s": "{n}초 동안 생각함",

  // MessageView: editing a prompt
  "Edit message": "메시지 수정",
  "Replies after this one will be replaced.": "이 메시지 뒤의 응답은 새 응답으로 바뀌어요.",
  Cancel: "취소",
  Send: "보내기",

  // MessageView: message actions and status
  Edit: "수정",
  "Edit and send again": "수정해서 다시 보내기",
  Branch: "분기",
  "Branch from here": "여기서 분기",
  Working: "작업 중",
  "Something went wrong.": "문제가 발생했어요.",
  "Stopped by user": "사용자가 중지했어요",
  "Go ahead with this plan.": "이 계획대로 진행해 주세요.",
  "Run this plan": "이 계획 실행",
  "Switches to Agent mode and carries it out.": "에이전트 모드로 전환해서 계획을 실행해요.",
  Retry: "다시 시도",
  "Retry with another model": "다른 모델로 다시 시도",
  "Retry with": "다시 시도할 모델",
  "{input} in · {output} out": "입력 {input} · 출력 {output}",

  // Composer
  Model: "모델",
  "Remove {name}": "{name} 제거",
  Files: "파일",
  Commands: "명령",
  "Add a folder to mention its files": "폴더를 추가하면 그 안의 파일을 멘션할 수 있어요",
  choose: "이동",
  pick: "선택",
  close: "닫기",
  "Sends when the agent finishes:": "에이전트가 끝나면 보내요:",
  "Don't send it": "보내지 않기",
  Message: "메시지",
  "Attach files": "파일 첨부",
  Queue: "대기",
  Stop: "중지",
  "Send when the agent finishes": "에이전트가 끝나면 보내기",
  "Running in another window": "다른 창에서 실행 중",
  "Drop files to attach, or a folder to work in": "파일을 놓으면 첨부하고, 폴더를 놓으면 그 폴더에서 작업해요",
  "AI can make mistakes. Double-check important info.": "AI는 실수할 수 있어요. 중요한 정보는 다시 확인하세요.",
  "Agents can make mistakes. Review changes.": "에이전트는 실수할 수 있어요. 변경 사항을 검토하세요.",

  // Composer: / commands
  "Switch to Plan mode": "계획 모드로 전환",
  "Switch to Agent mode": "에이전트 모드로 전환",
  "Start a new chat": "새 채팅 시작",
  "Start a new session": "새 세션 시작",
  "Change the folder": "폴더 변경",
  "Choose a folder to work in": "작업할 폴더 선택",
  "Show this session as a CLI": "이 세션을 CLI로 보기",
  "Manage snippets": "스니펫 관리",
  "Keyboard shortcuts": "키보드 단축키",

  // Composer: placeholders
  "This session is running in another window…": "이 세션은 다른 창에서 실행 중이에요…",
  "Queue a message for when the agent finishes…": "에이전트가 끝나면 보낼 메시지를 입력하세요…",
  "Ask anything… (/ for commands)": "무엇이든 물어보세요… (/로 명령)",
  "Describe what you want to plan… (@ to mention a file)": "계획하고 싶은 내용을 설명해 주세요… (@로 파일 멘션)",
  "Describe a coding task… (@ to mention a file)": "코딩 작업을 설명해 주세요… (@로 파일 멘션)",
  "Describe a task for the agent… (@ to mention a file)": "에이전트에게 맡길 작업을 설명해 주세요… (@로 파일 멘션)",

  // Composer: key hints under the box
  send: "보내기",
  "new line": "줄바꿈",
  file: "파일",
  commands: "명령",
};
