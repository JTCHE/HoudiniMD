; Gives F1 back to Houdini's own help before the app goes, while the record of
; what F1 pointed at is still in the app data. An update runs this uninstaller
; too, with /UPDATE, and must keep the hook.
!macro NSIS_HOOK_PREUNINSTALL
  ${If} $UpdateMode <> 1
    ${Do}
      ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --unhook' $0
      ${If} $0 = 0
      ${OrIf} ${Silent}
      ${OrIf} $PassiveMode = 1
        ${Break}
      ${EndIf}
      ${IfNot} ${Cmd} `MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Houdini is open. Close Houdini, then click Retry.$\n$\nIf you click Cancel, F1 in Houdini continues to open HoudiniMD, which will not be on this computer." IDRETRY`
        ${Break}
      ${EndIf}
    ${Loop}
  ${EndIf}
!macroend
