Attribute VB_Name = "modƒорожна€ артаѕодсветка"
' ===========================
'  modƒорожна€ артаѕодсветка.bas
' ===========================
Option Explicit

Private Const FIRST_DATA_ROW As Long = 19   ' ниже этой строки подсветка работает

' состо€ние последней подсвеченной строки
Private mLastSheetName As String
Private mLastTableName As String
Private mLastRowIndex  As Long
Private mPrevLineStyle() As Variant
Private mPrevColor()     As Variant
Private mPrevWeight()    As Variant
Private mHasPrev         As Boolean

' ---------- лог в Immediate ----------
Private Sub Dbg(ByVal msg As String)
    Debug.Print Format$(Now, "hh:nn:ss"), " [ƒ ] "; msg
End Sub

' ---------- фиксаци€ шапки при активации ----------
Public Sub DK_Activate(ByVal ws As Worksheet)
    Dim wnd As Window
    On Error Resume Next
    Set wnd = ActiveWindow
    On Error GoTo 0
    If wnd Is Nothing Then Exit Sub

    With wnd
        .FreezePanes = False
        .SplitColumn = 0
        .SplitRow = FIRST_DATA_ROW - 1   ' первые 18 строк Ч шапка
        .FreezePanes = True
    End With
End Sub

' ---------- основна€ логика подсветки ----------
Public Sub DK_SelectionChange(ByVal ws As Worksheet, ByVal Target As Range)
    On Error GoTo SafeExit

    If Not Application.EnableEvents Then Exit Sub
    If Target Is Nothing Then Exit Sub
    If Target.CountLarge <> 1 Then Exit Sub   ' только одна €чейка

    Dbg "SelectionChange: sheet=" & ws.Name & _
        " Target=" & Target.Address(0, 0) & " Row=" & Target.Row

    Dim loHit As ListObject

    ' быстрый поиск по Target.ListObject
    On Error Resume Next
    Set loHit = Target.ListObject
    On Error GoTo 0

    ' не в таблице
    If loHit Is Nothing Then
        RestorePreviousRow
        GoTo SafeExit
    End If

    ' таблица, но не Ётап_*
    If Left$(loHit.Name, 5) <> "Ётап_" Then
        RestorePreviousRow
        GoTo SafeExit
    End If

    ' до FIRST_DATA_ROW подсветка не нужна
    If Target.Row < FIRST_DATA_ROW Then
        RestorePreviousRow
        GoTo SafeExit
    End If

    If loHit.DataBodyRange Is Nothing Then
        RestorePreviousRow
        GoTo SafeExit
    End If

    Dim rowIndex As Long
    rowIndex = Target.Row - loHit.DataBodyRange.Row + 1

    If rowIndex < 1 Or rowIndex > loHit.DataBodyRange.rows.Count Then
        RestorePreviousRow
        GoTo SafeExit
    End If

    ' если остались в той же строке той же таблицы Ч ничего не делаем
    If mHasPrev Then
        If mLastSheetName = ws.Name _
           And mLastTableName = loHit.Name _
           And mLastRowIndex = rowIndex Then GoTo SafeExit
    End If

    ' 1) сн€ть старую подсветку
    RestorePreviousRow

    ' 2) подсветить новую строку
    HighlightTableRow ws, loHit, rowIndex

SafeExit:
End Sub

' ---------- подсветить строку rowIndex в таблице lo ----------
Private Sub HighlightTableRow(ByVal ws As Worksheet, ByVal lo As ListObject, ByVal rowIndex As Long)
    Dim rng As Range
    Dim cols As Long
    Dim c As Long

    If lo.DataBodyRange Is Nothing Then Exit Sub

    Set rng = lo.DataBodyRange.rows(rowIndex)   ' вс€ строка внутри таблицы
    cols = rng.Columns.Count

    Dbg "HighlightTableRow: sheet=" & ws.Name & _
        " table=" & lo.Name & " rowIndex=" & rowIndex & _
        " range=" & rng.Address(0, 0)

    mLastSheetName = ws.Name
    mLastTableName = lo.Name
    mLastRowIndex = rowIndex
    mHasPrev = True

    ReDim mPrevLineStyle(1 To cols)
    ReDim mPrevColor(1 To cols)
    ReDim mPrevWeight(1 To cols)

    For c = 1 To cols
        With rng.Cells(1, c).Borders(xlEdgeBottom)
            mPrevLineStyle(c) = .LineStyle
            mPrevColor(c) = .Color
            mPrevWeight(c) = .Weight

            On Error Resume Next
            .LineStyle = xlDouble            ' двойное подчЄркивание
            If Err.Number <> 0 Then
                Err.Clear
                .LineStyle = xlContinuous     ' fallback: если xlDouble не зашЄл
                .Weight = xlThick
            End If
            .Color = vbBlack
            On Error GoTo 0
        End With
    Next c
End Sub

' ---------- восстановить предыдущую подсвеченную строку ----------
Private Sub RestorePreviousRow()
    Dim ws As Worksheet
    Dim lo As ListObject
    Dim rng As Range
    Dim cols As Long
    Dim maxCols As Long
    Dim c As Long
    Dim limit As Long

    If Not mHasPrev Then Exit Sub
    If mLastSheetName = "" Or mLastTableName = "" Or mLastRowIndex <= 0 Then GoTo CLR_STATE

    ' лист мог быть переименован/удалЄн
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(mLastSheetName)
    On Error GoTo 0
    If ws Is Nothing Then GoTo CLR_STATE

    ' таблицу могли увести/удалить
    On Error Resume Next
    Set lo = ws.ListObjects(mLastTableName)
    On Error GoTo 0
    If lo Is Nothing Then GoTo CLR_STATE
    If lo.DataBodyRange Is Nothing Then GoTo CLR_STATE
    If mLastRowIndex > lo.DataBodyRange.rows.Count Then GoTo CLR_STATE

    Set rng = lo.DataBodyRange.rows(mLastRowIndex)
    cols = rng.Columns.Count

    On Error Resume Next
    maxCols = UBound(mPrevLineStyle)
    On Error GoTo 0
    If maxCols = 0 Then GoTo CLR_STATE

    limit = IIf(cols < maxCols, cols, maxCols)

    Dbg "RestorePreviousRow: sheet=" & ws.Name & _
        " table=" & lo.Name & " rowIndex=" & mLastRowIndex & _
        " range=" & rng.Address(0, 0)

    On Error Resume Next
    For c = 1 To limit
        With rng.Cells(1, c).Borders(xlEdgeBottom)
            .LineStyle = mPrevLineStyle(c)
            .Color = mPrevColor(c)
            .Weight = mPrevWeight(c)
        End With
    Next c
    On Error GoTo 0

CLR_STATE:
    mHasPrev = False
    mLastSheetName = ""
    mLastTableName = ""
    mLastRowIndex = 0
End Sub

' ---------- публичный сброс дл€ других модулей ----------
Public Sub ResetRowHighlight_Public()
    RestorePreviousRow
End Sub


