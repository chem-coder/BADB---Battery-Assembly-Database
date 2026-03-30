Attribute VB_Name = "modAutoStageFill"
'=== modAutoStageFill ===
Option Explicit

' ========================= НАСТРОЙКИ =========================
Private Const LIMIT_SHEETS As Boolean = True
Private Const SHEET_A As String = "Дорожная_карта"
Private Const SHEET_B As String = "Служебный_лист"

' Формат даты/времени
Private Const WRITE_TIME As Boolean = True
Private Const DATE_FMT_LOCAL As String = "ДД\.ММ\.ГГГГ"
Private Const DATETIME_FMT_LOCAL As String = "ДД\.ММ\.ГГГГ, чч:мм"

' Название таблицы, где НЕ надо автозаполнять ID и дату
Private Const TEMPLATE_EDITOR_TABLE As String = "Таблица_Редактор_создания_шаблона"

' Если первую строку колонки названия не задали — берём хвост имени таблицы
Private Const ALWAYS_USE_TABLE_TAIL_FOR_NAME As Boolean = True


' ========================= ТОЧКА ВХОДА =========================
' Вызывается из ThisWorkbook.Workbook_SheetChange(Sh, Target)
Public Sub HandleChange(ByVal Sh As Object, ByVal Target As Range)
    On Error GoTo ExitSub
    If Target Is Nothing Then Exit Sub

    If LIMIT_SHEETS Then
        If Sh.Name <> SHEET_A And Sh.Name <> SHEET_B Then Exit Sub
    End If

    Dim lo As ListObject
    For Each lo In Sh.ListObjects
        If IsStageTable(lo) Then
            HandleStageTableChange lo, Target
        ElseIf IsIDDescriptionTable(lo) Then
            HandleIDDescrTableChange lo, Target
        End If
    Next lo

ExitSub:
End Sub


' ========================= РАСПОЗНАВАНИЕ ТАБЛИЦ =========================

Private Function NormalizeHeader(ByVal s As String) As String
    Dim t As String: t = CStr(s)
    t = Replace$(t, Chr(160), " ")
    t = Replace$(t, vbTab, " ")
    t = Replace$(t, vbCr, " ")
    t = Replace$(t, vbLf, " ")
    t = Application.WorksheetFunction.Trim(t)
    Do While InStr(t, "  ") > 0
        t = Replace$(t, "  ", " ")
    Loop
    NormalizeHeader = LCase$(t)
End Function

' Этап_*: по имени + подписи столбцов
Private Function IsStageTable(lo As ListObject) As Boolean
    If lo Is Nothing Then Exit Function

    Dim nm As String
    nm = lo.Name
    If Len(nm) = 0 Then nm = lo.DisplayName
    nm = Replace$(nm, Chr(160), " ")
    nm = Replace$(nm, "_", " ")
    nm = Replace$(nm, "-", " ")
    nm = Application.WorksheetFunction.Trim(nm)
    nm = LCase$(nm)

    ' Имя начинается с "этап"
    If InStr(nm, " ") > 0 Then
        If Left$(nm, InStr(nm, " ") - 1) = "этап" Then
            IsStageTable = True
            Exit Function
        End If
    ElseIf nm = "этап" Then
        IsStageTable = True
        Exit Function
    End If

    ' Подписи столбцов: есть дата и название этапа
    Dim hasDate As Boolean, hasName As Boolean, h As String, i As Long
    For i = 1 To lo.ListColumns.Count
        h = NormalizeHeader(lo.ListColumns(i).Name)
        If (InStr(h, "дата") > 0) Or (InStr(h, "время") > 0) Or (InStr(h, "time") > 0) Then hasDate = True
        If (h = "название этапа") Or (h = "этап") _
           Or (InStr(h, "назв") > 0 And InStr(h, "этап") > 0) Then hasName = True
    Next i
    IsStageTable = (hasDate And hasName)
End Function

' Таблица_с_описанием_ID
Private Function IsIDDescriptionTable(lo As ListObject) As Boolean
    If lo Is Nothing Then Exit Function

    Dim nm As String
    nm = lo.Name
    If Len(nm) = 0 Then nm = lo.DisplayName
    nm = Replace$(nm, Chr(160), " ")
    nm = Replace$(nm, "_", " ")
    nm = Replace$(nm, "-", " ")
    nm = Application.WorksheetFunction.Trim(nm)
    nm = LCase$(nm)

    If InStr(nm, "таблица") > 0 And InStr(nm, "описан") > 0 And InStr(nm, "id") > 0 Then
        IsIDDescriptionTable = True
        Exit Function
    End If

    Dim hasID As Boolean, hasDescr As Boolean, i As Long, h As String
    For i = 1 To lo.ListColumns.Count
        h = NormalizeHeader(lo.ListColumns(i).Name)
        If h = "id" Then hasID = True
        If InStr(h, "описан") > 0 Then hasDescr = True
    Next i
    IsIDDescriptionTable = (hasID And hasDescr)
End Function

' Специальная таблица, где ID и Дата не подставляются
Private Function IsTemplateEditorTable(lo As ListObject) As Boolean
    Dim nm As String
    nm = lo.Name
    If Len(nm) = 0 Then nm = lo.DisplayName
    nm = Replace$(nm, Chr(160), " ")
    nm = Application.WorksheetFunction.Trim(nm)
    IsTemplateEditorTable = (StrComp(nm, TEMPLATE_EDITOR_TABLE, vbTextCompare) = 0)
End Function


' ========================= ПОИСК КОЛОНОК =========================

Private Function FindDateColIndex(lo As ListObject) As Long
    Dim i As Long, h As String
    For i = 1 To lo.ListColumns.Count
        h = NormalizeHeader(lo.ListColumns(i).Name)
        If h = "дата и время" Or h = "дата/время" Or h = "дата-время" _
           Or h = "datetime" Or h = "timestamp" Or h = "время" Or h = "дата" Then
            FindDateColIndex = i: Exit Function
        End If
    Next i
    For i = 1 To lo.ListColumns.Count
        h = NormalizeHeader(lo.ListColumns(i).Name)
        If (InStr(h, "дата") > 0) Or (InStr(h, "время") > 0) Or (InStr(h, "time") > 0) Then
            FindDateColIndex = i: Exit Function
        End If
    Next i
End Function

Private Function FindNameColIndex(lo As ListObject) As Long
    Dim i As Long, h As String
    For i = 1 To lo.ListColumns.Count
        h = NormalizeHeader(lo.ListColumns(i).Name)
        If h = "название этапа" Or h = "этап" Then
            FindNameColIndex = i: Exit Function
        End If
    Next i
    For i = 1 To lo.ListColumns.Count
        h = NormalizeHeader(lo.ListColumns(i).Name)
        If (InStr(h, "назв") > 0 And InStr(h, "этап") > 0) Then
            FindNameColIndex = i: Exit Function
        End If
    Next i
End Function

Private Function FindIDColIndex(lo As ListObject) As Long
    Dim i As Long, h As String
    For i = 1 To lo.ListColumns.Count
        h = NormalizeHeader(lo.ListColumns(i).Name)
        If h = "id" Or h = "ид" Then
            FindIDColIndex = i: Exit Function
        End If
    Next i
End Function

Private Function FindSeriesColIndex(lo As ListObject) As Long
    Dim i As Long, h As String
    For i = 1 To lo.ListColumns.Count
        h = NormalizeHeader(lo.ListColumns(i).Name)
        If h = "серия" Or InStr(h, "серия") > 0 Then
            FindSeriesColIndex = i: Exit Function
        End If
    Next i
End Function

' Оператор / Координатор
Private Function FindPersonColIndex(lo As ListObject) As Long
    Dim i As Long, h As String
    For i = 1 To lo.ListColumns.Count
        h = NormalizeHeader(lo.ListColumns(i).Name)
        If h = "оператор" Or h = "координатор" Then
            FindPersonColIndex = i: Exit Function
        End If
    Next i
End Function

Private Function FindDocColIndex(lo As ListObject) As Long
    Dim i As Long, h As String
    For i = 1 To lo.ListColumns.Count
        h = NormalizeHeader(lo.ListColumns(i).Name)
        If Left$(h, 12) = "документация" Then
            FindDocColIndex = i: Exit Function
        End If
    Next i
End Function

Private Function FindCommentColIndex(lo As ListObject) As Long
    Dim i As Long, h As String
    For i = 1 To lo.ListColumns.Count
        h = NormalizeHeader(lo.ListColumns(i).Name)
        If InStr(h, "комментар") > 0 Then
            FindCommentColIndex = i: Exit Function
        End If
    Next i
End Function

Private Function FindDescriptionColIndex(lo As ListObject) As Long
    Dim i As Long, h As String
    For i = 1 To lo.ListColumns.Count
        h = NormalizeHeader(lo.ListColumns(i).Name)
        If h = "описание" Or InStr(h, "описан") > 0 Then
            FindDescriptionColIndex = i: Exit Function
        End If
    Next i
End Function

Private Function FindIDDateColIndex(lo As ListObject) As Long
    Dim i As Long, h As String
    For i = 1 To lo.ListColumns.Count
        h = NormalizeHeader(lo.ListColumns(i).Name)
        If h = "дата id" Or h = "дата и время" Or h = "дата id " Or h = "дата" Then
            FindIDDateColIndex = i: Exit Function
        End If
    Next i
End Function


' ========================= БАЗОВОЕ НАЗВАНИЕ ЭТАПА =========================

Private Function StageTailFromName(ByVal rawName As String) As String
    Dim s As String: s = CStr(rawName)
    s = Replace$(s, Chr(160), " ")
    s = Replace$(s, "_", " ")
    s = Replace$(s, "-", " ")
    s = Application.WorksheetFunction.Trim(s)
    Dim p As Long: p = InStr(s, " ")
    If p > 0 Then
        s = Mid$(s, p + 1)
    Else
        s = ""
    End If
    s = Application.WorksheetFunction.Trim(s)
    Do While InStr(s, "  ") > 0
        s = Replace$(s, "  ", " ")
    Loop
    StageTailFromName = s
End Function

Private Function BaseStageNameValue(lo As ListObject, ByVal nameCol As Long) As Variant
    Dim tail As String
    tail = StageTailFromName(IIf(Len(lo.Name) > 0, lo.Name, lo.DisplayName))

    If ALWAYS_USE_TABLE_TAIL_FOR_NAME And Len(tail) > 0 Then
        BaseStageNameValue = tail
        Exit Function
    End If

    Dim v As Variant
    If Not lo.DataBodyRange Is Nothing Then
        If lo.DataBodyRange.rows.Count > 0 Then
            v = lo.DataBodyRange.Cells(1, nameCol).value
            If Len(Trim$(CStr(v))) > 0 Then
                BaseStageNameValue = v
                Exit Function
            End If
        End If
    End If
    BaseStageNameValue = tail
End Function


' ========================= ЛОГИКА ДЛЯ ЭТАП_* =========================

Private Sub HandleStageTableChange(lo As ListObject, ByVal Target As Range)
    If lo.DataBodyRange Is Nothing Then Exit Sub

    Dim dbr As Range: Set dbr = lo.DataBodyRange
    Dim hit As Range
    On Error Resume Next
    Set hit = Application.Intersect(Target, dbr)
    On Error GoTo 0
    If hit Is Nothing Then Exit Sub

    Dim lastRowIdx As Long: lastRowIdx = dbr.rows.Count
    Dim hitLast As Range
    On Error Resume Next
    Set hitLast = Application.Intersect(hit, dbr.rows(lastRowIdx))
    On Error GoTo 0
    If hitLast Is Nothing Then Exit Sub

    ' Определяем служебные столбцы
    Dim dateCol As Long, nameCol As Long
    Dim idCol As Long, serCol As Long
    Dim opCol As Long, docCol As Long, comCol As Long

    dateCol = FindDateColIndex(lo)
    nameCol = FindNameColIndex(lo)
    idCol = FindIDColIndex(lo)
    serCol = FindSeriesColIndex(lo)
    opCol = FindPersonColIndex(lo)
    docCol = FindDocColIndex(lo)
    comCol = FindCommentColIndex(lo)

    ' Триггер: изменение затронуло ХОТЯ БЫ ОДИН НЕслужебный столбец в последней строке
    Dim trigger As Boolean
    Dim c As Range, tblCol As Long

    For Each c In hitLast.Cells
        tblCol = c.Column - dbr.Column + 1
        If Not IsStageServiceCol(tblCol, dateCol, nameCol, idCol, serCol, opCol, docCol, comCol) Then
            trigger = True
            Exit For
        End If
    Next c

    If Not trigger Then Exit Sub

    ' Новая строка — заполняем
    Dim allowIDDate As Boolean
    allowIDDate = Not IsTemplateEditorTable(lo)

    FillStageRow_New lo, lastRowIdx, allowIDDate, _
                     dateCol, nameCol, idCol, serCol, opCol, docCol, comCol
End Sub

Private Function IsStageServiceCol(ByVal colIdx As Long, _
                                   ByVal dateCol As Long, ByVal nameCol As Long, _
                                   ByVal idCol As Long, ByVal serCol As Long, _
                                   ByVal opCol As Long, ByVal docCol As Long, _
                                   ByVal comCol As Long) As Boolean
    If colIdx = dateCol Or colIdx = nameCol Or colIdx = idCol Or _
       colIdx = serCol Or colIdx = opCol Or colIdx = docCol Or colIdx = comCol Then
        IsStageServiceCol = True
    End If
End Function

Private Sub FillStageRow_New(lo As ListObject, ByVal rowIdx As Long, _
                             ByVal allowIDDate As Boolean, _
                             ByVal dateCol As Long, ByVal nameCol As Long, _
                             ByVal idCol As Long, ByVal serCol As Long, _
                             ByVal opCol As Long, ByVal docCol As Long, _
                             ByVal comCol As Long)
    On Error GoTo CleanExit
    If lo.DataBodyRange Is Nothing Then Exit Sub
    Dim r As Range: Set r = lo.DataBodyRange
    If rowIdx < 1 Or rowIdx > r.rows.Count Then Exit Sub

    Dim rowR As Range: Set rowR = r.rows(rowIdx)
    Dim c As Range

    Application.EnableEvents = False

    ' --- Дата и время ---
    If allowIDDate And dateCol > 0 Then
        Set c = rowR.Cells(1, dateCol)
        If IsCellEmpty(c) Then
            If WRITE_TIME Then c.value = Now Else c.value = Date
            If WRITE_TIME Then
                c.NumberFormatLocal = DATETIME_FMT_LOCAL
            Else
                c.NumberFormatLocal = DATE_FMT_LOCAL
            End If
        End If
    End If

    ' --- Название этапа ---
    If nameCol > 0 Then
        Set c = rowR.Cells(1, nameCol)
        If IsCellEmpty(c) Then
            Dim baseName As Variant
            baseName = BaseStageNameValue(lo, nameCol)
            If Len(Trim$(CStr(baseName))) > 0 Then c.value = baseName
        End If
    End If

    ' --- ID ---
    If allowIDDate And idCol > 0 Then
        Dim i As Long
        Dim lastID As Variant, baseID As Variant

        For i = 1 To rowIdx - 1
            Set c = r.rows(i).Cells(1, idCol)
            If Not IsCellEmpty(c) Then lastID = c.value
        Next i

        Set c = rowR.Cells(1, idCol)
        If IsCellEmpty(c) Then
            If IsEmpty(lastID) Then
                baseID = GetMaxFromNamedRange("ID_УЗ")
                If Not IsEmpty(baseID) Then lastID = baseID
            End If
            If Not IsEmpty(lastID) Then c.value = lastID
        End If
    End If

    ' --- Серия ---
    If serCol > 0 Then
        Dim lastSer As Variant
        For i = 1 To rowIdx - 1
            Set c = r.rows(i).Cells(1, serCol)
            If Not IsCellEmpty(c) Then lastSer = c.value
        Next i

        Set c = rowR.Cells(1, serCol)
        If IsCellEmpty(c) Then
            If IsEmpty(lastSer) Then lastSer = 1
            c.value = lastSer
        End If
    End If

    ' --- Оператор / Документация / Комментарий ---
    Dim lastOp As Variant, baseOp As Variant
    Dim lastDoc As Variant, baseDoc As Variant
    Dim lastCom As Variant, baseCom As Variant

    For i = 1 To rowIdx - 1
        Set c = r.rows(i).Cells(1, opCol)
        If opCol > 0 And Not IsCellEmpty(c) Then lastOp = c.value

        If docCol > 0 Then
            Set c = r.rows(i).Cells(1, docCol)
            If Not IsCellEmpty(c) Then lastDoc = c.value
        End If

        If comCol > 0 Then
            Set c = r.rows(i).Cells(1, comCol)
            If Not IsCellEmpty(c) Then lastCom = c.value
        End If
    Next i

    ' Оператор (из Оператор_УЗ, если в таблице ещё не было)
    If opCol > 0 Then
        Set c = rowR.Cells(1, opCol)
        If IsCellEmpty(c) Then
            If IsEmpty(lastOp) Then
                If IsEmpty(baseOp) Then baseOp = GetLastFromNamedRange("Оператор_УЗ")
                lastOp = baseOp
            End If
            If Not IsEmpty(lastOp) Then c.value = lastOp
        End If
    End If

    ' Документация (ТР, лит. обр.) — из Документация_этапы_УЗ
    If docCol > 0 Then
        Set c = rowR.Cells(1, docCol)
        If IsCellEmpty(c) Then
            If IsEmpty(lastDoc) Then
                If IsEmpty(baseDoc) Then baseDoc = GetLastFromNamedRange("Документация_этапы_УЗ")
                lastDoc = baseDoc
            End If
            If Not IsEmpty(lastDoc) Then c.value = lastDoc
        End If
    End If

    ' Комментарий — из Комментарии_УЗ
    If comCol > 0 Then
        Set c = rowR.Cells(1, comCol)
        If IsCellEmpty(c) Then
            If IsEmpty(lastCom) Then
                If IsEmpty(baseCom) Then baseCom = GetLastFromNamedRange("Комментарии_УЗ")
                lastCom = baseCom
            End If
            If Not IsEmpty(lastCom) Then c.value = lastCom
        End If
    End If

CleanExit:
    Application.EnableEvents = True
End Sub


' ========================= ЛОГИКА ДЛЯ Таблица_с_описанием_ID =========================

Private Sub HandleIDDescrTableChange(lo As ListObject, ByVal Target As Range)
    If lo.DataBodyRange Is Nothing Then Exit Sub

    Dim dbr As Range: Set dbr = lo.DataBodyRange
    Dim hit As Range
    On Error Resume Next
    Set hit = Application.Intersect(Target, dbr)
    On Error GoTo 0
    If hit Is Nothing Then Exit Sub

    Dim lastRowIdx As Long: lastRowIdx = dbr.rows.Count
    Dim hitLast As Range
    On Error Resume Next
    Set hitLast = Application.Intersect(hit, dbr.rows(lastRowIdx))
    On Error GoTo 0
    If hitLast Is Nothing Then Exit Sub

    Dim idCol As Long, dateCol As Long, personCol As Long
    Dim docCol As Long, descrCol As Long

    idCol = FindIDColIndex(lo)
    dateCol = FindIDDateColIndex(lo)
    personCol = FindPersonColIndex(lo)
    docCol = FindDocColIndex(lo)
    descrCol = FindDescriptionColIndex(lo)

    Dim trigger As Boolean
    Dim c As Range, tblCol As Long

    For Each c In hitLast.Cells
        tblCol = c.Column - dbr.Column + 1
        If Not IsIDDescrServiceCol(tblCol, idCol, dateCol, personCol, docCol, descrCol) Then
            trigger = True
            Exit For
        End If
    Next c

    If Not trigger Then Exit Sub

    Dim allowIDDate As Boolean
    allowIDDate = Not IsTemplateEditorTable(lo) ' на всякий случай; обычно не совпадёт

    FillIDDescrRow_New lo, lastRowIdx, allowIDDate, _
                       idCol, dateCol, personCol, docCol, descrCol
End Sub

Private Function IsIDDescrServiceCol(ByVal colIdx As Long, _
                                     ByVal idCol As Long, ByVal dateCol As Long, _
                                     ByVal personCol As Long, ByVal docCol As Long, _
                                     ByVal descrCol As Long) As Boolean
    If colIdx = idCol Or colIdx = dateCol Or colIdx = personCol _
       Or colIdx = docCol Or colIdx = descrCol Then
        IsIDDescrServiceCol = True
    End If
End Function

Private Sub FillIDDescrRow_New(lo As ListObject, ByVal rowIdx As Long, _
                               ByVal allowIDDate As Boolean, _
                               ByVal idCol As Long, ByVal dateCol As Long, _
                               ByVal personCol As Long, ByVal docCol As Long, _
                               ByVal descrCol As Long)
    On Error GoTo CleanExit
    If lo.DataBodyRange Is Nothing Then Exit Sub
    Dim r As Range: Set r = lo.DataBodyRange
    If rowIdx < 1 Or rowIdx > r.rows.Count Then Exit Sub

    Dim rowR As Range: Set rowR = r.rows(rowIdx)
    Dim c As Range
    Dim i As Long

    Application.EnableEvents = False

    ' --- ID ---
    If allowIDDate And idCol > 0 Then
        Dim lastID As Variant, baseID As Variant
        For i = 1 To rowIdx - 1
            Set c = r.rows(i).Cells(1, idCol)
            If Not IsCellEmpty(c) Then lastID = c.value
        Next i

        Set c = rowR.Cells(1, idCol)
        If IsCellEmpty(c) Then
            If IsEmpty(lastID) Then
                baseID = GetMaxFromNamedRange("ID_УЗ")
                If Not IsEmpty(baseID) Then lastID = baseID
            End If
            If Not IsEmpty(lastID) Then c.value = lastID
        End If
    End If

    ' --- Дата ID ---
    If allowIDDate And dateCol > 0 Then
        Set c = rowR.Cells(1, dateCol)
        If IsCellEmpty(c) Then
            If WRITE_TIME Then c.value = Now Else c.value = Date
            If WRITE_TIME Then
                c.NumberFormatLocal = DATETIME_FMT_LOCAL
            Else
                c.NumberFormatLocal = DATE_FMT_LOCAL
            End If
        End If
    End If

    ' --- Координатор ---
    Dim lastPerson As Variant, basePerson As Variant
    If personCol > 0 Then
        For i = 1 To rowIdx - 1
            Set c = r.rows(i).Cells(1, personCol)
            If Not IsCellEmpty(c) Then lastPerson = c.value
        Next i

        Set c = rowR.Cells(1, personCol)
        If IsCellEmpty(c) Then
            If IsEmpty(lastPerson) Then
                basePerson = GetLastFromNamedRange("Оператор_УЗ")
                lastPerson = basePerson
            End If
            If Not IsEmpty(lastPerson) Then c.value = lastPerson
        End If
    End If

    ' --- Документация ---
    Dim lastDoc As Variant, baseDoc As Variant
    If docCol > 0 Then
        For i = 1 To rowIdx - 1
            Set c = r.rows(i).Cells(1, docCol)
            If Not IsCellEmpty(c) Then lastDoc = c.value
        Next i

        Set c = rowR.Cells(1, docCol)
        If IsCellEmpty(c) Then
            If IsEmpty(lastDoc) Then
                baseDoc = GetLastFromNamedRange("Документация_ID_УЗ")
                lastDoc = baseDoc
            End If
            If Not IsEmpty(lastDoc) Then c.value = lastDoc
        End If
    End If

    ' --- Описание ---
    Dim lastDescr As Variant, baseDescr As Variant
    If descrCol > 0 Then
        For i = 1 To rowIdx - 1
            Set c = r.rows(i).Cells(1, descrCol)
            If Not IsCellEmpty(c) Then lastDescr = c.value
        Next i

        Set c = rowR.Cells(1, descrCol)
        If IsCellEmpty(c) Then
            If IsEmpty(lastDescr) Then
                baseDescr = GetLastFromNamedRange("Описание_УЗ")
                lastDescr = baseDescr
            End If
            If Not IsEmpty(lastDescr) Then c.value = lastDescr
        End If
    End If

CleanExit:
    Application.EnableEvents = True
End Sub


' ========================= ВСПОМОГАТЕЛЬНЫЕ =========================

Private Function IsCellEmpty(ByVal c As Range) As Boolean
    Dim v As Variant: v = c.Value2
    If IsError(v) Then
        IsCellEmpty = False
    Else
        IsCellEmpty = (VarType(v) = vbEmpty) Or (Len(Trim$(CStr(v))) = 0)
    End If
End Function

' Максимум чисел в именованном диапазоне (для ID_УЗ)
Private Function GetMaxFromNamedRange(ByVal nm As String) As Variant
    Dim r As Range, c As Range
    Dim maxVal As Double
    Dim hasVal As Boolean

    On Error Resume Next
    Set r = Application.Range(nm)
    On Error GoTo 0
    If r Is Nothing Then Exit Function

    For Each c In r.Cells
        If Not IsCellEmpty(c) Then
            If IsNumeric(c.Value2) Then
                If Not hasVal Then
                    maxVal = CDbl(c.Value2)
                    hasVal = True
                ElseIf CDbl(c.Value2) > maxVal Then
                    maxVal = CDbl(c.Value2)
                    hasVal = True
                End If
            End If
        End If
    Next c

    If hasVal Then GetMaxFromNamedRange = maxVal
End Function

' Последнее непустое значение в именованном диапазоне
' (Оператор_УЗ, Документация_этапы_УЗ, Документация_ID_УЗ, Комментарии_УЗ, Описание_УЗ)
Private Function GetLastFromNamedRange(ByVal nm As String) As Variant
    Dim r As Range
    Dim i As Long

    On Error Resume Next
    Set r = Application.Range(nm)
    On Error GoTo 0
    If r Is Nothing Then Exit Function

    For i = r.Cells.Count To 1 Step -1
        If Not IsCellEmpty(r.Cells(i)) Then
            GetLastFromNamedRange = r.Cells(i).value
            Exit Function
        End If
    Next i
End Function


