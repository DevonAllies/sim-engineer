; Setup Engineer installer additions
; 0.12 moves the program from the per-user folder (AppData\Local\Programs) to Program Files.
; Before installing, quietly remove the old per-user copy so there aren't two "Setup Engineer" shortcuts.
; Your data is never touched: it lives in Documents\Setup Engineer (and the old learning file stays where it was).
!macro customInit
  ReadEnvStr $0 LOCALAPPDATA
  StrCpy $1 "$0\Programs\setup-engineer"
  IfFileExists "$1\Uninstall Setup Engineer.exe" 0 +4
    nsExec::Exec 'taskkill /F /IM "Setup Engineer.exe" /T'
    ExecWait '"$1\Uninstall Setup Engineer.exe" /S /currentuser _?=$1'
    RMDir /r "$1"
!macroend
