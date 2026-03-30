Attribute VB_Name = "modCycling_Charts"
' ===========================
'  modCycling_Charts.bas
' ===========================
Option Explicit

' -------- ИМЕНА ОБЪЕКТОВ --------

' Таблица-агрегатор
Private Const CYCLING_TABLE_NAME      As String = "Этап_Cycling"

' Именованная ячейка – левый верхний угол области графиков SOH
Private Const CYCLING_ANCHOR_NAME     As String = "Графики_SOH"

' Имена графиков
Private Const CYCLING_CHART_SOH_NAME  As String = "cht_Cycling_SOH"
Private Const CYCLING_CHART_DCH_NAME  As String = "cht_Cycling_DCh"

' Имя триггерной ячейки SUBTOTAL, чтобы Worksheet_Calculate стрелял
Private Const CYCLING_TRIGGER_NAME    As String = "Cycling_RecalcTrigger"

' -------- РАЗМЕРЫ И ВНЕШНИЙ ВИД --------

' Базовые размеры каждого графика
Private Const CHART_BASE_WIDTH_POINTS   As Double = 800
Private Const CHART_BASE_HEIGHT_POINTS  As Double = 400
Private Const CHART_GAP_POINTS          As Double = 30   ' вертикальный зазор SOH–DCh

' Под легенду справа – график расширяется по мере роста числа серий
Private Const LEGEND_WIDTH_PER_SERIES   As Double = 14
Private Const LEGEND_EXTRA_MAX_POINTS   As Double = 350

' Насколько сжимаем PlotArea (чтобы легенда не лезла внутрь)
Private Const PLOT_RATIO_FEW            As Double = 0.8    ' до 10 серий
Private Const PLOT_RATIO_MID            As Double = 0.7    ' 10–20 серий
Private Const PLOT_RATIO_MANY           As Double = 0.6    ' 20+ серий

Private Const SERIES_FEW_MAX            As Long = 10
Private Const SERIES_MID_MAX            As Long = 20

' Левый отступ PlotArea (чтобы ось Y и заголовок не прилипали к краю)
Private Const PLOT_LEFT_MARGIN_POINTS   As Double = 40

' Шрифт подписей делений осей
Private Const AXIS_TICK_FONT_SIZE       As Long = 8


' ================= ПУБЛИЧНЫЕ ПРОЦЕДУРЫ =================

' Обновить графики по текущему фильтру/срезам Этап_Cycling.
' Вызывается из Worksheet_Calculate листа, на котором сейчас находится блок (таблица + Графики_SOH).
Public Sub Cycling_UpdateCharts_All(ByVal wsCaller As Worksheet)
    Dim nmAnchor   As Name
    Dim rngAnchor  As Range
    Dim wsAnchor   As Worksheet

    Dim lo         As ListObject

    Dim coSOH      As ChartObject
    Dim coDCh      As ChartObject

    Dim leftPos    As Double
    Dim topSOH     As Double
    Dim chartWidth As Double
    Dim chartHeight As Double
    Dim topDCh     As Double

    Dim seriesCount As Long
    Dim extraWidth  As Double
    Dim finalWidth  As Double

    On Error GoTo ExitSub

    ' 1) Находим именованную ячейку "Графики_SOH"
    On Error Resume Next
    Set nmAnchor = ThisWorkbook.names(CYCLING_ANCHOR_NAME)
    On Error GoTo ExitSub

    If nmAnchor Is Nothing Then GoTo ExitSub
    Set rngAnchor = nmAnchor.RefersToRange
    If rngAnchor Is Nothing Then GoTo ExitSub

    Set wsAnchor = rngAnchor.Worksheet

    ' Если якорь не на этом листе – для данного листа ничего не делаем
    If Not wsAnchor Is wsCaller Then GoTo ExitSub

    ' 2) Находим таблицу Этап_Cycling на том же листе
    Set lo = FindCyclingTableOnSheet(wsAnchor)
    If lo Is Nothing Then GoTo ExitSub
    If lo.DataBodyRange Is Nothing Then GoTo ExitSub

    ' 3) Координаты графиков – относительно Графики_SOH
    leftPos = rngAnchor.Left
    topSOH = rngAnchor.Top

    chartWidth = CHART_BASE_WIDTH_POINTS
    chartHeight = CHART_BASE_HEIGHT_POINTS
    topDCh = topSOH + chartHeight + CHART_GAP_POINTS

    ' 4) Создаём/позиционируем объекты графиков
    Set coSOH = GetOrCreateCyclingChart(wsAnchor, CYCLING_CHART_SOH_NAME, _
                                        leftPos, topSOH, chartWidth, chartHeight, True)

    Set coDCh = GetOrCreateCyclingChart(wsAnchor, CYCLING_CHART_DCH_NAME, _
                                        leftPos, topDCh, chartWidth, chartHeight, False)

    ' 5) Заполняем серии и считаем их количество
    seriesCount = 0
    BuildCyclingSeries lo, coDCh.Chart, coSOH.Chart, seriesCount

    ' 6) Расширяем ChartArea вправо под легенду
    extraWidth = LEGEND_WIDTH_PER_SERIES * CLng(seriesCount)
    If extraWidth > LEGEND_EXTRA_MAX_POINTS Then extraWidth = LEGEND_EXTRA_MAX_POINTS

    finalWidth = chartWidth + extraWidth
    If finalWidth < chartWidth Then finalWidth = chartWidth

    coSOH.Width = finalWidth
    coDCh.Width = finalWidth

    ' 7) Поджимаем PlotArea, чтобы легенда не залезала на линии
    AdjustCyclingPlotForLegend coSOH.Chart, seriesCount
    AdjustCyclingPlotForLegend coDCh.Chart, seriesCount

ExitSub:
    ' молчим, чтобы не мешать работе; ошибки ловим глухо
End Sub


' Создать/обновить триггерную ячейку SUBTOTAL над Графики_SOH.
' Важно: якорь и триггер должны переезжать вместе с блоком.
Public Sub EnsureCyclingRecalcTriggerOnSheet(ByVal wsCaller As Worksheet)
    Dim nmAnchor  As Name
    Dim rngAnchor As Range
    Dim wsAnchor  As Worksheet
    Dim trg       As Range
    Dim sep       As String

    On Error GoTo ExitSub

    On Error Resume Next
    Set nmAnchor = ThisWorkbook.names(CYCLING_ANCHOR_NAME)
    On Error GoTo ExitSub

    If nmAnchor Is Nothing Then GoTo ExitSub
    Set rngAnchor = nmAnchor.RefersToRange
    If rngAnchor Is Nothing Then GoTo ExitSub

    Set wsAnchor = rngAnchor.Worksheet
    If Not wsAnchor Is wsCaller Then GoTo ExitSub

    On Error Resume Next
    Set trg = wsAnchor.Range(CYCLING_TRIGGER_NAME)
    On Error GoTo ExitSub

    If trg Is Nothing Then
        ' триггер – ячейка над якорем; если вылезает за край, сдвигаем вправо
        Set trg = rngAnchor.Offset(-1, 0)
        If trg.Row < 1 Then Set trg = rngAnchor.Offset(0, 1)

        sep = Application.International(xlListSeparator)
        trg.formula = "=SUBTOTAL(3" & sep & CYCLING_TABLE_NAME & "[№])"

        ThisWorkbook.names.Add Name:=CYCLING_TRIGGER_NAME, refersTo:=trg
    End If

ExitSub:
End Sub


' ================= ПОИСК ТАБЛИЦЫ НА ЛИСТЕ =================

Private Function FindCyclingTableOnSheet(ByVal ws As Worksheet) As ListObject
    Dim lo As ListObject
    For Each lo In ws.ListObjects
        If StrComp(lo.Name, CYCLING_TABLE_NAME, vbTextCompare) = 0 _
           Or StrComp(lo.DisplayName, CYCLING_TABLE_NAME, vbTextCompare) = 0 Then
            Set FindCyclingTableOnSheet = lo
            Exit Function
        End If
    Next lo
End Function


' ================= ГРАФИКИ =================

Private Function GetOrCreateCyclingChart( _
        ByVal ws As Worksheet, _
        ByVal chartName As String, _
        ByVal leftPos As Double, _
        ByVal topPos As Double, _
        ByVal chartWidth As Double, _
        ByVal chartHeight As Double, _
        ByVal isSOH As Boolean) As ChartObject

    Dim co As ChartObject

    On Error Resume Next
    Set co = ws.ChartObjects(chartName)
    On Error GoTo 0

    If co Is Nothing Then
        Set co = ws.ChartObjects.Add(leftPos, topPos, chartWidth, chartHeight)
        co.Name = chartName
    Else
        co.Left = leftPos
        co.Top = topPos
        co.Width = chartWidth
        co.Height = chartHeight
    End If

    co.Placement = xlFreeFloating

    With co.Chart
        .ChartType = xlXYScatterLinesNoMarkers
        .HasLegend = True
        .Legend.Position = xlLegendPositionRight
        .HasTitle = True

        If isSOH Then
            .ChartTitle.text = "SOH, %"
        Else
            .ChartTitle.text = "DCh capacity, Ah"
        End If
    End With

    Set GetOrCreateCyclingChart = co
End Function


Private Sub AdjustCyclingPlotForLegend(ByVal ch As Chart, ByVal totalSeries As Long)
    Dim caW As Double
    Dim plotRatio As Double
    Dim innerRightPadding As Double

    If ch Is Nothing Then Exit Sub

    innerRightPadding = 10

    If totalSeries <= SERIES_FEW_MAX Then
        plotRatio = PLOT_RATIO_FEW
    ElseIf totalSeries <= SERIES_MID_MAX Then
        plotRatio = PLOT_RATIO_MID
    Else
        plotRatio = PLOT_RATIO_MANY
    End If

    On Error Resume Next
    caW = ch.ChartArea.Width

    With ch.PlotArea
        .Left = PLOT_LEFT_MARGIN_POINTS
        .Width = caW * plotRatio - PLOT_LEFT_MARGIN_POINTS - innerRightPadding
        If .Width < 50 Then .Width = 50
    End With

    On Error GoTo 0
End Sub


' ================= СБОР СЕРИЙ =================

Private Sub BuildCyclingSeries( _
        ByVal lo As ListObject, _
        ByVal chDCh As Chart, _
        ByVal chSOH As Chart, _
        ByRef totalSeries As Long)

    Dim dict As Object          ' ключ: Тип|Серия|C, значение: Collection из Array(№, DCh, SOH)
    Dim dictName As Object      ' ключ: тот же, значение: подпись серии

    Dim dataRng As Range
    Dim arrData As Variant
    Dim rowCount As Long
    Dim r As Long

    Dim idxType As Long, idxSeries As Long, idxC As Long
    Dim idxNum As Long, idxDChg As Long, idxSOH As Long

    Dim key As String
    Dim valType As String, valSeries As String, valC As String
    Dim valNum As Variant, valDChg As Variant, valSOH As Variant

    Dim k As Variant
    Dim col As Collection
    Dim i As Long
    Dim arrX() As Double, arrCap() As Double, arrSOH() As Double
    Dim rec As Variant
    Dim hasSOH As Boolean

    Dim visibleRows As Long
    Dim maxXNum As Double

    totalSeries = 0

    idxType = GetCyclingColumnIndex(lo, "Тип")
    idxSeries = GetCyclingColumnIndex(lo, "Серия")
    idxC = GetCyclingColumnIndex(lo, "C")
    idxNum = GetCyclingColumnIndex(lo, "№")
    idxDChg = GetCyclingColumnIndex(lo, "DChg. Cap.(Ah)")
    idxSOH = GetCyclingColumnIndex(lo, "SOH")        ' поймает и "SOH, %"

    If idxType = 0 Or idxSeries = 0 Or idxC = 0 _
       Or idxNum = 0 Or idxDChg = 0 Then
        Exit Sub
    End If

    Set dataRng = lo.DataBodyRange
    If dataRng Is Nothing Then Exit Sub

    arrData = dataRng.value
    rowCount = UBound(arrData, 1)

    Set dict = CreateObject("Scripting.Dictionary")
    Set dictName = CreateObject("Scripting.Dictionary")

    visibleRows = 0
    maxXNum = 0

    For r = 1 To rowCount
        If Not dataRng.rows(r).EntireRow.Hidden Then

            visibleRows = visibleRows + 1

            valType = CStr(arrData(r, idxType))
            valSeries = CStr(arrData(r, idxSeries))
            valC = CStr(arrData(r, idxC))

            valNum = arrData(r, idxNum)
            valDChg = arrData(r, idxDChg)

            If idxSOH > 0 Then
                valSOH = arrData(r, idxSOH)
            Else
                valSOH = Empty
            End If

            If IsNumeric(valNum) And IsNumeric(valDChg) Then

                key = valType & "|" & valSeries & "|" & valC

                If Not dict.exists(key) Then
                    Set dict(key) = New Collection
                    dictName(key) = valSeries & " | " & valC      ' подпись серии
                End If

                If CDbl(valNum) > maxXNum Then maxXNum = CDbl(valNum)

                dict(key).Add Array(CDbl(valNum), CDbl(valDChg), valSOH)
            End If
        End If
    Next r

    While chDCh.SeriesCollection.Count > 0
        chDCh.SeriesCollection(1).Delete
    Wend

    While chSOH.SeriesCollection.Count > 0
        chSOH.SeriesCollection(1).Delete
    Wend

    If visibleRows = 0 Or maxXNum <= 0 Then Exit Sub

    For Each k In dict.Keys
        Set col = dict(k)

        If col.Count > 0 Then
            ReDim arrX(1 To col.Count)
            ReDim arrCap(1 To col.Count)
            ReDim arrSOH(1 To col.Count)

            hasSOH = False

            For i = 1 To col.Count
                rec = col(i)

                arrX(i) = CDbl(rec(0))
                arrCap(i) = CDbl(rec(1))

                If idxSOH > 0 And IsNumeric(rec(2)) Then
                    arrSOH(i) = CDbl(rec(2))
                    hasSOH = True
                Else
                    arrSOH(i) = 0
                End If
            Next i

            ' DCh capacity, Ah
            With chDCh.SeriesCollection.NewSeries
                .Name = CStr(dictName(k))
                .XValues = arrX
                .Values = arrCap
            End With

            totalSeries = totalSeries + 1

            ' SOH, % (если есть числовые значения)
            If idxSOH > 0 And hasSOH Then
                With chSOH.SeriesCollection.NewSeries
                    .Name = CStr(dictName(k))
                    .XValues = arrX
                    .Values = arrSOH
                End With
            End If
        End If
    Next k

    ConfigureCyclingAxes chDCh, chSOH, maxXNum
End Sub


Private Sub ConfigureCyclingAxes( _
        ByVal chDCh As Chart, _
        ByVal chSOH As Chart, _
        ByVal maxX As Double)

    Dim majorX As Double
    Dim gl As Gridlines

    If maxX <= 0 Then Exit Sub

    Select Case True
        Case maxX <= 20
            majorX = 1
        Case maxX <= 50
            majorX = 5
        Case maxX <= 100
            majorX = 10
        Case maxX <= 500
            majorX = 50
        Case maxX <= 1000
            majorX = 100
        Case Else
            majorX = 10 ^ (Int(Log(maxX / 10) / Log(10)))
    End Select
    If majorX <= 0 Then majorX = 1

    On Error Resume Next

    With chDCh.Axes(xlCategory)
        .MinimumScaleIsAuto = False
        .MaximumScaleIsAuto = False
        .MinimumScale = 1
        .MaximumScale = maxX
        .MajorUnit = majorX
        .HasTitle = True
        .AxisTitle.Caption = "Cycle number"
        .HasMajorGridlines = True
        .TickLabels.Font.Size = AXIS_TICK_FONT_SIZE
    End With

    With chSOH.Axes(xlCategory)
        .MinimumScaleIsAuto = False
        .MaximumScaleIsAuto = False
        .MinimumScale = 1
        .MaximumScale = maxX
        .MajorUnit = majorX
        .HasTitle = True
        .AxisTitle.Caption = "Cycle number"
        .HasMajorGridlines = True
        .TickLabels.Font.Size = AXIS_TICK_FONT_SIZE
    End With

    With chDCh.Axes(xlValue)
        .HasTitle = True
        .AxisTitle.Caption = "DCh capacity, Ah"
        .HasMajorGridlines = True
        .TickLabels.Font.Size = AXIS_TICK_FONT_SIZE
        Set gl = .MajorGridlines
        If Not gl Is Nothing Then
            gl.Format.Line.ForeColor.RGB = RGB(220, 220, 220)
        End If
    End With

    If chSOH.SeriesCollection.Count > 0 Then
        With chSOH.Axes(xlValue)
            .HasTitle = True
            .AxisTitle.Caption = "SOH, %"
            .HasMajorGridlines = True
            .TickLabels.Font.Size = AXIS_TICK_FONT_SIZE
            Set gl = .MajorGridlines
            If Not gl Is Nothing Then
                gl.Format.Line.ForeColor.RGB = RGB(220, 220, 220)
            End If
        End With
    End If

    Set gl = chDCh.Axes(xlCategory).MajorGridlines
    If Not gl Is Nothing Then
        gl.Format.Line.ForeColor.RGB = RGB(245, 245, 245)
    End If

    Set gl = chSOH.Axes(xlCategory).MajorGridlines
    If Not gl Is Nothing Then
        gl.Format.Line.ForeColor.RGB = RGB(245, 245, 245)
    End If

    On Error GoTo 0
End Sub


Private Function GetCyclingColumnIndex(ByVal lo As ListObject, ByVal headerName As String) As Long
    Dim lc As ListColumn
    Dim Target As String
    Dim nameClean As String

    Target = LCase$(headerName)

    For Each lc In lo.ListColumns
        nameClean = LCase$(CStr(lc.Name))

        If StrComp(nameClean, Target, vbTextCompare) = 0 _
           Or InStr(1, nameClean, Target, vbTextCompare) > 0 Then

            GetCyclingColumnIndex = lc.Index
            Exit Function
        End If
    Next lc

    GetCyclingColumnIndex = 0
End Function


