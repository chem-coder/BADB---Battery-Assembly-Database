Attribute VB_Name = "modОтображение_ID_Этапа"
' ===========================
'  modОтображениеКнопки.bas
' ===========================
Option Explicit

' ===== НАСТРОЙКИ =====
Private Const SVC_SHEET        As String = "Служебный_лист"
Private Const TARGET_NAME      As String = "Отображение"
Private Const META_PREFIX      As String = "__meta_BLOCK_"

' ID-блок
Private Const ID_TABLE_NAME    As String = "Таблица_с_описанием_ID"
Private Const ID_HEADER_NAME   As String = "Заголовок_Таблица_с_описанием_ID"
Private Const ID_FALLBACK_HDR  As String = "Таблица с описанием ID"

' Этапы
Private Const STAGE_HDR_PREFIX As String = "Заголовок_"   ' "Заголовок_" & <имя таблицы этапа>

' Редактор
Private Const ED_VIEW_PREFIX   As String = "Вид_Редактор_"

' ===== СОСТОЯНИЕ EXCEL =====
Private mScreenUpdating As Boolean
Private mEnableEvents   As Boolean
Private mDisplayAlerts  As Boolean
Private mCalcMode       As XlCalculation

' ---------- КНОПКА: Открыть "Таблицу ID" ----------
Public Sub Открыть_Таблицу_ID()
    SaveApp
    On Error GoTo FAIL

    Dim hdrCell As Range: Set hdrCell = GetHeaderCellStrict()

    ' если открыт редактор — завершить (Да/Нет); при неуспешном сохранении — не продолжаем
    If Not GuardEditorOpen_AndCloseIfNeeded(hdrCell) Then GoTo Finally

    Dim loSrc As ListObject: Set loSrc = FindListObjectGlobal(ID_TABLE_NAME)
    If loSrc Is Nothing Then Err.Raise 1001, , "Не найдена таблица '" & ID_TABLE_NAME & "'."

    Dim rngHdr As Range: Set rngHdr = ResolveNamedRange(ID_HEADER_NAME)
    Dim myHeaderText As String
    myHeaderText = IIf(rngHdr Is Nothing, ID_FALLBACK_HDR, CStr(rngHdr.Cells(1, 1).value))

    If Not HandleHeaderToggle(hdrCell, myHeaderText) Then GoTo Finally

    MetaSet META_PREFIX & "ActiveKind", "ID"
    MetaSet META_PREFIX & "ActiveTable", loSrc.Name

    hdrCell.value = myHeaderText

    Dim below As Range: Set below = CellBelowHeader(hdrCell)
    Do While IsInsideAnyListObject(below): Set below = below.Offset(1, 0): Loop

    loSrc.Range.Cut Destination:=below
    Application.CutCopyMode = False
    GoTo Finally

FAIL:
    MsgBox "Открыть_Таблицу_ID: " & Err.Number & " — " & Err.Description, vbCritical
Finally:
    RestoreApp
End Sub

' ---------- КНОПКА: Открыть "Таблицу этапа по шаблону" ----------
Public Sub Открыть_Таблицу_Этапа_по_Шаблону()
    SaveApp
    On Error GoTo FAIL

    Dim hdrCell As Range: Set hdrCell = GetHeaderCellStrict()

    ' если открыт редактор — завершить (Да/Нет); при неуспешном сохранении — не продолжаем
    If Not GuardEditorOpen_AndCloseIfNeeded(hdrCell) Then GoTo Finally

    Dim stageKey As String: stageKey = Trim$(GetNamedText("Этап_поиск"))
    If Len(stageKey) = 0 Then
        MsgBox "Вы не выбрали этап. Укажите этап в 'Таблица_всех_этапов' или создайте его в редакторе.", vbInformation
        GoTo Finally
    End If

    Dim loSrc As ListObject: Set loSrc = FindListObjectGlobal(stageKey)
    If loSrc Is Nothing Then
        Dim altName As String: altName = IIf(Left$(stageKey, 5) = "Этап_", stageKey, "Этап_" & SanitizeName(stageKey))
        Set loSrc = FindListObjectGlobal(altName)
    End If
    If loSrc Is Nothing Then
        MsgBox "Не найден шаблон таблицы этапа: " & stageKey & ".", vbExclamation
        GoTo Finally
    End If

    Dim hdrName As String: hdrName = STAGE_HDR_PREFIX & loSrc.Name
    Dim rngHdr As Range:   Set rngHdr = ResolveNamedRange(hdrName)
    Dim myHeaderText As String
    myHeaderText = IIf(rngHdr Is Nothing, loSrc.Name, CStr(rngHdr.Cells(1, 1).value))

    If Not HandleHeaderToggle(hdrCell, myHeaderText) Then GoTo Finally

    MetaSet META_PREFIX & "ActiveKind", "Stage"
    MetaSet META_PREFIX & "ActiveTable", loSrc.Name

    hdrCell.value = myHeaderText

    Dim below As Range: Set below = CellBelowHeader(hdrCell)
    Do While IsInsideAnyListObject(below): Set below = below.Offset(1, 0): Loop

    loSrc.Range.Cut Destination:=below
    Application.CutCopyMode = False
    GoTo Finally

FAIL:
    MsgBox "Открыть_Таблицу_Этапа_по_Шаблону: " & Err.Number & " — " & Err.Description, vbCritical
Finally:
    RestoreApp
End Sub

' ---------- КНОПКА: Открыть "Таблицу всех этапов" ----------
Public Sub Открыть_Таблицу_Всех_Этапов()
    SaveApp
    On Error GoTo FAIL

    Dim hdrCell As Range
    Set hdrCell = GetHeaderCellStrict()

    ' если открыт редактор — завершить (Да/Нет); при неуспешном сохранении — не продолжаем
    If Not GuardEditorOpen_AndCloseIfNeeded(hdrCell) Then GoTo Finally

    ' Ищем таблицу результата
    Dim loSrc As ListObject
    Set loSrc = FindListObjectGlobal("Таблица_всех_этапов")
    If loSrc Is Nothing Then
        Err.Raise 1002, , "Не найдена таблица с результатом списка этапов 'Таблица_всех_этапов'."
    End If

    ' Заголовок: сперва пробуем "Заголовок_Список_Этапов",
    ' потом стандартный "Заголовок_" & <имя таблицы>, иначе используем имя таблицы
    Dim rngHdr As Range
    Dim myHeaderText As String
    Dim hdrName As String

    Set rngHdr = ResolveNamedRange("Заголовок_Список_Этапов")
    If rngHdr Is Nothing Then
        hdrName = STAGE_HDR_PREFIX & loSrc.Name          ' "Заголовок_" & loSrc.Name
        Set rngHdr = ResolveNamedRange(hdrName)
    End If

    If rngHdr Is Nothing Then
        myHeaderText = loSrc.Name
    Else
        myHeaderText = CStr(rngHdr.Cells(1, 1).value)
    End If

    ' Переключатель: если сейчас уже показана эта же таблица — просто скрываем её
    If Not HandleHeaderToggle(hdrCell, myHeaderText) Then GoTo Finally

    ' ВАЖНО: обновляем запрос ТОЛЬКО когда реально показываем таблицу на Дорожной карте
    RefreshAllStagesQuerySafe

    MetaSet META_PREFIX & "ActiveKind", "Stage"
    MetaSet META_PREFIX & "ActiveTable", loSrc.Name

    hdrCell.value = myHeaderText

    Dim below As Range
    Set below = CellBelowHeader(hdrCell)
    Do While IsInsideAnyListObject(below)
        Set below = below.Offset(1, 0)
    Loop

    loSrc.Range.Cut Destination:=below
    Application.CutCopyMode = False
    GoTo Finally

FAIL:
    MsgBox "Открыть_Таблицу_Всех_Этапов: " & Err.Number & " — " & Err.Description, vbCritical
Finally:
    RestoreApp
End Sub


' ---------- Переключатель/возврат ----------
Private Function HandleHeaderToggle(ByVal hdrCell As Range, ByVal newHeaderText As String) As Boolean
    Dim cur As String: cur = Trim$(CStr(hdrCell.Value2))
    If Len(cur) = 0 Then HandleHeaderToggle = True: Exit Function

    ReturnActiveBlockSafe cur

    If StrComp(cur, newHeaderText, vbTextCompare) = 0 Then
        hdrCell.value = "": HandleHeaderToggle = False     ' повторное нажатие — просто очистили
    Else
        hdrCell.value = "": HandleHeaderToggle = True      ' смена блока — очищаем и продолжаем
    End If
End Function

Private Sub ReturnActiveBlockSafe(ByVal currentHeaderText As String)
    On Error Resume Next
    ResetRowHighlight_Public
    Dim hdrCell As Range: Set hdrCell = GetHeaderCellStrict()
    Dim loShown As ListObject: Set loShown = TryGetListObjectAt(hdrCell.Offset(1, 0))
    If loShown Is Nothing Then GoTo CLR_META

    Dim kind As String: kind = MetaGet(META_PREFIX & "ActiveKind")
    Dim tbl  As String: tbl = MetaGet(META_PREFIX & "ActiveTable")

    If Len(kind) = 0 Or Len(tbl) = 0 Then
        Dim idHdr As Range: Set idHdr = ResolveNamedRange(ID_HEADER_NAME)
        If Not idHdr Is Nothing And _
           StrComp(Trim$(CStr(idHdr.Cells(1, 1).value)), Trim$(currentHeaderText), vbTextCompare) = 0 Then
            kind = "ID": tbl = ID_TABLE_NAME
        Else
            kind = "Stage": tbl = loShown.Name
        End If
    End If

    Dim wsHome As Worksheet, anchor As Range
    If StrComp(kind, "ID", vbTextCompare) = 0 Then
        Dim idHeader As Range: Set idHeader = ResolveNamedRange(ID_HEADER_NAME)
        If Not idHeader Is Nothing Then
            Set wsHome = idHeader.Worksheet
            Set anchor = idHeader.Cells(1, 1).Offset(idHeader.rows.Count, 0)
        Else
            Set wsHome = SheetStrict(SVC_SHEET)
            Set anchor = NextFreeCell(wsHome)
        End If
    Else
        Dim stageHdr As Range

        ' Сначала стандартное имя: "Заголовок_" & <имя таблицы>
        Set stageHdr = ResolveNamedRange(STAGE_HDR_PREFIX & tbl)

        ' Спец-случай: агрегированная таблица всех этапов,
        ' заголовок может называться "Заголовок_Список_Этапов"
        If stageHdr Is Nothing Then
            Set stageHdr = ResolveNamedRange("Заголовок_Список_Этапов")
        End If

        If Not stageHdr Is Nothing Then
            Set wsHome = stageHdr.Worksheet
            Set anchor = stageHdr.Cells(1, 1).Offset(stageHdr.rows.Count, 0)
        Else
            Set wsHome = SheetStrict(SVC_SHEET)
            Set anchor = NextFreeCell(wsHome)
        End If
    End If

    If anchor.MergeCells Then Set anchor = anchor.MergeArea.Cells(1, 1)
    Set anchor = EnsureRoomRightAnchor(wsHome, anchor, loShown.Range.rows.Count, loShown.Range.Columns.Count, loShown.Name)

    loShown.Range.Cut Destination:=anchor
    Application.CutCopyMode = False

CLR_META:
    hdrCell.value = ""
    MetaDel META_PREFIX & "ActiveKind"
    MetaDel META_PREFIX & "ActiveTable"
End Sub
' ---------- Возврат отображаемого блока перед автозагрузкой ----------
' Вызывается из модуля автозагрузки.
' Если в области "Отображение" сейчас показан этап / таблица ID /
' "Таблица_всех_этапов" — возвращает её на родной лист.
Public Sub Вернуть_Отображаемый_Блок_Если_Нужно()
    Dim hdrCell As Range
    Dim cur As String

    On Error Resume Next
    Set hdrCell = GetHeaderCellStrict()  ' ячейка с именем "Отображение"
    On Error GoTo 0

    If hdrCell Is Nothing Then Exit Sub

    cur = Trim$(CStr(hdrCell.Value2))
    If Len(cur) = 0 Then Exit Sub        ' ничего не показано — делать нечего

    ' Используем ту же логику, что и у кнопок (возврат блока домой)
    ReturnActiveBlockSafe cur
End Sub


' ---------- ГАРД редактора: завершить (Да/Нет) и решить — можно ли продолжать ----------
' True  — область показа свободна, можно открывать ID/Этап.
' False — сохранять не удалось (например, дубль имени этапа) > выходим из кнопки.
Private Function GuardEditorOpen_AndCloseIfNeeded(ByVal hdrCell As Range) As Boolean
    Dim loEditor As ListObject
    Dim resp As VbMsgBoxResult
    Dim ok As Boolean

    GuardEditorOpen_AndCloseIfNeeded = True

    ' Ищем любой View редактора на ЭТОМ листе
    Set loEditor = FindEditorViewOnSheet(hdrCell.Worksheet)
    If loEditor Is Nothing Then Exit Function      ' редактор не открыт — всё ок

    ' Редактор найден > спрашиваем, что делать
    resp = MsgBox("У вас открыт редактор. Сохранить изменения?", _
                  vbExclamation + vbYesNo, "Редактор шаблона")

    If resp = vbYes Then
        ' Пытаемся сохранить; при ошибке (дубль имени и т.п.) — дальше НЕ идём
        On Error Resume Next
        ok = Сохранить_Шаблон()
        On Error GoTo 0
        If Not ok Then
            GuardEditorOpen_AndCloseIfNeeded = False
            Exit Function
        End If
        ' Сохранить_Шаблон сам удаляет View редактора и чистит область
    Else
        ' Закрыть без сохранения; процедура сама чистит область под редактором
        On Error Resume Next
        Закрыть_Редактор_Без_Сохранения
        On Error GoTo 0
    End If
End Function

' Ищет любой View редактора (Вид_Редактор_*) на заданном листе.
Private Function FindEditorViewOnSheet(ByVal ws As Worksheet) As ListObject
    Dim lo As ListObject
    For Each lo In ws.ListObjects
        If Left$(lo.Name, Len(ED_VIEW_PREFIX)) = ED_VIEW_PREFIX Then
            Set FindEditorViewOnSheet = lo
            Exit Function
        End If
    Next lo
End Function

' ---------- Обновление Power Query для списка этапов ----------
' Обновляет запрос, который грузится в таблицу "Таблица_всех_этапов",
' без изменения ширины столбцов.
Private Sub RefreshAllStagesQuerySafe()
    Dim lo As ListObject

    On Error Resume Next

    Set lo = FindListObjectGlobal("Таблица_всех_этапов")
    If Not lo Is Nothing Then
        ' Если таблица привязана к Power Query, у неё есть QueryTable.
        ' Отключаем автоизменение ширины и обновляем.
        With lo.QueryTable
            .AdjustColumnWidth = False
            .Refresh BackgroundQuery:=False
        End With
    End If

    On Error GoTo 0
End Sub


' ===== УТИЛИТЫ =====
Private Function GetHeaderCellStrict() As Range
    Dim r As Range: Set r = ResolveNamedRange(TARGET_NAME)
    If r Is Nothing Then Err.Raise 9, , "Не найдено имя '" & TARGET_NAME & "'."
    If r.MergeCells Then Set r = r.MergeArea.Cells(1, 1) Else Set r = r.Cells(1, 1)
    If r.Cells.CountLarge <> 1 Then Err.Raise 32768, , "'" & TARGET_NAME & "' должна быть ОДНОЙ ячейкой."
    Set GetHeaderCellStrict = r
End Function

Private Function CellBelowHeader(ByVal hdrCell As Range) As Range
    Dim base As Range
    If hdrCell.MergeCells Then Set base = hdrCell.MergeArea.Cells(hdrCell.MergeArea.rows.Count, 1) Else Set base = hdrCell
    Set CellBelowHeader = base.Offset(1, 0)
End Function

Private Function GetNamedText(ByVal nm As String) As String
    Dim r As Range: Set r = ResolveNamedRange(nm)
    If r Is Nothing Then GetNamedText = "" Else GetNamedText = CStr(r.value)
End Function

Private Function ResolveNamedRange(ByVal nm As String) As Range
    On Error Resume Next
    Set ResolveNamedRange = ThisWorkbook.names(nm).RefersToRange
    On Error GoTo 0
    If ResolveNamedRange Is Nothing Then
        Dim ws As Worksheet, rr As Range
        For Each ws In ThisWorkbook.Worksheets
            On Error Resume Next
            Set rr = ws.names(nm).RefersToRange
            On Error GoTo 0
            If Not rr Is Nothing Then Set ResolveNamedRange = rr: Exit For
        Next ws
    End If
End Function

Private Function SheetStrict(ByVal nm As String) As Worksheet
    On Error GoTo FAIL
    Set SheetStrict = ThisWorkbook.Worksheets(nm)
    Exit Function
FAIL:
    Err.Raise 9, , "Лист не найден: " & nm
End Function

Private Function FindListObjectGlobal(ByVal loName As String) As ListObject
    Dim ws As Worksheet, lo As ListObject
    For Each ws In ThisWorkbook.Worksheets
        For Each lo In ws.ListObjects
            If StrComp(lo.Name, loName, vbTextCompare) = 0 Then Set FindListObjectGlobal = lo: Exit Function
        Next lo
    Next ws
End Function

Private Function TryGetListObjectAt(ByVal cell As Range) As ListObject
    Dim lo As ListObject
    For Each lo In cell.Worksheet.ListObjects
        If Not Application.Intersect(cell, lo.Range) Is Nothing Then Set TryGetListObjectAt = lo: Exit Function
    Next lo
End Function

Private Function IsInsideAnyListObject(ByVal cell As Range) As Boolean
    Dim lo As ListObject
    For Each lo In cell.Worksheet.ListObjects
        If Not Application.Intersect(cell, lo.Range) Is Nothing Then IsInsideAnyListObject = True: Exit Function
    Next lo
End Function

Private Function NextFreeCell(ByVal ws As Worksheet) As Range
    Dim lastRow As Long
    If Application.WorksheetFunction.CountA(ws.Cells) = 0 Then
        lastRow = 1
    Else
        lastRow = ws.UsedRange.rows(ws.UsedRange.rows.Count).Row + 2
    End If
    Set NextFreeCell = ws.Cells(lastRow, 1)
End Function

Private Function EnsureRoomRightAnchor(ByVal ws As Worksheet, ByVal homeCell As Range, _
                                       ByVal needRows As Long, ByVal needCols As Long, _
                                       ByVal loName As String) As Range
    Dim cur As Range: Set cur = homeCell
    Dim tries As Long: tries = 0
    Do
        tries = tries + 1
        If tries > 500 Then Err.Raise 1004, , "Не удалось подготовить место под таблицу '" & loName & "'."
        If cur.MergeCells Then Set cur = cur.MergeArea.Cells(1, 1)

        If IsInsideAnyListObject(cur) Then
            ws.Columns(cur.Column).Insert
            Set cur = ws.Cells(cur.Row, cur.Column)
            GoTo CONT
        End If

        Dim dest As Range: Set dest = ws.Range(cur, cur.Offset(needRows - 1, needCols - 1))
        Dim lo As ListObject, hit As Boolean: hit = False
        For Each lo In ws.ListObjects
            If Not Application.Intersect(dest, lo.Range) Is Nothing Then
                ws.Columns(dest.Columns(dest.Columns.Count).Column + 1).Insert
                Set cur = ws.Cells(cur.Row, cur.Column)
                hit = True: Exit For
            End If
        Next lo
        If Not hit Then Exit Do
CONT:
    Loop
    Set EnsureRoomRightAnchor = cur
End Function

' ===== МЕТА =====
Private Sub MetaSet(ByVal key As String, ByVal val As String)
    Dim txt As String: txt = "=""" & Replace(val, """", """""") & """"
    On Error Resume Next
    If Not ThisWorkbook.names(key) Is Nothing Then
        ThisWorkbook.names(key).refersTo = txt
        ThisWorkbook.names(key).Visible = False
    Else
        Dim nm As Name: Set nm = ThisWorkbook.names.Add(Name:=key, refersTo:=txt)
        nm.Visible = False
    End If
    On Error GoTo 0
End Sub

Private Function MetaGet(ByVal key As String) As String
    On Error Resume Next
    Dim s As String: s = ThisWorkbook.names(key).refersTo
    On Error GoTo 0
    If Left$(s, 2) = "=""" And Right$(s, 1) = """" Then MetaGet = Mid$(s, 3, Len(s) - 3) Else MetaGet = ""
End Function

Private Sub MetaDel(ByVal key As String)
    On Error Resume Next
    ThisWorkbook.names(key).Delete
    On Error GoTo 0
End Sub

' Локалка, чтобы не ловить зависимость от другого модуля
Private Function SanitizeName(ByVal s As String) As String
    Dim t As String: t = ""
    Dim i As Long, ch As String
    For i = 1 To Len(s)
        ch = Mid$(s, i, 1)
        If ch Like "[A-Za-zА-Яа-я0-9_ -]" Then t = t & ch
    Next i
    Do While InStr(t, "  ") > 0: t = Replace(t, "  ", " "): Loop
    SanitizeName = Replace(t, " ", "_")
End Function

' ===== Сохранение/восстановление Excel =====
Private Sub SaveApp()
    mScreenUpdating = Application.ScreenUpdating
    mEnableEvents = Application.EnableEvents
    mDisplayAlerts = Application.DisplayAlerts
    mCalcMode = Application.Calculation
    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Application.DisplayAlerts = False
    Application.Calculation = xlCalculationManual
End Sub

Private Sub RestoreApp()
    Application.ScreenUpdating = mScreenUpdating
    Application.EnableEvents = mEnableEvents
    Application.DisplayAlerts = mDisplayAlerts
    Application.Calculation = mCalcMode
End Sub

' ---- АЛИАСЫ ДЛЯ КНОПОК ----
Public Sub ОткрытьТаблицуЭтапаПоШаблону()
    Открыть_Таблицу_Этапа_по_Шаблону
End Sub

Public Sub ОткрытьТаблицуID()
    Открыть_Таблицу_ID
End Sub

Public Sub ОткрытьВсеЭтапы()
    Открыть_Таблицу_Всех_Этапов
End Sub


