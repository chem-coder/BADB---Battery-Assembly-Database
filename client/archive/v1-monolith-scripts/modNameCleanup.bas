Attribute VB_Name = "modNameCleanup"
'=== modNameCleanup ===
Option Explicit

' Проверка: "битое" ли имя (формула/ссылка)
Private Function IsBrokenName(ByVal nm As Name) As Boolean
    Dim s As String
    Dim r As Range
    Dim errNum As Long

    IsBrokenName = False

    ' 1) Не трогаем внутренние системные имена Excel
    '    (_xlnm.* — это фильтры, таблицы и т.п.)
    If LCase$(Left$(nm.Name, 6)) = "_xlnm." Then Exit Function

    ' 2) Пытаемся прочитать refersTo
    s = ""
    On Error Resume Next
    s = nm.refersTo
    errNum = Err.Number
    On Error GoTo 0

    ' Ошибка при чтении refersTo — мусор
    If errNum <> 0 Then
        IsBrokenName = True
        Exit Function
    End If

    ' Пустая ссылка — мусор
    If Len(s) = 0 Then
        IsBrokenName = True
        Exit Function
    End If

    ' 3) Явный #REF! в формуле имени
    If InStr(1, s, "#REF!", vbTextCompare) > 0 Then
        IsBrokenName = True
        Exit Function
    End If

    ' 4) Попытка получить RefersToRange (если это диапазон / ячейка)
    On Error Resume Next
    Set r = nm.RefersToRange
    errNum = Err.Number
    On Error GoTo 0

    If errNum <> 0 Then
        ' Ошибка привязки диапазона — лист/ячейка уже не существуют
        IsBrokenName = True
        Exit Function
    End If

    ' 5) Всё остальное считаем валидным
End Function

' Проверка: это "служебное имя таблицы",
' которое можно удалять (Заголовок_Этап_... и т.п.)
Private Function IsTableHelperName(ByVal nameText As String) As Boolean
    ' Наши заголовки таблиц: "Заголовок_ИмяТаблицы"
    If Left$(nameText, Len("Заголовок_")) = "Заголовок_" Then
        IsTableHelperName = True
    Else
        IsTableHelperName = False
    End If
End Function

' Только отчёт: показать, какие имена считаются "битими"
Public Sub ReportBrokenNames()
    Dim nm As Name
    Dim msg As String
    Dim cnt As Long

    For Each nm In ThisWorkbook.names
        If IsBrokenName(nm) And IsTableHelperName(nm.Name) Then
            cnt = cnt + 1
            msg = msg & cnt & ". " & nm.Name & " -> " & nm.refersTo & vbCrLf
        End If
    Next nm

    If cnt = 0 Then
        MsgBox "Битых служебных имён (Заголовок_*) не найдено.", _
               vbInformation, "Проверка имён"
    Else
        MsgBox "Найдено битых служебных имён: " & cnt & vbCrLf & vbCrLf & msg, _
               vbInformation, "Проверка имён"
    End If
End Sub

' Основной макрос: удалить ИМЕННО служебные имена,
' которые уже не указывают ни на что в книге
Public Sub CleanupBrokenNames()
    Dim nm As Name
    Dim i As Long
    Dim toDelete As Collection
    Dim msg As String
    Dim cnt As Long
    Dim ans As VbMsgBoxResult

    Set toDelete = New Collection

    ' 1) Собираем список ИМЕН, которые:
    '    - битые по ссылке
    '    - и выглядят как служебные заголовки таблиц (Заголовок_*)
    For Each nm In ThisWorkbook.names
        If IsBrokenName(nm) And IsTableHelperName(nm.Name) Then
            toDelete.Add nm
        End If
    Next nm

    cnt = toDelete.Count
    If cnt = 0 Then
        MsgBox "Битых служебных имён (Заголовок_*) не найдено — чистить нечего.", _
               vbInformation, "Очистка имён"
        Exit Sub
    End If

    ' 2) Краткий отчёт перед удалением
    msg = "Найдено битых служебных имён: " & cnt & "." & vbCrLf & _
          "Удалить их из диспетчера имён?" & vbCrLf & vbCrLf & _
          "Первые несколько:" & vbCrLf

    For i = 1 To Application.WorksheetFunction.Min(10, cnt)
        On Error Resume Next
        msg = msg & " - " & toDelete(i).Name & " -> " & toDelete(i).refersTo & vbCrLf
        On Error GoTo 0
    Next i

    If cnt > 10 Then msg = msg & "..." & vbCrLf

    ans = MsgBox(msg, vbQuestion + vbYesNo, "Очистка имён")
    If ans <> vbYes Then Exit Sub

    ' 3) Удаляем ТОЛЬКО служебные имена (Заголовок_*),
    '    и только если они по-прежнему считаются "битими"
    On Error Resume Next
    For i = ThisWorkbook.names.Count To 1 Step -1
        Set nm = ThisWorkbook.names(i)
        If IsTableHelperName(nm.Name) And IsBrokenName(nm) Then
            nm.Delete
        End If
    Next i
    On Error GoTo 0

    MsgBox "Очистка завершена. Удалено служебных имён: " & cnt & ".", _
           vbInformation, "Очистка имён"
End Sub


