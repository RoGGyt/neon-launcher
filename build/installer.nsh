; Дополнение к установщику Neon Launcher (electron-builder подключает build/installer.nsh сам).
; При удалении лаунчера стираем всё, что он скачал: версии игры, библиотеки, Java,
; профили с модами и шейдерами, кэш обновлений. Настройки и кэш самого окна
; (%APPDATA%\Neon Launcher) удаляет electron-builder: deleteAppDataOnUninstall. При автообновлении (${isUpdated}) ничего не трогаем,
; иначе каждое обновление удаляло бы игру.

!macro customUnInstall
  ${ifNot} ${isUpdated}
    ; %APPDATA% текущего пользователя, даже если установка была «для всех»
    ExpandEnvStrings $R9 "%APPDATA%"
    ${if} ${FileExists} "$R9\.neonlauncher\*.*"
      MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON1 \
        "Удалить всё, что скачал Neon Launcher?$\r$\n$\r$\nВерсии Minecraft, Java, моды, шейдеры и профили (вместе с мирами) из папки:$\r$\n$R9\.neonlauncher$\r$\n$\r$\nНажми «Нет», если хочешь сохранить миры." \
        /SD IDYES IDNO neon_keep_data
      RMDir /r "$R9\.neonlauncher"
      neon_keep_data:
    ${endIf}
    ; скачанные, но не установленные обновления лаунчера
    ExpandEnvStrings $R8 "%LOCALAPPDATA%"
    RMDir /r "$R8\neon-launcher-updater"
  ${endIf}
!macroend
