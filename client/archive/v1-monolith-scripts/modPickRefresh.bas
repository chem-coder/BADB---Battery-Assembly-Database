Attribute VB_Name = "modPickRefresh"
' === modPickRefresh ===
' Автообновление запроса/таблицы Отбор_Этапов
' по изменению значения в именованной ячейке "Этап_Поиск".

Option Explicit

Private Const NAME_STAGE_SEARCH As String = "Этап_Поиск"    ' ИМЕНОВАННАЯ ЯЧЕЙКА
Private Const PICK_TABLE_NAME   As String = "Отбор_Этапов"  ' Имя таблицы (ListObject)
Private Const PICK_QUERY_NAME   As String = "Отбор_Этапов"  ' Имя запроса / соединения

' Вход из Workbook_SheetChange.
Public Sub HandleSheetChange(ByVal Sh As Object, ByVal Target As Range)
    Dim nm  As Name
    Dim rng As Range

    If Target Is Nothing Then Exit Sub

    ' Находим именованный диапазон Этап_Поиск
    On Error Resume Next
    Set nm = ThisWorkbook.names(NAME_STAGE_SEARCH)
    On Error GoTo 0
    If nm Is Nothing Then Exit Sub

    On Error Resume Next
    Set rng = nm.RefersToRange
    On Error GoTo 0
    If rng Is Nothing Then Exit Sub

    ' Проверяем пересечение
    If Application.Intersect(Target, rng) Is Nothing Then Exit Sub

    ' Если здесь — реально менялась Этап_Поиск
    RefreshPickOnly
End Sub

' Публичный рефреш — обновляем только Отбор_Этапов
Public Sub RefreshPickOnly()
    Dim oldEvents As Boolean
    Dim oldAlerts As Boolean
    Dim oldCalc   As XlCalculation

    On Error GoTo CleanExit

    oldEvents = Application.EnableEvents
    oldAlerts = Application.DisplayAlerts
    oldCalc = Application.Calculation

    Application.EnableEvents = False
    Application.DisplayAlerts = False
    Application.Calculation = xlCalculationManual

    ' 1) Пытаемся найти таблицу с загрузкой запроса
    If Not RefreshByListObjectName(PICK_TABLE_NAME) Then
        If Not RefreshByListObjectName(PICK_QUERY_NAME) Then
            ' 2) Если таблица не найдена — пробуем по соединению
            RefreshByConnectionSubstring PICK_QUERY_NAME
        End If
    End If

CleanExit:
    On Error Resume Next
    Application.Calculation = oldCalc
    Application.DisplayAlerts = oldAlerts
    Application.EnableEvents = oldEvents
End Sub

' --- Внутреннее: рефреш по имени таблицы ---
Private Function RefreshByListObjectName(ByVal tableName As String) As Boolean
    Dim ws As Worksheet
    Dim lo As ListObject

    If Len(tableName) = 0 Then Exit Function

    On Error GoTo ExitFn
    For Each ws In ThisWorkbook.Worksheets
        For Each lo In ws.ListObjects
            If StrComp(lo.Name, tableName, vbTextCompare) = 0 _
               Or StrComp(lo.DisplayName, tableName, vbTextCompare) = 0 Then

                If Not lo.QueryTable Is Nothing Then
                    lo.QueryTable.Refresh BackgroundQuery:=False
                End If

                RefreshByListObjectName = True
                Exit Function
            End If
        Next lo
    Next ws

ExitFn:
End Function

' --- Внутреннее: рефреш по подстроке в имени соединения ---
Private Function RefreshByConnectionSubstring(ByVal needle As String) As Boolean
    Dim cn As WorkbookConnection

    If Len(needle) = 0 Then Exit Function

    On Error GoTo ExitFn
    For Each cn In ThisWorkbook.Connections
        If InStr(1, cn.Name, needle, vbTextCompare) > 0 Then
            On Error Resume Next
            cn.OLEDBConnection.BackgroundQuery = False
            cn.ODBCConnection.BackgroundQuery = False
            On Error GoTo 0

            cn.Refresh
            RefreshByConnectionSubstring = True
            Exit Function
        End If
    Next cn

ExitFn:
End Function


