Attribute VB_Name = "modTimeMachineImport"
' ===========================
'   modTimeMachineImport.bas
'   Фоновый админский импорт Этап_* и Таблица_с_описанием_ID из папки
'   Работает ТОЛЬКО если в книге есть лист "Time_Machine".
'   Если лист удалён (у сотрудников) — макросы сразу выходят.
'
'   Логика:
'     - проходит по всем Excel-файлам в папке ThisWorkbook.Path
'     - сначала обрабатывает ТЕКУЩУЮ книгу (её Служебный_лист),
'       затем остальные файлы
'     - ищет в них лист "Служебный_лист"
'     - забирает оттуда все таблицы Этап_* и Таблица_с_описанием_ID
'     - в текущей книге складывает на лист "Time_Machine":
'           * журнал этапов Журнал_Загрузок (A:E)
'           * сами Этап_* — начиная с AA4, через один столбец вправо
'               + над каждой таблицей заголовок "Импорт <время>" и имя
'                 "Заголовок_<имя_таблицы>"
'           * агрегированную таблицу ID Журнал_ID — в столбце G (G:O):
'               Дата/время, Пользователь, Файл, Имя_источник, Имя_админ,
'               Дата ID, Координатор, Описание, Документация
'             при совпадении ID поле Имя_админ получает суффиксы _v1, _v2, ...
' ===========================
Option Explicit

Private Const TM_SHEET           As String = "Time_Machine"
Private Const TM_LOG_TABLE_NAME  As String = "Журнал_Загрузок"

Private Const SRC_SVC_SHEET      As String = "Служебный_лист"
Private Const STAGE_PREFIX       As String = "Этап_"

' Таблица ID на служебных листах
Private Const TM_ID_SRC_TABLE    As String = "Таблица_с_описанием_ID"

' Агрегированная таблица ID на Time_Machine
Private Const TM_ID_TABLE_NAME   As String = "Журнал_ID"
Private Const TM_ID_FIRST_COL    As Long = 7   ' G

' куда класть Этапы в этой книге (на Time_Machine)
Private Const STAGE_FIRST_COL    As Long = 27  ' AA
Private Const STAGE_TOP_ROW      As Long = 4   ' первая строка таблиц
Private Const HEADER_ROW         As Long = STAGE_TOP_ROW - 1

' корневая папка для обхода;
' если пусто — берём ThisWorkbook.Path (в твоём случае C:\Users\i_dmitri_i\Admin)
Private Const TM_ROOT_FOLDER     As String = ""

' Глобальная карта использованных ID для Имя_админ (ID / ID_v1 / ID_v2 / ...)
Private gIdDict As Object


' ======================= ВХОД ДЛЯ КНОПКИ / РАСПИСАНИЯ =======================

' Основной макрос: раз в неделю / по кнопке.
' Если листа Time_Machine нет — сразу выход.
Public Sub TimeMachine_WeeklyImportStages()
    Dim wsTM       As Worksheet
    Dim logTable   As ListObject
    Dim folderPath As String
    Dim oldEvents  As Boolean
    Dim oldScreen  As Boolean
    Dim oldAlerts  As Boolean
    Dim oldCalc    As XlCalculation

    ' --- проверка прав: автоимпорт только для АДМИНА ---
    ' Если система безопасности включена — выходим, если не админ.
    ' Админский вход = ввод кода 098 (ADMIN_MASTER_CODE) в LoginOnOpen.
    If USER_SECURITY_ENABLED Then
        If Not HasAdminRights() Then
            TM_Dbg "TimeMachine_WeeklyImportStages: нет прав администратора, выхожу"
            MsgBox "Админский импорт (Time_Machine) разрешён только после входа под админ-кодом.", _
                   vbCritical, "Нет прав"
            Exit Sub
        End If
    End If
    ' --- конец блока проверки прав ---

    ' Если нет листа Time_Machine — НИЧЕГО не делаем
    If Not TM_GetSheet(wsTM) Then
        TM_Dbg "TimeMachine_WeeklyImportStages: лист Time_Machine не найден, выхожу"
        Exit Sub
    End If

    On Error GoTo ErrHandler

    ' Инициализация карты ID
    Set gIdDict = CreateObject("Scripting.Dictionary")

    ' Журнал этапов
    Set logTable = TM_EnsureLogTable(wsTM)
    folderPath = TM_GetRootFolder()

    If Len(folderPath) = 0 Then
        TM_Dbg "TimeMachine_WeeklyImportStages: пустой путь к папке, выхожу"
        Exit Sub
    End If

    ' Сохранение окружения
    oldEvents = Application.EnableEvents
    oldScreen = Application.ScreenUpdating
    oldAlerts = Application.DisplayAlerts
    oldCalc = Application.Calculation

    Application.EnableEvents = False
    Application.ScreenUpdating = False
    Application.DisplayAlerts = False
    Application.Calculation = xlCalculationManual

    TM_Dbg "TimeMachine_WeeklyImportStages: старт, папка = " & folderPath

    ' 1) Сначала обрабатываем текущую книгу (её Служебный_лист)
    TM_ImportFromThisWorkbook wsTM, logTable

    ' 2) Затем все остальные файлы в папке
    TM_ImportFromFolder folderPath, wsTM, logTable

CleanExit:
    TM_Dbg "TimeMachine_WeeklyImportStages: завершение"
    Application.EnableEvents = oldEvents
    Application.ScreenUpdating = oldScreen
    Application.DisplayAlerts = oldAlerts
    Application.Calculation = oldCalc
    Exit Sub

ErrHandler:
    TM_Dbg "TimeMachine_WeeklyImportStages: ошибка " & Err.Number & " - " & Err.Description
    MsgBox "Админский импорт (Time_Machine) прерван." & vbCrLf & _
           "Описание: " & Err.Description, vbCritical, "TimeMachine_WeeklyImportStages"
    Resume CleanExit
End Sub



' ======================= ИМПОРТ ИЗ ТЕКУЩЕЙ КНИГИ =======================

Private Sub TM_ImportFromThisWorkbook(ByVal wsTM As Worksheet, _
                                      ByVal logTable As ListObject)
    Dim wsSrc As Worksheet
    Dim loSrc As ListObject
    Dim loId  As ListObject

    On Error Resume Next
    Set wsSrc = ThisWorkbook.Worksheets(SRC_SVC_SHEET)
    On Error GoTo 0

    If wsSrc Is Nothing Then
        TM_Dbg "TM_ImportFromThisWorkbook: лист '" & SRC_SVC_SHEET & "' не найден в текущей книге, пропуск"
        Exit Sub
    End If

    TM_Dbg "TM_ImportFromThisWorkbook: обрабатываю Служебный_лист текущей книги"

    ' Этапы
    For Each loSrc In wsSrc.ListObjects
        If TM_IsStageTable(loSrc) Then
            TM_ImportOneStage loSrc, wsTM, wsSrc, ThisWorkbook.fullName, logTable
        End If
    Next loSrc

    ' Таблица ID
    On Error Resume Next
    Set loId = wsSrc.ListObjects(TM_ID_SRC_TABLE)
    On Error GoTo 0

    If Not loId Is Nothing Then
        TM_ImportIdTable loId, wsTM, ThisWorkbook.fullName
    Else
        TM_Dbg "TM_ImportFromThisWorkbook: таблица '" & TM_ID_SRC_TABLE & "' не найдена в текущей книге"
    End If
End Sub


' ======================= ОСНОВНОЙ ОБХОД ПАПКИ =======================

Private Sub TM_ImportFromFolder(ByVal folderPath As String, _
                                ByVal wsTM As Worksheet, _
                                ByVal logTable As ListObject)
    Dim basePath As String
    Dim fileName As String
    Dim fullPath As String

    If Right$(folderPath, 1) = Application.PathSeparator Then
        basePath = folderPath
    Else
        basePath = folderPath & Application.PathSeparator
    End If

    fileName = Dir$(basePath & "*.xls*")

    Do While Len(fileName) > 0
        fullPath = basePath & fileName

        ' не трогаем саму текущую книгу — её мы уже обработали отдельно
        If StrComp(fullPath, ThisWorkbook.fullName, vbTextCompare) <> 0 Then
            TM_Dbg "TM_ImportFromFolder: файл " & fullPath
            TM_ImportFromSingleFile fullPath, wsTM, logTable
        Else
            TM_Dbg "TM_ImportFromFolder: пропущен текущий файл " & fullPath
        End If

        fileName = Dir$
    Loop
End Sub


' ======================= ОБРАБОТКА ОДНОГО ФАЙЛА =======================

Private Sub TM_ImportFromSingleFile(ByVal filePath As String, _
                                    ByVal wsTM As Worksheet, _
                                    ByVal logTable As ListObject)
    Dim wbSrc     As Workbook
    Dim wsSrc     As Worksheet
    Dim loSrc     As ListObject
    Dim loId      As ListObject
    Dim oldEvents As Boolean

    TM_Dbg "TM_ImportFromSingleFile: открываю '" & filePath & "'"

    oldEvents = Application.EnableEvents
    Application.EnableEvents = False   ' глушим события, чтобы не срабатывал чужой Workbook_Open

    On Error Resume Next
    Set wbSrc = Application.Workbooks.Open( _
                    fileName:=filePath, _
                    ReadOnly:=True, _
                    UpdateLinks:=False)
    On Error GoTo 0

    Application.EnableEvents = oldEvents

    If wbSrc Is Nothing Then
        TM_Dbg "TM_ImportFromSingleFile: не удалось открыть файл"
        Exit Sub
    End If

    On Error Resume Next
    Set wsSrc = wbSrc.Worksheets(SRC_SVC_SHEET)
    On Error GoTo 0

    If wsSrc Is Nothing Then
        TM_Dbg "TM_ImportFromSingleFile: лист '" & SRC_SVC_SHEET & "' не найден, файл пропущен"
        wbSrc.Close SaveChanges:=False
        Exit Sub
    End If

    ' Этапы
    For Each loSrc In wsSrc.ListObjects
        If TM_IsStageTable(loSrc) Then
            TM_ImportOneStage loSrc, wsTM, wsSrc, wbSrc.fullName, logTable
        End If
    Next loSrc

    ' Таблица ID
    On Error Resume Next
    Set loId = wsSrc.ListObjects(TM_ID_SRC_TABLE)
    On Error GoTo 0

    If Not loId Is Nothing Then
        TM_ImportIdTable loId, wsTM, wbSrc.fullName
    Else
        TM_Dbg "TM_ImportFromSingleFile: таблица '" & TM_ID_SRC_TABLE & "' не найдена, файл пропущен по ID"
    End If

    wbSrc.Close SaveChanges:=False
End Sub


' ======================= ИМПОРТ ОДНОЙ ТАБЛИЦЫ ЭТАПА =======================

Private Sub TM_ImportOneStage(ByVal loSrc As ListObject, _
                              ByVal wsTM As Worksheet, _
                              ByVal wsSrc As Worksheet, _
                              ByVal srcPath As String, _
                              ByVal logTable As ListObject)
    Dim srcRng      As Range
    Dim destTop     As Range
    Dim destRng     As Range
    Dim loNew       As ListObject
    Dim rowsCnt     As Long
    Dim colsCnt     As Long
    Dim baseName    As String
    Dim newName     As String
    Dim j           As Long
    Dim lr          As ListRow
    Dim headerCell  As Range
    Dim importName  As String
    Dim titleName   As String

    Set srcRng = loSrc.Range
    rowsCnt = srcRng.rows.Count
    colsCnt = srcRng.Columns.Count

    baseName = loSrc.Name
    newName = TM_GetUniqueStageName(wsTM, baseName)

    ' точка вставки для таблицы
    Set destTop = TM_GetStageAnchor(wsTM, colsCnt)
    Set destRng = destTop.Resize(rowsCnt, colsCnt)

    ' заголовок над таблицей с временем импорта
    Set headerCell = wsTM.Cells(HEADER_ROW, destTop.Column)
    headerCell.value = "Импорт " & Format$(Now, "yyyy-mm-dd HH:nn:ss")

    ' 1) Именованная ячейка Импорт_<время> (как было)
    importName = "Импорт_" & Format$(Now, "yyyy_mm_dd_HH_nn_ss")
    On Error Resume Next
    ThisWorkbook.names(importName).Delete
    On Error GoTo 0
    ThisWorkbook.names.Add Name:=importName, refersTo:=headerCell

    ' 2) Именованная ячейка Заголовок_<имя_таблицы>
    titleName = "Заголовок_" & newName
    On Error Resume Next
    ThisWorkbook.names(titleName).Delete
    On Error GoTo 0
    ThisWorkbook.names.Add Name:=titleName, refersTo:=headerCell

    ' значения
    destRng.value = srcRng.value

    ' ширина столбцов (форматы при желании можно добавить)
    For j = 1 To colsCnt
        destRng.Columns(j).ColumnWidth = srcRng.Columns(j).ColumnWidth
    Next j

    ' создаём таблицу
    Set loNew = wsTM.ListObjects.Add(SourceType:=xlSrcRange, _
                                     Source:=destRng, _
                                     XlListObjectHasHeaders:=xlYes)
    On Error Resume Next
    loNew.Name = newName
    On Error GoTo 0

    ' запись в журнал (5 столбцов: время, пользователь, файл, имя_источник, имя_админ)
    Set lr = logTable.ListRows.Add
    With lr.Range
        .Cells(1, 1).value = Now                     ' Дата/время
        .Cells(1, 2).value = TM_GetUserId()          ' Пользователь (Win / Excel)
        .Cells(1, 3).value = srcPath                 ' Файл
        .Cells(1, 4).value = loSrc.Name              ' Имя_источник (таблица в исходном файле)
        .Cells(1, 5).value = newName                 ' Имя_админ (таблица в Time_Machine)
    End With

    TM_Dbg "TM_ImportOneStage: импортирован " & loSrc.Name & " из " & srcPath & " как " & newName
End Sub


' ======================= ИМПОРТ ТАБЛИЦЫ ID =======================

Private Sub TM_ImportIdTable(ByVal loId As ListObject, _
                             ByVal wsTM As Worksheet, _
                             ByVal srcPath As String)
    Dim idTable As ListObject
    Dim idxID As Long, idxDate As Long, idxCoord As Long, idxDescr As Long, idxDoc As Long
    Dim r As ListRow
    Dim vID As Variant, vDate As Variant, vCoord As Variant, vDescr As Variant, vDoc As Variant

    Set idTable = TM_EnsureIdTable(wsTM)

    idxID = TM_ColumnIndexSafe(loId, "ID")
    idxDate = TM_ColumnIndexSafe(loId, "Дата ID")
    idxCoord = TM_ColumnIndexSafe(loId, "Координатор")
    idxDescr = TM_ColumnIndexSafe(loId, "Описание")
    idxDoc = TM_ColumnIndexSafe(loId, "Документация")

    If idxID = 0 Then
        TM_Dbg "TM_ImportIdTable: в таблице '" & loId.Name & "' нет столбца 'ID', пропуск"
        Exit Sub
    End If

    If loId.DataBodyRange Is Nothing Then Exit Sub

    For Each r In loId.ListRows
        vID = r.Range.Cells(1, idxID).value
        If idxDate > 0 Then vDate = r.Range.Cells(1, idxDate).value Else vDate = Empty
        If idxCoord > 0 Then vCoord = r.Range.Cells(1, idxCoord).value Else vCoord = Empty
        If idxDescr > 0 Then vDescr = r.Range.Cells(1, idxDescr).value Else vDescr = Empty
        If idxDoc > 0 Then vDoc = r.Range.Cells(1, idxDoc).value Else vDoc = Empty

        TM_AddIdRow idTable, srcPath, vID, vDate, vCoord, vDescr, vDoc
    Next r

    TM_Dbg "TM_ImportIdTable: импортировано строк ID=" & CStr(loId.ListRows.Count) & " из " & srcPath
End Sub

Private Sub TM_AddIdRow(ByVal idTable As ListObject, _
                        ByVal srcPath As String, _
                        ByVal vID As Variant, _
                        ByVal vDate As Variant, _
                        ByVal vCoord As Variant, _
                        ByVal vDescr As Variant, _
                        ByVal vDoc As Variant)
    Dim lr As ListRow
    Dim srcId As String
    Dim adminId As String

    srcId = CStr(vID)
    adminId = TM_GetUniqueAdminId(srcId)

    Set lr = idTable.ListRows.Add
    With lr.Range
        .Cells(1, 1).value = Now                 ' Дата/время
        .Cells(1, 2).value = TM_GetUserId()      ' Пользователь
        .Cells(1, 3).value = srcPath             ' Файл
        .Cells(1, 4).value = srcId               ' Имя_источник (ID из файла)
        .Cells(1, 5).value = adminId             ' Имя_админ (ID с суффиксами _v1,_v2,...)
        .Cells(1, 6).value = vDate               ' Дата ID
        .Cells(1, 7).value = vCoord              ' Координатор
        .Cells(1, 8).value = vDescr              ' Описание
        .Cells(1, 9).value = vDoc                ' Документация
    End With
End Sub


' ======================= ЖУРНАЛ (5 СТОЛБЦОВ) ЭТАПОВ =======================

Private Function TM_EnsureLogTable(ByVal ws As Worksheet) As ListObject
    Dim lo As ListObject

    On Error Resume Next
    Set lo = ws.ListObjects(TM_LOG_TABLE_NAME)
    On Error GoTo 0

    If lo Is Nothing Then
        With ws.Range("A1:E1")
            .Cells(1, 1).value = "Дата/время"
            .Cells(1, 2).value = "Пользователь"
            .Cells(1, 3).value = "Файл"
            .Cells(1, 4).value = "Имя_источник"
            .Cells(1, 5).value = "Имя_админ"
        End With

        Set lo = ws.ListObjects.Add( _
                    SourceType:=xlSrcRange, _
                    Source:=ws.Range("A1:E1"), _
                    XlListObjectHasHeaders:=xlYes)
        lo.Name = TM_LOG_TABLE_NAME
    End If

    Set TM_EnsureLogTable = lo
End Function


' ======================= АГРЕГИРОВАННАЯ ТАБЛИЦА ID (9 СТОЛБЦОВ) =======================

Private Function TM_EnsureIdTable(ByVal ws As Worksheet) As ListObject
    Dim lo As ListObject
    Dim hdr As Range

    On Error Resume Next
    Set lo = ws.ListObjects(TM_ID_TABLE_NAME)
    On Error GoTo 0

    If lo Is Nothing Then
        Set hdr = ws.Cells(1, TM_ID_FIRST_COL)  ' G1

        hdr.Offset(0, 0).value = "Дата/время"
        hdr.Offset(0, 1).value = "Пользователь"
        hdr.Offset(0, 2).value = "Файл"
        hdr.Offset(0, 3).value = "Имя_источник"
        hdr.Offset(0, 4).value = "Имя_админ"
        hdr.Offset(0, 5).value = "Дата ID"
        hdr.Offset(0, 6).value = "Координатор"
        hdr.Offset(0, 7).value = "Описание"
        hdr.Offset(0, 8).value = "Документация"

        Set lo = ws.ListObjects.Add( _
                    SourceType:=xlSrcRange, _
                    Source:=ws.Range(hdr, hdr.Offset(0, 8)), _
                    XlListObjectHasHeaders:=xlYes)
        lo.Name = TM_ID_TABLE_NAME
    End If

    Set TM_EnsureIdTable = lo
End Function


' ======================= РАСПОЛОЖЕНИЕ ТАБЛИЦ ЭТАПОВ =======================

Private Function TM_GetStageAnchor(ByVal ws As Worksheet, ByVal needCols As Long) As Range
    Dim lo        As ListObject
    Dim rightmost As Long
    Dim rc        As Long
    Dim startCol  As Long

    rightmost = 0

    For Each lo In ws.ListObjects
        If TM_IsStageTable(lo) Then
            rc = lo.Range.Column + lo.Range.Columns.Count - 1
            If rc > rightmost Then rightmost = rc
        End If
    Next lo

    If rightmost = 0 Then
        startCol = STAGE_FIRST_COL
    Else
        startCol = rightmost + 2    ' через один столбец от последнего
    End If

    Set TM_GetStageAnchor = ws.Cells(STAGE_TOP_ROW, startCol)
End Function


' ======================= УНИКАЛЬНОЕ ИМЯ ДЛЯ ТАБЛИЦ ЭТАПА =======================

Private Function TM_GetUniqueStageName(ByVal ws As Worksheet, ByVal baseName As String) As String
    Dim candidate As String
    Dim i         As Long

    ' базовое имя, если ещё не занято
    If Not TM_StageNameExists(ws, baseName) Then
        TM_GetUniqueStageName = baseName
        Exit Function
    End If

    ' Этап_1_v1, Этап_1_v2, ...
    For i = 1 To 1000
        candidate = baseName & "_v" & CStr(i)
        If Not TM_StageNameExists(ws, candidate) Then
            TM_GetUniqueStageName = candidate
            Exit Function
        End If
    Next i

    ' аварийный вариант, если сделать >1000 дублей
    TM_GetUniqueStageName = baseName & "_v" & Format$(Now, "yyyymmddHHNNSS")
End Function

Private Function TM_StageNameExists(ByVal ws As Worksheet, ByVal stageName As String) As Boolean
    Dim lo As ListObject
    For Each lo In ws.ListObjects
        If StrComp(lo.Name, stageName, vbTextCompare) = 0 Then
            TM_StageNameExists = True
            Exit Function
        End If
    Next lo
End Function


' ======================= ФИЛЬТР: ЭТАП ИЛИ СЛУЖЕБНЫЙ МУСОР =======================

Private Function TM_IsStageTable(ByVal lo As ListObject) As Boolean
    Dim nm As String
    nm = lo.Name

    If StrComp(Left$(nm, Len(STAGE_PREFIX)), STAGE_PREFIX, vbTextCompare) <> 0 Then Exit Function
    If TM_IsServiceStageName(nm) Then Exit Function

    TM_IsStageTable = True
End Function

Private Function TM_IsServiceStageName(ByVal stageName As String) As Boolean
    Dim nm As String
    nm = LCase$(Trim$(stageName))

    Select Case nm
        Case "этап", _
             "этап_уз", _
             "этап_совпадение", _
             "этап_поиск", _
             "этап_объединённые", _
             "этап_объединенные"
            TM_IsServiceStageName = True
        Case Else
            TM_IsServiceStageName = False
    End Select
End Function


' ======================= ЛИСТ Time_Machine И ПАПКА =======================

Private Function TM_GetSheet(ByRef wsTM As Worksheet) As Boolean
    On Error Resume Next
    Set wsTM = ThisWorkbook.Worksheets(TM_SHEET)
    On Error GoTo 0
    TM_GetSheet = Not wsTM Is Nothing
End Function

Private Function TM_GetRootFolder() As String
    Dim p As String

    If Len(Trim$(TM_ROOT_FOLDER)) > 0 Then
        p = TM_ROOT_FOLDER
    Else
        p = ThisWorkbook.Path    ' -> например C:\Users\i_dmitri_i\Admin
    End If

    TM_GetRootFolder = p
End Function


' ======================= ПОЛЬЗОВАТЕЛЬ (WIN/EXCEL) =======================

Private Function TM_GetUserId() As String
    Dim u As String
    On Error Resume Next
    u = Environ$("USERNAME")
    On Error GoTo 0

    If Len(Trim$(u)) = 0 Then
        u = Application.UserName
    End If

    TM_GetUserId = u
End Function


' ======================= УНИКАЛЬНЫЙ Имя_админ ДЛЯ ID =======================

Private Function TM_GetUniqueAdminId(ByVal srcId As String) As String
    Dim key As String
    Dim v As Long

    srcId = Trim$(srcId)
    If Len(srcId) = 0 Then
        srcId = "ID_пусто"
    End If

    key = LCase$(srcId)

    If gIdDict Is Nothing Then
        Set gIdDict = CreateObject("Scripting.Dictionary")
    End If

    If Not gIdDict.exists(key) Then
        gIdDict.Add key, 0
        TM_GetUniqueAdminId = srcId
        Exit Function
    End If

    v = CLng(gIdDict(key)) + 1
    gIdDict(key) = v

    TM_GetUniqueAdminId = srcId & "_v" & CStr(v)
End Function


' ======================= ВСПОМОГАТЕЛЬНОЕ: ИНДЕКС СТОЛБЦА ПО ИМЕНИ =======================

Private Function TM_ColumnIndexSafe(ByVal lo As ListObject, ByVal colName As String) As Long
    Dim lc As ListColumn
    For Each lc In lo.ListColumns
        If StrComp(Trim$(lc.Name), colName, vbTextCompare) = 0 Then
            TM_ColumnIndexSafe = lc.Index
            Exit Function
        End If
    Next lc
    TM_ColumnIndexSafe = 0
End Function


' ======================= ЛОГ В IMMEDIATE =======================

Private Sub TM_Dbg(ByVal msg As String)
    Debug.Print Format$(Now, "yyyy-mm-dd hh:nn:ss"); Space$(3); msg
End Sub


