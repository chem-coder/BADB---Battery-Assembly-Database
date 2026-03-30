Attribute VB_Name = "modEnvironment"
'=== modEnvironment ===
Option Explicit

' Вызывается из Workbook_Open.
' Гарантирует:
'   - Application.Calculation = Automatic
'   - Application.EnableEvents = True
'   - Показывает подсказки по макросам / Trust Center.
Public Sub CheckExcelEnvironment()
    Dim msg As String

    ' 1) Режим вычислений: принудительно включаем "Автоматически"
    If Application.Calculation <> xlCalculationAutomatic Then
        Application.Calculation = xlCalculationAutomatic
        msg = msg & "• Режим вычислений был автоматически переключён на 'Автоматически'." & vbCrLf & _
                    "  (Файл > Параметры > Формулы > Параметры вычислений)." & vbCrLf & vbCrLf
    End If

    ' 2) События: принудительно включаем
    If Application.EnableEvents = False Then
        Application.EnableEvents = True
        msg = msg & "• События приложений (Application.EnableEvents) были автоматически включены." & vbCrLf & _
                    "  Без этого не работают автозаполнение, обработчики событий и авто-обновление." & vbCrLf & vbCrLf
    End If

    ' 3) Макросы и Trust Center — включить из кода НЕЛЬЗЯ,
    ' только руками, поэтому оставляем как текстовую подсказку
    msg = msg & "• Разрешите выполнение макросов для этой книги:" & vbCrLf & _
                "  Файл > Параметры > Центр управления безопасностью > Параметры центра управления безопасностью..." & vbCrLf & _
                "  Раздел 'Параметры макросов' > выберите:" & vbCrLf & _
                "    - 'Включить все макросы (не рекомендуется)' ИЛИ" & vbCrLf & _
                "    - 'Отключить все макросы с уведомлением' и затем при открытии книги нажимать 'Включить содержимое'." & vbCrLf & vbCrLf & _
                "  Там же желательно включить 'Доверять доступ к объектной модели проектов VBA' (для полной работы VBA)." & vbCrLf & vbCrLf & _
                "• При необходимости проверьте надстройки (Пакет анализа и др.) через:" & vbCrLf & _
                "  Файл > Параметры > Надстройки > 'Управление: Надстройки Excel' > Перейти..."

    ' Показываем сообщение только если есть что сказать
    If Len(msg) > 0 Then
        MsgBox "Для корректной работы этой книги были выполнены проверки настроек Excel:" & vbCrLf & vbCrLf & msg, _
               vbInformation, "Настройки Excel для макросов"
    End If
End Sub


