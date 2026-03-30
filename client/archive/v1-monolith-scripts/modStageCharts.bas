Attribute VB_Name = "modStageCharts"
'=== modStageCharts ===
Option Explicit

' --- Настройки / константы ---

' Все таблицы-этапы: имя начинается с "Этап_"
Private Const STAGE_PREFIX          As String = "Этап_"

' Имена столбцов внутри таблицы
Private Const COL_SERIES_NAME       As String = "Серия"
Private Const COL_FLAG_NAME         As String = "График"

' Столбцы для построения графика:
'   X – по оси X (обычно "№", "Дата и время" и т.п.)
'   Y – по оси Y (основной параметр)
' ОБЯЗАТЕЛЬНО поправь под свою таблицу.
Private Const COL_X_NAME            As String = "№"
Private Const COL_Y_NAME            As String = "Значение"

' Имя шаблонного графика на листе (ChartObject),
' который настроен как надо и из которого будут клонироваться остальные.
Private Const TEMPLATE_CHART_NAME   As String = "Шаблон_Графика_Серии"

' Префикс имён создаваемых графиков:
'   chSeries_Этап_Нанесение_Серия1
Private Const CHART_NAME_PREFIX     As String = "chSeries_"

' Размеры создаваемых графиков (можно менять)
Private Const CHART_WIDTH           As Double = 280
Private Const CHART_HEIGHT          As Double = 160

' ================= ПУБЛИЧНЫЙ ИНТЕРФЕЙС =================

' Вызывать из Workbook_SheetChange:
' реагирует на изменение столбца "График" в таблицах Этап_*
Public Sub HandleStageChartChange(ByVal ws As Worksheet, ByVal Target As Range)
    Dim lo As ListObject
    Dim flagCol As ListColumn
    Dim hit As Range
    Dim cell As Range

    If ws Is Nothing Then Exit Sub
    If Target Is Nothing Then Exit Sub

    For Each lo In ws.ListObjects
        ' Только таблицы-этапы
        If Left$(lo.Name, Len(STAGE_PREFIX)) = STAGE_PREFIX Then
            On Error Resume Next
            Set flagCol = lo.ListColumns(COL_FLAG_NAME)
            On Error GoTo 0
            If Not flagCol Is Nothing Then
                On Error Resume Next
                Set hit = Application.Intersect(Target, flagCol.DataBodyRange)
                On Error GoTo 0
                If Not hit Is Nothing Then
                    For Each cell In hit.Cells
                        UpdateChartForFlagCell lo, cell
                    Next cell
                End If
            End If
        End If
        Set flagCol = Nothing
        Set hit = Nothing
    Next lo
End Sub

' Очистить ВСЕ флажки "График" и удалить ВСЕ графики,
' связанные с указанной таблицей (по её объекту).
Public Sub ClearChartsAndFlagsForTable(ByVal lo As ListObject)
    Dim ws As Worksheet
    Dim flagCol As ListColumn
    Dim co As ChartObject
    Dim prefix As String

    If lo Is Nothing Then Exit Sub
    Set ws = lo.Parent

    On Error Resume Next
    Set flagCol = lo.ListColumns(COL_FLAG_NAME)
    On Error GoTo 0

    Application.EnableEvents = False
    On Error Resume Next

    ' 1) Сбрасываем все флажки в столбце "График"
    If Not flagCol Is Nothing Then
        flagCol.DataBodyRange.ClearContents
    End If

    ' 2) Удаляем все графики, связанные с этой таблицей
    prefix = CHART_NAME_PREFIX & lo.Name & "_"
    For Each co In ws.ChartObjects
        If Left$(co.Name, Len(prefix)) = prefix Then
            co.Delete
        End If
    Next co

    On Error GoTo 0
    Application.EnableEvents = True
End Sub

' Удобный вариант: очистить по имени листа и имени таблицы
Public Sub ClearChartsAndFlagsForTableByName( _
    ByVal sheetName As String, _
    ByVal tableName As String _
)
    Dim ws As Worksheet
    Dim lo As ListObject

    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(sheetName)
    If ws Is Nothing Then Exit Sub

    Set lo = ws.ListObjects(tableName)
    On Error GoTo 0
    If lo Is Nothing Then Exit Sub

    ClearChartsAndFlagsForTable lo
End Sub

' ================= ВНУТРЕННЕЕ: обновление / удаление графика =================

' Обработать одну изменённую ячейку флажка "График"
Private Sub UpdateChartForFlagCell(ByVal lo As ListObject, ByVal flagCell As Range)
    Dim ws As Worksheet
    Dim rowIndex As Long
    Dim idxSeries As Long
    Dim seriesValue As Variant

    If lo Is Nothing Then Exit Sub
    If flagCell Is Nothing Then Exit Sub

    Set ws = lo.Parent

    ' Относительный индекс строки в DataBodyRange (1..N)
    rowIndex = flagCell.Row - lo.DataBodyRange.Row + 1
    If rowIndex < 1 Or rowIndex > lo.DataBodyRange.rows.Count Then Exit Sub

    On Error Resume Next
    idxSeries = lo.ListColumns(COL_SERIES_NAME).Index
    On Error GoTo 0
    If idxSeries <= 0 Then Exit Sub

    seriesValue = lo.DataBodyRange.Cells(rowIndex, idxSeries).value

    ' Если серия не задана — просто не строим график
    If Trim$(CStr(seriesValue)) = "" Then
        DeleteChartForSeries lo, CStr(seriesValue)
        Exit Sub
    End If

    ' Проверяем значение флажка:
    ' пусто / 0 / FALSE => график удаляем
    If IsEmpty(flagCell.value) _
       Or flagCell.value = 0 _
       Or flagCell.value = False Then

        DeleteChartForSeries lo, CStr(seriesValue)
        Exit Sub
    End If

    ' Иначе создаём/обновляем график для этой Серии
    CreateOrUpdateChartForSeries lo, CStr(seriesValue), rowIndex
End Sub

' Создать или обновить график для конкретной Серии
Private Sub CreateOrUpdateChartForSeries( _
    ByVal lo As ListObject, _
    ByVal seriesKey As String, _
    ByVal rowIndex As Long _
)
    Dim ws As Worksheet
    Dim co As ChartObject
    Dim tmpl As ChartObject
    Dim chartName As String

    Dim idxSeries As Long, idxX As Long, idxY As Long
    Dim r As Long
    Dim dataRngX As Range, dataRngY As Range
    Dim xCell As Range, yCell As Range
    Dim rowCell As Range
    Dim s As Series

    If lo Is Nothing Then Exit Sub
    If seriesKey = "" Then Exit Sub

    Set ws = lo.Parent
    chartName = BuildChartName(lo, seriesKey)

    ' Пытаемся найти уже существующий график
    On Error Resume Next
    Set co = ws.ChartObjects(chartName)
    On Error GoTo 0

    ' Если нет — клонируем шаблон
    If co Is Nothing Then
        On Error Resume Next
        Set tmpl = ws.ChartObjects(TEMPLATE_CHART_NAME)
        On Error GoTo 0

        If tmpl Is Nothing Then
            ' Нет шаблона — ничего не делаем
            Exit Sub
        End If

        tmpl.Copy
        ws.Paste
        Set co = ws.ChartObjects(ws.ChartObjects.Count)
        co.Name = chartName
    End If

    ' Находим индексы нужных столбцов
    On Error Resume Next
    idxSeries = lo.ListColumns(COL_SERIES_NAME).Index
    idxX = lo.ListColumns(COL_X_NAME).Index
    idxY = lo.ListColumns(COL_Y_NAME).Index
    On Error GoTo 0

    If idxSeries <= 0 Or idxX <= 0 Or idxY <= 0 Then Exit Sub

    ' Собираем диапазоны X и Y для всех строк с этой Серией
    For r = 1 To lo.DataBodyRange.rows.Count
        If CStr(lo.DataBodyRange.Cells(r, idxSeries).value) = seriesKey Then
            Set xCell = lo.DataBodyRange.Cells(r, idxX)
            Set yCell = lo.DataBodyRange.Cells(r, idxY)

            If dataRngX Is Nothing Then
                Set dataRngX = xCell
                Set dataRngY = yCell
            Else
                Set dataRngX = Application.Union(dataRngX, xCell)
                Set dataRngY = Application.Union(dataRngY, yCell)
            End If
        End If
    Next r

    If dataRngX Is Nothing Or dataRngY Is Nothing Then Exit Sub

    ' Позиционируем график "справа от строки" (можно подправить логику)
    Set rowCell = lo.DataBodyRange.rows(rowIndex).Cells(lo.ListColumns.Count)

    With co
        .Left = rowCell.Offset(0, 1).Left
        .Top = rowCell.Top
        .Width = CHART_WIDTH
        .Height = CHART_HEIGHT
    End With

    ' Обновляем серии
    With co.Chart
        ' чистим старые
        Do While .SeriesCollection.Count > 0
            .SeriesCollection(1).Delete
        Loop

        Set s = .SeriesCollection.NewSeries
        s.Name = lo.Name & " / " & seriesKey
        s.XValues = dataRngX
        s.Values = dataRngY
    End With
End Sub

' Удалить график для указанной Серии
Private Sub DeleteChartForSeries(ByVal lo As ListObject, ByVal seriesKey As String)
    Dim ws As Worksheet
    Dim chartName As String

    If lo Is Nothing Then Exit Sub
    Set ws = lo.Parent

    chartName = BuildChartName(lo, seriesKey)

    On Error Resume Next
    ws.ChartObjects(chartName).Delete
    On Error GoTo 0
End Sub

' ================= ВСПОМОГАТЕЛЬНОЕ =================

' Построить имя графика по таблице и значению Серии
Private Function BuildChartName(ByVal lo As ListObject, ByVal seriesKey As String) As String
    BuildChartName = CHART_NAME_PREFIX & lo.Name & "_" & CleanKey(seriesKey)
End Function

' Очистить ключ (Серия) для использования в имени объекта
Private Function CleanKey(ByVal s As String) As String
    Dim i As Long
    Dim ch As String
    Dim res As String

    s = CStr(s)
    res = ""

    For i = 1 To Len(s)
        ch = Mid$(s, i, 1)

        ' Разрешаем цифры, латиницу и кириллицу + "_"
        If ch Like "[0-9A-Za-zА-Яа-я_]" Then
            res = res & ch
        ElseIf ch = " " Or ch = "-" Then
            res = res & "_"
        Else
            ' игнорируем прочие символы
        End If
    Next i

    If res = "" Then res = "Series"
    CleanKey = res
End Function


