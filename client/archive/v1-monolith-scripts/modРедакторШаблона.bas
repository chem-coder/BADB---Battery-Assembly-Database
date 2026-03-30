Attribute VB_Name = "modРедакторШаблона"
' ===========================
'  modРедакторШаблона.bas
' ===========================
Option Explicit

' ---- НАСТРОЙКИ ----
Private Const SVC_SHEET        As String = "Служебный_лист"
Private Const TARGET_NAME      As String = "Отображение"
Private Const META_PREFIX      As String = "__meta_BLOCK_"
Private Const STAGE_HEADER_ROW As Long = 6   ' строка заголовков Этап_ на Служебный_лист

' Источник редактора
Private Const ED_TABLE_SRC     As String = "Таблица_Редактор_создания_шаблона"
Private Const ED_HEADER_NAME   As String = "Заголовок_Редактор_создания_шаблона"
Private Const ED_FALLBACK      As String = "Редактор создания шаблона этапа"
Private Const ED_VIEW_PREFIX   As String = "Вид_Редактор_"

' Для возврата ID
Private Const ID_TABLE_NAME    As String = "Таблица_с_описанием_ID"
Private Const ID_HEADER_NAME   As String = "Заголовок_Таблица_с_описанием_ID"

' ---- состояние Excel ----
Private mScreenUpdating As Boolean, mEnableEvents As Boolean, mDisplayAlerts As Boolean
Private mCalcMode As XlCalculation

' ========================= ОТКРЫТЬ РЕДАКТОР =========================
Public Sub Открыть_Редактор_Создания_Шаблона()
    SaveApp
    On Error GoTo FAIL

    Dim hdr As Range: Set hdr = GetHeaderCellStrict()

    ' если уже что-то выведено — обработать (ID/Этап вернуть, редактор: спросить Да/Нет)
    If Not PreSwitchEditor(hdr) Then GoTo Finally

    Dim loSrc As ListObject: Set loSrc = FindListObjectGlobal(ED_TABLE_SRC)
    If loSrc Is Nothing Then Err.Raise 1002, , "Не найдена таблица '" & ED_TABLE_SRC & "'."

    Dim rHdr As Range: Set rHdr = ResolveNamedRange(ED_HEADER_NAME)
    hdr.value = IIf(rHdr Is Nothing, ED_FALLBACK, CStr(rHdr.Cells(1, 1).value))

    ' безопасно создаём View (копируются формулы, форматы, проверки данных)
    Dim loView As ListObject
    If Not TryCreateEditorView(hdr, loSrc, loView) Or loView Is Nothing Then
        Err.Raise 1004, , "Не удалось подготовить место под редактор: пересечение с таблицами не устранено."
    End If

    ' На всякий случай даём уникальное имя (если уже присвоено — попытка мягкая)
    On Error Resume Next
    loView.Name = UniqueEditorViewName(hdr.Worksheet, ED_VIEW_PREFIX)
    loView.TableStyle = loSrc.TableStyle
    On Error GoTo 0

    ' мета
    MetaSet META_PREFIX & "ActiveKind", "Editor"
    MetaSet META_PREFIX & "ActiveTable", loView.Name
    MetaSet META_PREFIX & "EditorRectSheet", hdr.Worksheet.Name
    MetaSet META_PREFIX & "EditorRectAddr", loView.Range.Address(False, False)
    MetaDel META_PREFIX & "HomeSheet"
    MetaDel META_PREFIX & "HomeAddr"

    GoTo Finally
FAIL:
    MsgBox "Открыть_Редактор_Создания_Шаблона: " & Err.Number & " - " & Err.Description, vbCritical
Finally:
    RestoreApp
End Sub

' ========================= СОХРАНИТЬ ШАБЛОН (для кнопки) =========================
Public Sub СохранитьШаблон()
    Call Сохранить_Шаблон
End Sub

' ========================= СОХРАНИТЬ ШАБЛОН (логика) =========================
' Возвращает True при успехе (для вызова из другого модуля).
Public Function Сохранить_Шаблон() As Boolean
    Сохранить_Шаблон = False

    ' На всякий случай глушим авто-реакцию modPQ (анти-дребезг + OnTime)
    On Error Resume Next
    modPQ.AutoRefreshOff
    modPQ.Reset
    On Error GoTo 0

    SaveApp
    On Error GoTo FAIL

    Dim hdr As Range: Set hdr = GetHeaderCellStrict()

    ' Находим View редактора
    Dim loView As ListObject: Set loView = FindEditorView(hdr)
    If loView Is Nothing Then
        MsgBox "Сначала откройте 'Редактор создания шаблона этапа'.", vbInformation
        GoTo Finally
    End If

    ' 1) Название этапа
    Dim idx As Long: idx = FindColumnIndexByHeader(loView, "Название этапа")
    If idx = 0 Then Err.Raise 2001, , "В редакторе отсутствует столбец 'Название этапа'."
    Dim stageRaw As String: stageRaw = Trim$(CStr(loView.DataBodyRange.Cells(1, idx).value))
    If Len(stageRaw) = 0 Then
        MsgBox "Введите значение в поле 'Название этапа' перед сохранением.", vbExclamation
        GoTo Finally
    End If

    ' --- НОВАЯ ЛОГИКА ИМЕНИ ---
    Dim tailRaw As String: tailRaw = stageRaw
    If LCase$(Left$(tailRaw, 5)) = LCase$("Этап_") Then tailRaw = Mid$(tailRaw, 6)

    Dim stageHeader As String: stageHeader = "Этап_" & tailRaw
    Dim stageName   As String: stageName = "Этап_" & SanitizeName(tailRaw)

    ' Жёсткая проверка дубликата
    If Not FindListObjectGlobal(stageName) Is Nothing Then
        MsgBox "Таблица '" & stageName & "' уже существует. Измените 'Название этапа'.", vbExclamation
        GoTo Finally
    End If
    ' --- /НОВАЯ ЛОГИКА ИМЕНИ ---

    ' 2) Заголовок и якорь на служебном
    Dim wsSvc As Worksheet: Set wsSvc = SheetStrict(SVC_SHEET)
    Dim headerRow As Long
    Dim anchorHdr As Range: Set anchorHdr = NextStageHeaderAnchor(wsSvc, headerRow)
    anchorHdr.value = stageHeader

    On Error Resume Next
    ThisWorkbook.names("Заголовок_" & stageName).Delete
    On Error GoTo 0
    ThisWorkbook.names.Add Name:="Заголовок_" & stageName, _
        refersTo:="=" & anchorHdr.Address(True, True, xlA1, True)

    ' 3) Копирование шаблона
    Dim src As Range: Set src = loView.Range
    Dim destTopLeft As Range: Set destTopLeft = wsSvc.Cells(anchorHdr.Row + 1, anchorHdr.Column)
    Set destTopLeft = EnsureRoomRightAnchor(wsSvc, destTopLeft, src.rows.Count, src.Columns.Count, stageName)
    Dim dest As Range: Set dest = wsSvc.Range(destTopLeft, destTopLeft.Offset(src.rows.Count - 1, src.Columns.Count - 1))

    src.Copy
    dest.PasteSpecial xlPasteFormulasAndNumberFormats
    dest.PasteSpecial xlPasteFormats
    On Error Resume Next
    dest.PasteSpecial xlPasteValidation
    On Error GoTo 0
    Application.CutCopyMode = False

    Dim k As Long
    For k = 1 To src.Columns.Count
        dest.Columns(k).ColumnWidth = src.Columns(k).ColumnWidth
    Next k

    Dim loNew As ListObject
    Set loNew = wsSvc.ListObjects.Add(xlSrcRange, dest, , xlYes)
    On Error Resume Next
    loNew.Name = stageName
    Dim loTpl As ListObject: Set loTpl = FindListObjectGlobal(ED_TABLE_SRC)
    If Not loTpl Is Nothing Then loNew.TableStyle = loTpl.TableStyle
    On Error GoTo 0

    ' 4) Очистка экрана редактирования
    loView.Delete
    hdr.value = ""
    ClearEditorArea hdr

    ' Мета очистка
    MetaDel META_PREFIX & "ActiveKind"
    MetaDel META_PREFIX & "ActiveTable"
    MetaDel META_PREFIX & "HomeSheet"
    MetaDel META_PREFIX & "HomeAddr"
    MetaDel META_PREFIX & "EditorRectSheet"
    MetaDel META_PREFIX & "EditorRectAddr"

    MsgBox "Сохранён шаблон этапа: " & stageHeader, vbInformation
    Сохранить_Шаблон = True

    GoTo Finally

FAIL:
    MsgBox "Сохранить_Шаблон: " & Err.Number & " — " & Err.Description, vbCritical

Finally:
    RestoreApp

    ' Если реально сохранили — один жёсткий прогон запросов без моргания экрана
    If Сохранить_Шаблон Then
        On Error Resume Next
        ProtectAllStagesColumnWidths
        modPQ.TriggerAfterTemplateSave   ' внутри просто RunRefresh с анти-дребезгом
        On Error GoTo 0
    End If

    ' В любом случае — вернуть автоматику PQ
    On Error Resume Next
    modPQ.AutoRefreshOn
    On Error GoTo 0
End Function

' Отключает авто-подгон ширины для таблицы "Таблица_всех_этапов",
' чтобы Refresh не менял ширину столбцов.
Private Sub ProtectAllStagesColumnWidths()
    Dim lo As ListObject

    On Error Resume Next
    Set lo = FindListObjectGlobal("Таблица_всех_этапов")
    If Not lo Is Nothing Then
        With lo.QueryTable
            .AdjustColumnWidth = False
        End With
    End If
    On Error GoTo 0
End Sub

' ========================= ЗАКРЫТЬ РЕДАКТОР БЕЗ СОХРАНЕНИЯ =========================
Public Sub Закрыть_Редактор_Без_Сохранения()
    SaveApp
    On Error Resume Next
    Dim hdr As Range: Set hdr = GetHeaderCellStrict()
    Dim loView As ListObject: Set loView = FindEditorView(hdr)
    If Not loView Is Nothing Then
        Dim addr As String: addr = loView.Range.Address(False, False)
        loView.Delete
        hdr.Worksheet.Range(addr).ClearContents
        hdr.Worksheet.Range(addr).Borders.LineStyle = xlLineStyleNone
    End If
    hdr.value = ""
    ClearEditorArea hdr
    MetaDel META_PREFIX & "ActiveKind"
    MetaDel META_PREFIX & "ActiveTable"
    MetaDel META_PREFIX & "EditorRectSheet"
    MetaDel META_PREFIX & "EditorRectAddr"
    On Error GoTo 0
    RestoreApp
End Sub

' ========================= ПРЕДПЕРЕКЛЮЧАТЕЛЬ =========================
' True — можно открывать новый редактор
' False — операция отменена (повторное нажатие: сохранён/закрыт и НЕ открываем заново)
Private Function PreSwitchEditor(ByVal hdr As Range) As Boolean
    Dim curText As String: curText = Trim$(CStr(hdr.Value2))
    Dim activeKind As String: activeKind = MetaGet(META_PREFIX & "ActiveKind")
    Dim loShown As ListObject: Set loShown = GetShownListObject(hdr, 16)

    If Len(curText) = 0 And loShown Is Nothing And Len(activeKind) = 0 Then
        PreSwitchEditor = True: Exit Function
    End If

    If Len(activeKind) = 0 And Not loShown Is Nothing Then
        If StrComp(loShown.Name, ID_TABLE_NAME, vbTextCompare) = 0 Then
            activeKind = "ID"
        ElseIf Left$(loShown.Name, 5) = "Этап_" Then
            activeKind = "Stage"
        ElseIf Left$(loShown.Name, Len(ED_VIEW_PREFIX)) = ED_VIEW_PREFIX Then
            activeKind = "Editor"
        Else
            activeKind = "Unknown"
        End If
    End If

    Select Case UCase$(activeKind)
        Case "ID", "STAGE"
            If Not loShown Is Nothing Then ReturnCutBlock2 loShown
            hdr.value = ""
            PreSwitchEditor = True

        Case "EDITOR"
            Dim resp As VbMsgBoxResult
            resp = MsgBox("У вас есть несохранённые изменения редактора. Сохранить?", vbExclamation + vbYesNo)
            If resp = vbYes Then
                If Not Сохранить_Шаблон() Then
                    PreSwitchEditor = False
                Else
                    PreSwitchEditor = False ' по ТЗ новый редактор не открываем
                End If
            Else
                Закрыть_Редактор_Без_Сохранения
                PreSwitchEditor = False
            End If

        Case Else
            PreSwitchEditor = True
    End Select
End Function

' ========================= ПОИСК VIEW РЕДАКТОРА =========================
Private Function FindEditorView(ByVal hdr As Range) As ListObject
    ' 1) по мета-прямоугольнику
    Dim rect As Range: Set rect = GetEditorRectFromMeta(hdr.Worksheet)
    Dim lo As ListObject
    If Not rect Is Nothing Then
        For Each lo In hdr.Worksheet.ListObjects
            If Not Application.Intersect(lo.Range, rect) Is Nothing _
               And Left$(lo.Name, Len(ED_VIEW_PREFIX)) = ED_VIEW_PREFIX Then
                Set FindEditorView = lo: Exit Function
            End If
        Next lo
    End If
    ' 2) по положению под заголовком
    Set FindEditorView = FindEditorViewUnderHeader(hdr, 300)
End Function

Private Function FindEditorViewUnderHeader(ByVal hdr As Range, ByVal rowsWindow As Long) As ListObject
    Dim lo As ListObject
    Set FindEditorViewUnderHeader = Nothing
    Set lo = GetShownListObject(hdr, rowsWindow)
    If Not lo Is Nothing Then
        If Left$(lo.Name, Len(ED_VIEW_PREFIX)) = ED_VIEW_PREFIX Then Set FindEditorViewUnderHeader = lo
    End If
End Function

' ========================= ВОЗВРАТ ID/ЭТАП «ДОМОЙ» =========================
Private Sub ReturnCutBlock2(ByVal lo As ListObject)
    Dim wsHome As Worksheet, anchor As Range
    Dim hdrSrc As Range

    If StrComp(lo.Name, ID_TABLE_NAME, vbTextCompare) = 0 Then
        Set hdrSrc = ResolveNamedRange(ID_HEADER_NAME)
    Else
        Set hdrSrc = ResolveNamedRange("Заголовок_" & lo.Name)
    End If

    If hdrSrc Is Nothing Then
        Set wsHome = SheetStrict(SVC_SHEET)
        Set anchor = ED_NextFreeCell(wsHome)
    Else
        Set wsHome = hdrSrc.Worksheet
        Set anchor = hdrSrc.Offset(hdrSrc.rows.Count, 0).Cells(1, 1)
    End If

    Set anchor = EnsureRoomRightAnchor(wsHome, anchor, lo.Range.rows.Count, lo.Range.Columns.Count, lo.Name)
    lo.Range.Cut Destination:=anchor
    Application.CutCopyMode = False
End Sub

' ========================= HELPER: СОЗДАТЬ VIEW БЕЗ ОШИБОК =========================
Private Function TryCreateEditorView(ByVal hdr As Range, ByVal loSrc As ListObject, ByRef loView As ListObject) As Boolean
    TryCreateEditorView = False

    Dim src As Range: Set src = loSrc.Range
    Dim tryRow As Range: Set tryRow = FirstFreeBelow(hdr)

    Dim attempt As Long
    For attempt = 1 To 120
        Dim dest As Range
        Set dest = tryRow.Resize(src.rows.Count, src.Columns.Count)

        ' если пересекается с существующими таблицами — спускаемся ниже
        If RectIntersectsAnyListObject(dest) Then
            Set tryRow = tryRow.Offset(1, 0)
            GoTo CONT
        End If

        ' 1) Сохраняем текущую ширину колонок в зоне dest
        Dim j As Long
        Dim widths() As Double
        ReDim widths(1 To src.Columns.Count)
        For j = 1 To src.Columns.Count
            widths(j) = dest.Columns(j).ColumnWidth
        Next j

        ' 2) Копируем формулы + форматы + валидации (БЕЗ изменения ширины)
        src.Copy
        dest.PasteSpecial xlPasteFormulasAndNumberFormats
        dest.PasteSpecial xlPasteFormats
        On Error Resume Next
        dest.PasteSpecial xlPasteValidation
        On Error GoTo 0
        Application.CutCopyMode = False

        ' 3) Создаём таблицу-представление
        On Error Resume Next
        Set loView = hdr.Worksheet.ListObjects.Add(xlSrcRange, dest, , xlYes)
        Dim e As Long: e = Err.Number
        On Error GoTo 0

        If e = 0 And Not loView Is Nothing Then
            ' 4) ВОЗВРАЩАЕМ исходную ширину колонок
            On Error Resume Next
            For j = 1 To src.Columns.Count
                dest.Columns(j).ColumnWidth = widths(j)
            Next j
            On Error GoTo 0

            ' стиль и имя
            On Error Resume Next
            loView.Name = ED_VIEW_PREFIX & Format(Now, "yyyymmdd_hhnnss")
            loView.TableStyle = loSrc.TableStyle
            On Error GoTo 0

            TryCreateEditorView = True
            Exit Function
        Else
            ' если создать таблицу не удалось — чистим прямоугольник и пробуем ниже
            dest.ClearContents
            dest.Borders.LineStyle = xlLineStyleNone
            Set tryRow = tryRow.Offset(1, 0)
        End If
CONT:
    Next attempt
End Function



' ========================= ВСПОМОГАТЕЛЬНЫЕ =========================
Private Function UniqueEditorViewName(ByVal ws As Worksheet, ByVal prefix As String) As String
    Dim base As String: base = prefix & Format(Now, "yyyymmdd_hhnnss")
    Dim i As Long, candidate As String, exists As Boolean
    For i = 1 To 999
        candidate = base & "_" & Format(i, "000")
        exists = False
        Dim lo As ListObject
        For Each lo In ws.ListObjects
            If StrComp(lo.Name, candidate, vbTextCompare) = 0 Then exists = True: Exit For
        Next lo
        If Not exists Then UniqueEditorViewName = candidate: Exit Function
    Next i
    UniqueEditorViewName = base & "_999"
End Function

' Освобождает прямоугольник под редактор "без вставок": просто ищет окно ниже.
Private Function EnsureEditorSpace_NoInsert(ByVal hdr As Range, ByVal needRows As Long, ByVal needCols As Long) As Range
    Dim ws As Worksheet: Set ws = hdr.Worksheet
    Dim startCell As Range: Set startCell = FirstFreeBelow(hdr)
    Dim r As Long
    For r = 0 To 300
        Dim tl As Range: Set tl = startCell.Offset(r, 0)
        If tl.MergeCells Then Set tl = tl.MergeArea.Cells(1, 1)
        Dim dest As Range: Set dest = ws.Range(tl, tl.Offset(needRows - 1, needCols - 1))
        If Not RectIntersectsAnyListObject(dest) Then
            Set EnsureEditorSpace_NoInsert = dest
            Exit Function
        End If
    Next r
    ' если не нашли — вернём прямоугольник сразу под заголовком (даст понятную ошибку выше)
    Set EnsureEditorSpace_NoInsert = ws.Range(startCell, startCell.Offset(needRows - 1, needCols - 1))
End Function

Private Function RectIntersectsAnyListObject(ByVal rect As Range) As Boolean
    Dim lo As ListObject
    RectIntersectsAnyListObject = False
    For Each lo In rect.Worksheet.ListObjects
        If Not Application.Intersect(rect, lo.Range) Is Nothing Then
            RectIntersectsAnyListObject = True
            Exit Function
        End If
    Next lo
End Function

' ===== Очистка области редактора =====
Private Sub ClearEditorArea(ByVal hdr As Range)
    Dim sample As Range: Set sample = CellBelowHeader(hdr)
    Dim rect As Range: Set rect = GetEditorRectFromMeta(hdr.Worksheet)
    If rect Is Nothing Then Set rect = hdr.Worksheet.Range(sample, sample.Offset(300, 50))

    Dim lo As ListObject
    For Each lo In hdr.Worksheet.ListObjects
        If Left$(lo.Name, Len(ED_VIEW_PREFIX)) = ED_VIEW_PREFIX Then
            If Not Application.Intersect(lo.Range, rect) Is Nothing Then lo.Delete
        End If
    Next lo

    With rect
        .ClearContents
        .Borders.LineStyle = xlLineStyleNone
        .Interior.pattern = sample.Interior.pattern
        On Error Resume Next
        .Interior.Color = sample.Interior.Color
        .Interior.TintAndShade = sample.Interior.TintAndShade
        .Interior.PatternColor = sample.Interior.PatternColor
        .NumberFormat = sample.NumberFormat
        On Error GoTo 0
    End With
End Sub

Private Function GetEditorRectFromMeta(ByVal expectedWS As Worksheet) As Range
    Dim Sh As String: Sh = MetaGet(META_PREFIX & "EditorRectSheet")
    Dim ad As String: ad = MetaGet(META_PREFIX & "EditorRectAddr")
    On Error Resume Next
    If Len(Sh) > 0 And Len(ad) > 0 Then
        If StrComp(Sh, expectedWS.Name, vbTextCompare) = 0 Then Set GetEditorRectFromMeta = expectedWS.Range(ad)
    End If
    On Error GoTo 0
End Function

' ---- БАЗОВЫЕ УТИЛИТЫ ----
Private Function GetHeaderCellStrict() As Range
    Dim r As Range
    Set r = ResolveNamedRange(TARGET_NAME)
    If r Is Nothing Then Err.Raise 9, , "Не найдено имя '" & TARGET_NAME & "'."
    If r.Worksheet.Name = SVC_SHEET Then Err.Raise 1005, , "'Отображение' не должно быть на '" & SVC_SHEET & "'."
    If r.MergeCells Then Set r = r.MergeArea.Cells(1, 1)
    If r.Cells.CountLarge <> 1 Then Err.Raise 32768, , "'" & TARGET_NAME & "' должна быть одной ячейкой."
    Set GetHeaderCellStrict = r
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

Private Function GetShownListObject(ByVal hdr As Range, ByVal rowsWindow As Long) As ListObject
    Dim ws As Worksheet: Set ws = hdr.Worksheet
    Dim topRow As Long, botRow As Long
    topRow = CellBelowHeader(hdr).Row
    botRow = topRow + Application.Max(1, rowsWindow) - 1
    Dim lo As ListObject
    For Each lo In ws.ListObjects
        If Not Application.Intersect(lo.Range, ws.rows(topRow & ":" & botRow)) Is Nothing Then
            Set GetShownListObject = lo: Exit Function
        End If
    Next lo
End Function

Private Function CellBelowHeader(ByVal hdr As Range) As Range
    Dim base As Range
    If hdr.MergeCells Then Set base = hdr.MergeArea.Cells(1, 1) Else Set base = hdr
    Set CellBelowHeader = base.Offset(1, 0)
End Function

Private Function FirstFreeBelow(ByVal hdr As Range) As Range
    Dim c As Range: Set c = CellBelowHeader(hdr)
    Do While IsInsideAnyListObject(c): Set c = c.Offset(1, 0): Loop
    Set FirstFreeBelow = c
End Function

Private Function IsInsideAnyListObject(ByVal cell As Range) As Boolean
    Dim lo As ListObject
    For Each lo In cell.Worksheet.ListObjects
        If Not Application.Intersect(cell, lo.Range) Is Nothing Then IsInsideAnyListObject = True: Exit Function
        ' также учтём, если попали в заголовок таблицы
        If Not Application.Intersect(cell, lo.HeaderRowRange) Is Nothing Then IsInsideAnyListObject = True: Exit Function
    Next lo
End Function

Private Function EnsureRoomRightAnchor(ByVal ws As Worksheet, ByVal anchor As Range, _
                                       ByVal needRows As Long, ByVal needCols As Long, _
                                       ByVal tag As String) As Range
    Dim cur As Range: Set cur = anchor
    Dim tries As Long: tries = 0
    Do
        tries = tries + 1
        If tries > 500 Then Err.Raise 1004, , "Не удалось подготовить место под '" & tag & "'."
        If cur.MergeCells Then Set cur = cur.MergeArea.Cells(1, 1)

        If IsInsideAnyListObject(cur) Then
            ws.Columns(cur.Column).Insert
            Set cur = ws.Cells(cur.Row, cur.Column)
            GoTo CONT
        End If

        Dim dest As Range: Set dest = ws.Range(cur, cur.Offset(needRows - 1, needCols - 1))
        Dim hit As Boolean: hit = False
        Dim lo As ListObject
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

Private Function ED_NextFreeCell(ByVal ws As Worksheet) As Range
    Dim lastRow As Long
    If Application.WorksheetFunction.CountA(ws.Cells) = 0 Then
        lastRow = 1
    Else
        lastRow = ws.UsedRange.rows(ws.UsedRange.rows.Count).Row + 2
    End If
    Set ED_NextFreeCell = ws.Cells(lastRow, 1)
End Function

Private Function NextStageHeaderAnchor(ByVal ws As Worksheet, ByRef headerRow As Long) As Range
    Dim rightmostCol As Long: rightmostCol = 0
    Dim minHeaderRow As Long: minHeaderRow = 0

    Dim lo As ListObject
    Dim rc As Long
    Dim rHdr As Range
    Dim thisHdrRow As Long

    ' 1) Ищем все Этап_* на листе: максимум по правому краю и минимум по строке заголовка
    For Each lo In ws.ListObjects
        If StrComp(Left$(lo.Name, 5), "Этап_", vbTextCompare) = 0 Then
            rc = lo.Range.Column + lo.Range.Columns.Count - 1
            If rc > rightmostCol Then rightmostCol = rc

            thisHdrRow = 0
            On Error Resume Next
            Set rHdr = ResolveNamedRange("Заголовок_" & lo.Name)
            On Error GoTo 0

            If Not rHdr Is Nothing Then
                thisHdrRow = rHdr.Row
            Else
                ' Если имя заголовка не найдено — считаем, что он на строку выше таблицы
                thisHdrRow = Application.Max(1, lo.Range.Row - 1)
            End If

            If minHeaderRow = 0 Or thisHdrRow < minHeaderRow Then
                minHeaderRow = thisHdrRow
            End If
        End If
    Next lo

    ' 2) Учитываем любые фигуры (диаграммы, срезы, картинки и т.п.)
    '    Берём самый правый столбец по BottomRightCell.Column
    Dim shp As Shape
    On Error Resume Next
    For Each shp In ws.Shapes
        rc = 0
        rc = shp.BottomRightCell.Column
        If rc > rightmostCol Then rightmostCol = rc
    Next shp
    On Error GoTo 0

    ' 3) Выбор места под новый заголовок
    If rightmostCol = 0 Then
        ' Нет ни Этапов, ни фигур — стартуем с A1
        headerRow = 1
        Set NextStageHeaderAnchor = ws.Cells(1, 1)
    Else
        ' Все заголовки выравниваем по минимальной найденной строке
        If minHeaderRow <= 0 Then minHeaderRow = 1
        headerRow = minHeaderRow

        ' Новый заголовок — через ОДИН пустой столбец справа от самого правого объекта
        Set NextStageHeaderAnchor = ws.Cells(headerRow, rightmostCol + 2)
    End If
End Function




Private Function FindColumnIndexByHeader(ByVal lo As ListObject, ByVal headerText As String) As Long
    Dim i As Long
    For i = 1 To lo.HeaderRowRange.Columns.Count
        If StrComp(Trim$(CStr(lo.HeaderRowRange.Cells(1, i).value)), Trim$(headerText), vbTextCompare) = 0 Then
            FindColumnIndexByHeader = i: Exit Function
        End If
    Next i
End Function

Private Function SanitizeName(ByVal s As String) As String
    Dim t As String: t = ""
    Dim i As Long, ch As String
    For i = 1 To Len(s)
        ch = Mid$(s, i, 1)
        If ch Like "[A-Za-zА-Яа-я0-9_ -]" Then t = t & ch
    Next i
    Do While InStr(t, "  ") > 0
        t = Replace(t, "  ", " ")
    Loop
    SanitizeName = Replace(t, " ", "_")
End Function

' ---- МЕТА / состояние Excel ----
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

Private Sub SaveApp()
    mScreenUpdating = Application.ScreenUpdating
    mEnableEvents = Application.EnableEvents
    mDisplayAlerts = Application.DisplayAlerts
    mCalcMode = Application.Calculation

    ' Не трогаем ScreenUpdating, чтобы кнопки не исчезали визуально
    Application.EnableEvents = False
    Application.DisplayAlerts = False
    Application.Calculation = xlCalculationManual
End Sub

Private Sub RestoreApp()
    ' ScreenUpdating возвращаем в исходное значение (но мы его не меняли)
    Application.ScreenUpdating = mScreenUpdating
    Application.EnableEvents = mEnableEvents
    Application.DisplayAlerts = mDisplayAlerts
    Application.Calculation = mCalcMode
End Sub


' ---- АЛИАСЫ ДЛЯ КНОПОК ----
Public Sub ОткрытьРедакторСозданияШаблонаЭтапа()
    Открыть_Редактор_Создания_Шаблона
End Sub

Public Sub СохранитьШаблонЭтапа()
    Call Сохранить_Шаблон
End Sub


